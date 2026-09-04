import { $fetch } from "ofetch";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchivedPage,
  WebarchivMetadata,
} from "../types";
import type { WebarchivOptions } from "../_providers";
import {
  createContentErrorResponse,
  createContentResponse,
  createErrorResponse,
  createFetchOptions,
  createSuccessResponse,
  type FetchBodyPolicy,
  normalizeDomain,
  preferSameUrl,
  readPlaybackCapture,
  resolveRequestedTimestamp,
  selectCapture,
  toWaybackTimestamp,
  waybackTimestampToISO,
} from "../utils";
import { BaseProvider } from "./base-provider";

const BASE_URL = "https://webarchiv.onb.ac.at";
const CONTENT_CAPTURE_LIMIT = 5;
const RAW_REPLAY_PATH = /^\/web\/\d{4,14}id_\/https?:\/\/\S+$/u;
const REPLAY_POLICY = {
  assertURL(url: URL) {
    if (url.origin !== BASE_URL || !RAW_REPLAY_PATH.test(`${url.pathname}${url.search}`)) {
      throw new Error("Webarchiv Österreich replay left its raw playback endpoint");
    }
  },
  returnRejectedRedirect: true,
} satisfies FetchBodyPolicy;

interface WebarchivCapture {
  url: string;
  timestamp: string;
  status?: number;
  mime?: string;
  digest?: string;
  length?: string;
}

