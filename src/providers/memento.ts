import { $fetch } from "ofetch";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveResponse,
  ArchivedPage,
} from "../types";
import type { MementoOptions } from "../_providers";
import {
  createContentErrorResponse,
  createContentResponse,
  createErrorResponse,
  createSuccessResponse,
  fetchBody,
  type FetchedBody,
  preferSameUrl,
  resolveRequestedTimestamp,
  selectCapture,
  toWaybackTimestamp,
  unwrapSnapshotUrl,
  waybackTimestampToISO,
} from "../utils";
import { BaseProvider } from "./base-provider";

const DEFAULT_BASE_URL = "https://memgator.cs.odu.edu";
/** Keeps ordinary clock skew while dropping captures dated years in the future. */
const MAX_CAPTURE_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

interface JsonTimeMapMemento {
  datetime: string;
  uri: string;
}

interface ParsedTimeMap {
  originalUri: string;
  mementos: JsonTimeMapMemento[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFound(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error["status"] === 404 || error["statusCode"] === 404;
}

function normalizedHostname(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function isLocalDevelopmentHostname(value: string): boolean {
  const hostname = normalizedHostname(value);
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1") {
    return true;
  }
  const octets = hostname.split(".").map((part) => Number(part));
  return (
    octets.length === 4 &&
    octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    octets[0] === 127
  );
}

function isUnsafeHostname(value: string): boolean {
  const hostname = normalizedHostname(value);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return true;
  }

  if (hostname.includes(":")) {
    if (hostname === "::" || hostname === "::1" || hostname.startsWith("::ffff:")) return true;
    const firstHextet = hostname.split(":", 1)[0];
    return !/^[23][\da-f]{3}$/i.test(firstHextet);
  }

  const octets = hostname.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isSafeMementoURL(url: URL): boolean {
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username &&
    !url.password &&
    !isUnsafeHostname(url.hostname)
  );
}

function assertSafePlaybackURL(url: URL, localOrigin?: string): void {
  const allowedLocal =
    localOrigin === url.origin &&
    isLocalDevelopmentHostname(url.hostname) &&
    !url.username &&
    !url.password;
  if (!isSafeMementoURL(url) && !allowedLocal) {
    throw new Error("Memento playback must use a public HTTP or HTTPS host");
  }
}

/** Memento JSON TimeMaps through ODU MemGator, replacing the discontinued Time Travel aggregator. */
export class MementoProvider extends BaseProvider<MementoOptions> {
  readonly name = "Memento (MemGator)";
  readonly slug = "memento";

  /** Separates aggregators and caps while redacting invalid URLs before cache lookup. */
  override cacheKey(options?: MementoOptions): string {
    const rawBaseURL = options?.baseUrl ?? this.options.baseUrl ?? DEFAULT_BASE_URL;
    let baseURL = rawBaseURL;
    try {
      baseURL = this.baseURL({ baseUrl: rawBaseURL });
    } catch {
      baseURL = "invalid";
    }
    const limit = options?.limit === undefined ? this.options.limit : undefined;
    const parts = [`baseUrl=${encodeURIComponent(baseURL)}`];
    if (limit !== undefined) parts.push(`limit=${limit}`);
    return parts.join(":");
  }

  /** Fetches the aggregated JSON TimeMap for one exact original URL. */
  async snapshots(domain: string, reqOptions: MementoOptions = {}): Promise<ArchiveResponse> {
    let target: string | undefined;
    try {
      const options = await this.resolveOptions(reqOptions);
      target = this.originalURL(domain);
      const { pages } = await this.fetchTimeMap(target, options);
      const limitedPages =
        typeof options.limit === "number" ? pages.slice(0, Math.max(0, options.limit)) : pages;

      return createSuccessResponse(limitedPages, "memento", {
        target,
        aggregator: this.baseURL(options),
        empty: limitedPages.length === 0,
      });
    } catch (error) {
      return createErrorResponse(error, "memento", target ? { target } : {});
    }
  }

