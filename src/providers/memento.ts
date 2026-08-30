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
  readonly datetime: string;
  readonly uri: string;
}

interface ParsedTimeMap {
  readonly originalUri: string;
  readonly mementos: readonly JsonTimeMapMemento[];
}

interface MementoCapturePage {
  readonly url: string;
  readonly timestamp: string;
  readonly snapshot: string;
}

interface MementoCapture {
  readonly page: MementoCapturePage;
  readonly original: string;
  readonly timestamp: string;
}

interface MementoPlayback {
  readonly body: Readonly<FetchedBody> & { readonly capturedAt: string };
  readonly baseURL: string;
  readonly proxyFallback: boolean;
}

function selectMementoCapture(
  pages: readonly ArchivedPage[],
  target: string,
  wanted: string | undefined,
): MementoCapture | undefined {
  const captures = pages.map((page) => ({
    page,
    original: page.url,
    timestamp: toWaybackTimestamp(page.timestamp),
  }));
  return selectCapture(
    preferSameUrl(captures, target, (candidate) => candidate.original),
    wanted,
  );
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
    .replaceAll(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function ipv4Octets(hostname: string): readonly [number, number, number, number] | undefined {
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.length !== 4) return undefined;
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return [octets[0], octets[1], octets[2], octets[3]];
}

function isLocalDevelopmentHostname(value: string): boolean {
  const hostname = normalizedHostname(value);
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1") {
    return true;
  }
  return ipv4Octets(hostname)?.[0] === 127;
}

const UNSAFE_FIRST_IPV4_OCTETS = new Set([0, 10, 127]);
const UNSAFE_SECOND_IPV4_OCTETS: Readonly<Record<number, readonly number[]>> = {
  169: [254],
  192: [0, 168],
  198: [18, 19],
};

function isUnsafeIpv6(hostname: string): boolean {
  if (hostname === "::" || hostname === "::1" || hostname.startsWith("::ffff:")) return true;
  return !/^[23][\da-f]{3}$/i.test(hostname.split(":", 1)[0]);
}

function inRange(value: number, minimum: number, maximum: number): boolean {
  return value >= minimum && value <= maximum;
}

function isUnsafeIpv4(hostname: string): boolean {
  const octets = ipv4Octets(hostname);
  if (!octets) return false;
  const [first, second] = octets;
  if (UNSAFE_FIRST_IPV4_OCTETS.has(first) || first >= 224) return true;
  if (first === 100) return inRange(second, 64, 127);
  if (first === 172) return inRange(second, 16, 31);
  return UNSAFE_SECOND_IPV4_OCTETS[first]?.includes(second) ?? false;
}

function isUnsafeHostname(value: string): boolean {
  const hostname = normalizedHostname(value);
  const reservedName =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal");
  if (reservedName) return true;
  return hostname.includes(":") ? isUnsafeIpv6(hostname) : isUnsafeIpv4(hostname);
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

function parseOriginalUri(value: unknown): URL {
  if (typeof value !== "string") {
    throw new TypeError("Memento aggregator returned a JSON TimeMap without original_uri");
  }
  let original: URL;
  try {
    original = new URL(value);
  } catch {
    throw new Error("Memento aggregator returned an invalid original_uri");
  }
  if (original.protocol !== "http:" && original.protocol !== "https:") {
    throw new Error("Memento aggregator returned original_uri without HTTP or HTTPS");
  }
  if (original.username || original.password) {
    throw new Error("Memento aggregator returned an original_uri containing credentials");
  }
  return original;
}

function parseMementoList(value: unknown): JsonTimeMapMemento[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Memento aggregator returned a JSON TimeMap without a valid mementos.list");
  }
  const list: JsonTimeMapMemento[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const datetime = item["datetime"];
    const uri = item["uri"];
    if (typeof datetime === "string" && typeof uri === "string") list.push({ datetime, uri });
  }
  return list;
}