function exactTarget(value: string, operation: string): string {
  const normalized = normalizeDomain(value, false).trim();
  if (!normalized) throw new Error(`Webarchiv Österreich ${operation} target must not be empty`);
  if (normalized.includes("*")) {
    throw new Error(
      operation === "content"
        ? "Reading archived content requires one exact URL, not a wildcard pattern"
        : "Webarchiv Österreich listings require one exact URL, not a wildcard pattern",
    );
  }
  const target = normalized.search(/[/?#]/u) === -1 ? `${normalized}/` : normalized;
  return `http://${target}`;
}

function queryWindow(options: Readonly<WebarchivOptions>): Record<string, string> {
  const result: Record<string, string> = {};
  const from = resolveRequestedTimestamp(options.from, "from");
  const to = resolveRequestedTimestamp(options.to, "to");
  if (from) result.from = from;
  if (to) result.to = to;
  return result;
}

function optionalCaptureFields(
  record: Readonly<Record<string, unknown>>,
): Partial<WebarchivCapture> {
  const result: Partial<WebarchivCapture> = {};
  const rawStatus = record["status"];
  const status =
    typeof rawStatus === "string" || typeof rawStatus === "number"
      ? Number.parseInt(String(rawStatus), 10)
      : Number.NaN;
  if (Number.isFinite(status)) result.status = status;
  if (typeof record["mime"] === "string") result.mime = record["mime"];
  if (typeof record["digest"] === "string") result.digest = record["digest"];
  if (typeof record["length"] === "string") result.length = record["length"];
  return result;
}

function parseCapture(line: string): WebarchivCapture | undefined {
  const match = /^\S+\s+(\S+)\s+(.+)$/u.exec(line);
  if (!match) throw new Error("Webarchiv Österreich returned a malformed CDXJ record");

  let value: unknown;
  try {
    value = JSON.parse(match[2]);
  } catch {
    throw new Error("Webarchiv Österreich returned a malformed CDXJ record");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Webarchiv Österreich returned a malformed CDXJ record");
  }

  const record = value as Readonly<Record<string, unknown>>;
  const url = record["url"];
  const timestamp = toWaybackTimestamp(match[1]);
  if (typeof url !== "string" || !timestamp) return undefined;
  return { url, timestamp, ...optionalCaptureFields(record) };
}

function parseCaptures(raw: unknown): WebarchivCapture[] {
  const captures: WebarchivCapture[] = [];
  for (const line of String(raw).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const capture = parseCapture(trimmed);
    if (capture) captures.push(capture);
  }
  return captures;
}

function supplementalMetadata(
  capture: Readonly<WebarchivCapture>,
): Pick<WebarchivMetadata, "mime" | "digest" | "length"> {
  return {
    ...(capture.mime ? { mime: capture.mime } : {}),
    ...(capture.digest ? { digest: capture.digest } : {}),
    ...(capture.length ? { length: capture.length } : {}),
  };
}

function metadata(capture: Readonly<WebarchivCapture>): WebarchivMetadata {
  return {
    provider: "webarchiv",
    timestamp: capture.timestamp,
    ...(capture.status === undefined ? {} : { status: capture.status }),
    ...supplementalMetadata(capture),
  };
}

function page(capture: Readonly<WebarchivCapture>): ArchivedPage {
  return {
    url: capture.url,
    timestamp: waybackTimestampToISO(capture.timestamp),
    snapshot: `${BASE_URL}/web/${capture.timestamp}/${capture.url}`,
    _meta: metadata(capture),
  };
}

async function fetchCaptures(
  params: Readonly<Record<string, string>>,
  options: Readonly<WebarchivOptions>,
): Promise<{ captures: WebarchivCapture[]; queryParams: unknown }> {
  const fetchOptions = await createFetchOptions(BASE_URL, params, {
    retries: options.retries,
    signal: options.signal,
    timeout: options.timeout,
    responseType: "text",
  });
  try {
    const raw: unknown = await $fetch("/web/cdx", fetchOptions);
    return { captures: parseCaptures(raw), queryParams: fetchOptions.params };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      error.response instanceof Response &&
      error.response.status === 404
    ) {
      return { captures: [], queryParams: fetchOptions.params };
    }
    throw error;
  }
}

export class WebarchivProvider extends BaseProvider<WebarchivOptions> {
  readonly name = "Webarchiv Österreich";
  readonly slug = "webarchiv";

  override cacheKey(options?: Readonly<ArchiveOptions>): string {
    const requestedLimit =
      options && Object.hasOwn(options, "limit") ? options.limit : this.options.limit;
    return `webarchivLimit=${requestedLimit ?? 1000}`;
  }

  async snapshots(
    url: string,
    reqOptions: Readonly<WebarchivOptions> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const params = {
        url: exactTarget(url, "listing"),
        limit: String(options.limit ?? 1000),
        ...queryWindow(options),
      };
      const { captures, queryParams } = await fetchCaptures(params, options);
      return createSuccessResponse(captures.map(page), "webarchiv", { queryParams });
    } catch (error) {
      return createErrorResponse(error, "webarchiv");
    }
  }

  override async content(
    url: string,
    reqOptions: Readonly<WebarchivOptions & ArchiveContentOptions> = {},
  ): Promise<ArchiveContentResponse> {
    try {
      const options = await this.resolveContentOptions(reqOptions);
      const target = exactTarget(url, "content");
      const wanted = resolveRequestedTimestamp(options.timestamp);
      const captures = await this.findCaptures(target, wanted, options);
      const capture = selectCapture(
        preferSameUrl(captures, url, (candidate) => candidate.url),
        wanted,
      );
      if (!capture) {
        return createContentErrorResponse(
          `No Webarchiv Österreich capture for ${target}${wanted ? ` near ${wanted}` : ""}`,
          "webarchiv",
          { requestedTimestamp: wanted || undefined },
        );
      }

      const content = await readPlaybackCapture({
        baseURL: BASE_URL,
        prefix: "/web",
        original: capture.url,
        stamp: capture.timestamp,
        provider: "webarchiv",
        options,
        policy: REPLAY_POLICY,
      });
      const served =
        content._meta.timestamp === capture.timestamp
          ? {
              ...content,
              _meta: { ...content._meta, ...supplementalMetadata(capture) },
            }
          : content;
      return createContentResponse(served, "webarchiv", {
        requestedTimestamp: wanted || undefined,
      });
    } catch (error) {
      return createContentErrorResponse(error, "webarchiv");
    }
  }

  private async findCaptures(
    target: string,
    wanted: string,
    options: Readonly<WebarchivOptions>,
  ): Promise<WebarchivCapture[]> {
    const params: Record<string, string> = {
      url: target,
      limit: String(CONTENT_CAPTURE_LIMIT),
      reverse: "true",
    };
    if (wanted) params.to = wanted;

    const { captures } = await fetchCaptures(params, options);
    if (captures.length > 0 || !wanted) return captures;

    const { reverse: _reverse, to: _to, ...unbounded } = params;
    return (await fetchCaptures({ ...unbounded, from: wanted }, options)).captures;
  }
}

export default function webarchiv(initOptions: Readonly<WebarchivOptions> = {}): WebarchivProvider {
  return new WebarchivProvider(initOptions);
}