  /** Reads the selected Memento URI directly, with negotiation through MemGator only as fallback. */
  override async content(
    url: string,
    reqOptions: Partial<MementoOptions> & ArchiveContentOptions = {},
  ): Promise<ArchiveContentResponse> {
    try {
      const options = await this.resolveContentOptions(reqOptions);
      const unwrapped = unwrapSnapshotUrl(url);
      const target = this.originalURL(unwrapped.url);
      const wanted = resolveRequestedTimestamp(options.timestamp ?? unwrapped.timestamp);
      const { pages } = await this.fetchTimeMap(target, options);
      const captures = pages.map((page) => ({
        page,
        original: page.url,
        timestamp: toWaybackTimestamp(page.timestamp),
      }));
      const capture = selectCapture(
        preferSameUrl(captures, target, (candidate) => candidate.original),
        wanted,
      );
      if (!capture) {
        return createContentErrorResponse(
          `No Memento capture for ${target}${wanted ? ` near ${wanted}` : ""}`,
          "memento",
          { requestedTimestamp: wanted || undefined },
        );
      }

      const baseURL = this.baseURL(options);
      const aggregator = new URL(baseURL);
      const localAggregatorOrigin = isLocalDevelopmentHostname(aggregator.hostname)
        ? aggregator.origin
        : undefined;
      let proxyFallback = false;
      let body: FetchedBody;
      try {
        const snapshot = this.rawSnapshotURL(capture.page.snapshot);
        body = await fetchBody(snapshot.origin, `${snapshot.pathname}${snapshot.search}`, options, {
          assertURL: (candidate) => assertSafePlaybackURL(candidate),
        });
        if (!body.capturedAt) {
          throw new Error("Direct Memento playback did not identify its capture time");
        }
      } catch {
        proxyFallback = true;
        body = await fetchBody(
          baseURL,
          `/memento/proxy/${capture.timestamp}/${encodeURIComponent(capture.page.url)}`,
          options,
          {
            assertURL: (candidate) => assertSafePlaybackURL(candidate, localAggregatorOrigin),
          },
        );
      }
      if (!body.capturedAt) {
        throw new Error("Memento playback response did not identify its capture time");
      }
      const servedDifferent = body.capturedAt !== capture.page.timestamp;
      const archive = proxyFallback ? undefined : new URL(body.url).hostname;
      const datetime = proxyFallback ? undefined : body.capturedAt;

      return createContentResponse(
        {
          url: capture.page.url,
          timestamp: body.capturedAt,
          snapshot: proxyFallback || servedDifferent ? body.url : capture.page.snapshot,
          content: body.text,
          ...(body.mime ? { mime: body.mime } : {}),
          bytes: body.bytes,
          truncated: body.truncated,
          _meta: {
            provider: "memento",
            ...(typeof archive === "string" ? { archive } : {}),
            ...(typeof datetime === "string" ? { datetime } : {}),
            status: body.status,
            aggregator: baseURL,
            rawSnapshot: body.url,
            ...(proxyFallback ? { proxyFallback: true } : {}),
          },
        },
        "memento",
        { requestedTimestamp: wanted || undefined, aggregator: baseURL },
      );
    } catch (error) {
      return createContentErrorResponse(error, "memento");
    }
  }

  private async fetchTimeMap(
    target: string,
    options: MementoOptions & ArchiveContentOptions,
  ): Promise<{ pages: ArchivedPage[] }> {
    const baseURL = this.baseURL(options);
    let response: unknown;
    try {
      response = await $fetch(`/timemap/json/${encodeURIComponent(target)}`, {
        baseURL,
        signal: options.signal,
        retry: options.retries ?? 1,
        timeout: options.timeout ?? 10000,
      });
    } catch (error) {
      if (isNotFound(error)) return { pages: [] };
      throw error;
    }
    const timeMap = this.parseTimeMap(response);
    const pages: ArchivedPage[] = [];
    const seen = new Set<string>();
    const latestPossibleCapture = Date.now() + MAX_CAPTURE_CLOCK_SKEW_MS;

    for (const memento of timeMap.mementos) {
      const stamp = toWaybackTimestamp(memento.datetime);
      if (stamp.length !== 14) continue;
      const timestamp = waybackTimestampToISO(stamp);
      if (!timestamp || Date.parse(timestamp) > latestPossibleCapture) continue;

      let snapshot: URL;
      try {
        snapshot = new URL(memento.uri);
      } catch {
        continue;
      }
      if (!isSafeMementoURL(snapshot)) continue;

      const key = `${timestamp}\u0000${snapshot.href}`;
      if (seen.has(key)) continue;
      seen.add(key);

      pages.push({
        url: timeMap.originalUri,
        timestamp,
        snapshot: snapshot.href,
        _meta: {
          provider: "memento",
          archive: snapshot.hostname,
          datetime: memento.datetime,
        },
      });
    }

    return { pages };
  }