function pageFromMemento(
  memento: Readonly<JsonTimeMapMemento>,
  originalUri: string,
  latestPossibleCapture: number,
): ArchivedPage | undefined {
  const stamp = toWaybackTimestamp(memento.datetime);
  if (stamp.length !== 14) return undefined;
  const timestamp = waybackTimestampToISO(stamp);
  if (!timestamp || Date.parse(timestamp) > latestPossibleCapture) return undefined;

  let snapshot: URL;
  try {
    snapshot = new URL(memento.uri);
  } catch {
    return undefined;
  }
  if (!isSafeMementoURL(snapshot)) return undefined;
  return {
    url: originalUri,
    timestamp,
    snapshot: snapshot.href,
    _meta: {
      provider: "memento",
      archive: snapshot.hostname,
      datetime: memento.datetime,
    },
  };
}

function playbackMetadata(playback: MementoPlayback): Record<string, unknown> {
  const { baseURL, body, proxyFallback } = playback;
  const metadata: Record<string, unknown> = {
    provider: "memento",
    status: body.status,
    aggregator: baseURL,
    rawSnapshot: body.url,
  };
  if (proxyFallback) metadata["proxyFallback"] = true;
  else {
    metadata["archive"] = new URL(body.url).hostname;
    metadata["datetime"] = body.capturedAt;
  }
  return metadata;
}

function mementoContentResponse(
  capture: Readonly<MementoCapture>,
  playback: MementoPlayback,
  wanted: string | undefined,
): ArchiveContentResponse {
  const { baseURL, body, proxyFallback } = playback;
  const servedDifferent = body.capturedAt !== capture.page.timestamp;
  return createContentResponse(
    {
      url: capture.page.url,
      timestamp: body.capturedAt,
      snapshot: proxyFallback || servedDifferent ? body.url : capture.page.snapshot,
      content: body.text,
      ...(body.mime ? { mime: body.mime } : {}),
      bytes: body.bytes,
      truncated: body.truncated,
      _meta: playbackMetadata(playback),
    },
    "memento",
    { requestedTimestamp: wanted || undefined, aggregator: baseURL },
  );
}

function isAllowedAggregatorProtocol(parsed: URL, localDevelopment: boolean): boolean {
  return parsed.protocol === "https:" || (parsed.protocol === "http:" && localDevelopment);
}

function hasAggregatorUrlExtras(parsed: URL): boolean {
  return Boolean(parsed.username || parsed.password || parsed.search || parsed.hash);
}

function validateAggregatorUrl(parsed: URL): void {
  const localDevelopment = isLocalDevelopmentHostname(parsed.hostname);
  if (isUnsafeHostname(parsed.hostname) && !localDevelopment) {
    throw new Error("Memento aggregator base URL must use a public host");
  }
  if (!isAllowedAggregatorProtocol(parsed, localDevelopment)) {
    throw new Error("Memento aggregator base URL must use HTTPS (HTTP is allowed only locally)");
  }
  if (hasAggregatorUrlExtras(parsed)) {
    throw new Error(
      "Memento aggregator base URL cannot contain credentials, a query, or a fragment",
    );
  }
}

function parseAggregatorBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid Memento aggregator base URL");
  }
  validateAggregatorUrl(parsed);
  return parsed.href.replace(/\/$/, "");
}

/** Memento JSON TimeMaps through ODU MemGator, replacing the discontinued Time Travel aggregator. */
export class MementoProvider extends BaseProvider<MementoOptions> {
  readonly name = "Memento (MemGator)";
  readonly slug = "memento";