  private parseTimeMap(response: unknown): ParsedTimeMap {
    if (!isRecord(response) || typeof response["original_uri"] !== "string") {
      throw new Error("Memento aggregator returned a JSON TimeMap without original_uri");
    }
    const mementos = response["mementos"];
    if (!isRecord(mementos) || !Array.isArray(mementos["list"])) {
      throw new Error("Memento aggregator returned a JSON TimeMap without a valid mementos.list");
    }

    let original: URL;
    try {
      original = new URL(response["original_uri"]);
    } catch {
      throw new Error("Memento aggregator returned an invalid original_uri");
    }
    if (original.protocol !== "http:" && original.protocol !== "https:") {
      throw new Error("Memento aggregator returned original_uri without HTTP or HTTPS");
    }
    if (original.username || original.password) {
      throw new Error("Memento aggregator returned an original_uri containing credentials");
    }

    const list: JsonTimeMapMemento[] = [];
    for (const item of mementos["list"]) {
      if (!isRecord(item)) continue;
      const datetime = item["datetime"];
      const uri = item["uri"];
      if (typeof datetime === "string" && typeof uri === "string") {
        list.push({ datetime, uri });
      }
    }

    return { originalUri: original.href, mementos: list };
  }

  /** Requests raw replay used by PyWB without the archive toolbar or rewritten links. */
  private rawSnapshotURL(value: string): URL {
    const snapshot = new URL(value);
    const path = snapshot.pathname;

    if (/\/\d{4,14}[a-z]{2}_\//i.test(path)) {
      snapshot.pathname = path.replace(/\/(\d{4,14})[a-z]{2}_\//i, "/$1id_/");
      return snapshot;
    }
    if (/^\/web\/\d{4,14}\//i.test(path)) {
      snapshot.pathname = path.replace(/^\/web\/(\d{4,14})\//i, "/web/$1id_/");
      return snapshot;
    }
    if (/^\/wayback\/\d{4,14}\//i.test(path)) {
      snapshot.pathname = path.replace(/^\/wayback\/(\d{4,14})\//i, "/wayback/$1id_/");
    }
    return snapshot;
  }

  private originalURL(input: string): string {
    const raw = input.trim().split("#", 1)[0];
    if (!raw || raw.includes("*")) {
      throw new Error("Memento requires one exact URL, not an empty or wildcard target");
    }
    const target = /^[a-z][\w+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      throw new Error("Invalid Memento target URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Memento target must use HTTP or HTTPS");
    }
    if (parsed.username || parsed.password) {
      throw new Error("Memento target cannot contain URL credentials");
    }
    return target;
  }

  private baseURL(options: Partial<MementoOptions>): string {
    const raw = options.baseUrl ?? DEFAULT_BASE_URL;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("Invalid Memento aggregator base URL");
    }
    const localDevelopment = isLocalDevelopmentHostname(parsed.hostname);
    if (isUnsafeHostname(parsed.hostname) && !localDevelopment) {
      throw new Error("Memento aggregator base URL must use a public host");
    }
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localDevelopment)) {
      throw new Error("Memento aggregator base URL must use HTTPS (HTTP is allowed only locally)");
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error(
        "Memento aggregator base URL cannot contain credentials, a query, or a fragment",
      );
    }
    return parsed.href.replace(/\/$/, "");
  }
}

export default function memento(initOptions: MementoOptions = {}): MementoProvider {
  return new MementoProvider(initOptions);
}