  /**
   * Separates aggregators and caps while redacting invalid URLs before cache lookup.
   *
   * @param options - Options.
   * @returns {string} The resulting string.
   */
  override cacheKey(options?: Readonly<MementoOptions>): string {
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

  /**
   * Fetches the aggregated JSON TimeMap for one exact original URL.
   *
   * @param domain - Domain.
   * @param reqOptions - Req Options.
   * @returns {Promise<ArchiveResponse>} A promise resolving to the operation result.
   */
  async snapshots(
    domain: string,
    reqOptions: Readonly<MementoOptions> = {},
  ): Promise<ArchiveResponse> {
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

  /**
   * Reads the selected Memento URI directly, with negotiation through MemGator only as fallback.
   *
   * @param url - Url.
   * @param reqOptions - Req Options.
   * @returns {Promise<ArchiveContentResponse>} A promise resolving to the operation result.
   */
  override async content(
    url: string,
    reqOptions: Readonly<Partial<MementoOptions> & ArchiveContentOptions> = {},
  ): Promise<ArchiveContentResponse> {
    try {
      const options = await this.resolveContentOptions(reqOptions);
      const unwrapped = unwrapSnapshotUrl(url);
      const target = this.originalURL(unwrapped.url);
      const wanted = resolveRequestedTimestamp(options.timestamp ?? unwrapped.timestamp);
      const { pages } = await this.fetchTimeMap(target, options);
      const capture = selectMementoCapture(pages, target, wanted);
      if (!capture) {
        return createContentErrorResponse(
          `No Memento capture for ${target}${wanted ? ` near ${wanted}` : ""}`,
          "memento",
          { requestedTimestamp: wanted || undefined },
        );
      }

      const playback = await this.readCapture(capture, options);
      return mementoContentResponse(capture, playback, wanted);
    } catch (error) {
      return createContentErrorResponse(error, "memento");
    }
  }

  private async readCapture(
    capture: Readonly<MementoCapture>,
    options: Readonly<MementoOptions & ArchiveContentOptions>,
  ): Promise<MementoPlayback> {
    const baseURL = this.baseURL(options);
    const aggregator = new URL(baseURL);
    const localOrigin = isLocalDevelopmentHostname(aggregator.hostname)
      ? aggregator.origin
      : undefined;

    try {
      const snapshot = this.rawSnapshotURL(capture.page.snapshot);
      const body = await fetchBody(
        snapshot.origin,
        `${snapshot.pathname}${snapshot.search}`,
        options,
        { assertURL: (candidate) => assertSafePlaybackURL(candidate) },
      );
      if (!body.capturedAt) throw new Error("Direct playback did not identify its capture time");
      return { body: { ...body, capturedAt: body.capturedAt }, baseURL, proxyFallback: false };
    } catch {
      const body = await fetchBody(
        baseURL,
        `/memento/proxy/${capture.timestamp}/${encodeURIComponent(capture.page.url)}`,
        options,
        { assertURL: (candidate) => assertSafePlaybackURL(candidate, localOrigin) },
      );
      if (!body.capturedAt) throw new Error("Memento playback did not identify its capture time");
      return { body: { ...body, capturedAt: body.capturedAt }, baseURL, proxyFallback: true };
    }
  }

  private async fetchTimeMap(
    target: string,
    options: Readonly<MementoOptions & ArchiveContentOptions>,
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
      const page = pageFromMemento(memento, timeMap.originalUri, latestPossibleCapture);
      if (!page) continue;
      const key = `${page.timestamp}\u0000${page.snapshot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pages.push(page);
    }

    return { pages };
  }

  private parseTimeMap(response: unknown): ParsedTimeMap {
    if (!isRecord(response)) {
      throw new Error("Memento aggregator returned a JSON TimeMap without original_uri");
    }
    const mementos = response["mementos"];
    if (!isRecord(mementos)) {
      throw new Error("Memento aggregator returned a JSON TimeMap without a valid mementos.list");
    }
    const original = parseOriginalUri(response["original_uri"]);
    return { originalUri: original.href, mementos: parseMementoList(mementos["list"]) };
  }

  /**
   * Requests raw replay used by PyWB without the archive toolbar or rewritten links.
   *
   * @param value - Value.
   * @returns {URL} The operation result.
   */
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

  private baseURL(options: Readonly<Partial<MementoOptions>>): string {
    return parseAggregatorBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  }
}

export default function memento(initOptions: Readonly<MementoOptions> = {}): MementoProvider {
  return new MementoProvider(initOptions);
}
