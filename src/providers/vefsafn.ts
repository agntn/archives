import { fetchData } from "../utils/_fetch.ts";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchivedPage,
  VefsafnMetadata,
} from "../types.ts";
import type { VefsafnOptions } from "../_providers.ts";
import {
  createContentErrorResponse,
  createContentResponse,
  createErrorResponse,
  createFetchOptions,
  createSuccessResponse,
  normalizeDomain,
  parsePywbCapture,
  preferSameUrl,
  type PywbCapture,
  readPlaybackCapture,
  requestedWindow,
  resolveRequestedTimestamp,
  selectCapture,
  waybackTimestampToISO,
} from "../utils/index.ts";
import { BaseProvider } from "./base-provider.ts";

const BASE_URL = "https://vefsafn.is";
const CONTENT_CAPTURE_LIMIT = 200;
const MAX_LINE_LENGTH = 64 * 1024;
const MALFORMED = "Vefsafn returned a malformed CDX record";

/**
 * Narrows a target to one exact URL: prefix queries on a large host answered nothing within 25 s.
 *
 * @param value - The URL or domain asked for.
 * @param operation - What the target is for, named in the error.
 * @returns {string} The URL the index is asked for.
 */
function exactTarget(value: string, operation: string): string {
  const normalized = normalizeDomain(value, false).trim();
  if (!normalized) throw new Error(`Vefsafn ${operation} target must not be empty`);
  if (normalized.includes("*")) {
    throw new Error(
      operation === "content"
        ? "Reading archived content requires one exact URL, not a wildcard pattern"
        : "Vefsafn listings require one exact URL, not a wildcard pattern",
    );
  }
  const target = normalized.search(/[/?#]/u) === -1 ? `${normalized}/` : normalized;
  return `http://${target}`;
}

/**
 * Splits the stream into rows and parses them until `limit` captures are in hand.
 * @param read - Next chunk of the decoded CDX response.
 * @param limit - Rows to keep.
 * @returns {Promise<PywbCapture[]>} The captures read before the cap or the end of the stream.
 */
async function collectCaptures(
  read: () => Promise<ReadableStreamReadResult<string>>,
  limit: number,
): Promise<PywbCapture[]> {
  const captures: PywbCapture[] = [];
  const take = (line: string) => {
    const trimmed = line.trim();
    const capture = trimmed ? parsePywbCapture(trimmed, MALFORMED) : undefined;
    if (capture) captures.push(capture);
  };

  let pending = "";
  while (captures.length < limit) {
    const { done, value } = await read();
    if (done) {
      take(pending);
      break;
    }
    const lines = (pending + value).split("\n");
    pending = lines.pop() ?? "";
    if (pending.length > MAX_LINE_LENGTH) {
      throw new Error(MALFORMED);
    }
    for (const line of lines) {
      if (captures.length >= limit) break;
      take(line);
    }
  }
  return captures.slice(0, limit);
}

/**
 * The index ignores `limit` and streams every row, so the cap applies while reading.
 * @param stream - Body of the CDX response.
 * @param limit - Rows to keep.
 * @returns {Promise<PywbCapture[]>} At most `limit` captures.
 */
async function readCaptures(stream: unknown, limit: number): Promise<PywbCapture[]> {
  if (!(stream instanceof ReadableStream)) return [];
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  try {
    return limit > 0 ? await collectCaptures(() => reader.read(), limit) : [];
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function supplementalMetadata(
  capture: Readonly<PywbCapture>,
): Pick<VefsafnMetadata, "mime" | "digest"> {
  return {
    ...(capture.mime ? { mime: capture.mime } : {}),
    ...(capture.digest ? { digest: capture.digest } : {}),
  };
}

function metadata(capture: Readonly<PywbCapture>): VefsafnMetadata {
  return {
    provider: "vefsafn",
    timestamp: capture.timestamp,
    ...(capture.status === undefined ? {} : { status: capture.status }),
    ...supplementalMetadata(capture),
  };
}

function page(capture: Readonly<PywbCapture>): ArchivedPage {
  return {
    url: capture.url,
    timestamp: waybackTimestampToISO(capture.timestamp),
    snapshot: `${BASE_URL}/${capture.timestamp}/${capture.url}`,
    _meta: metadata(capture),
  };
}

async function fetchCaptures(
  params: Readonly<Record<string, string>>,
  limit: number,
  options: Readonly<VefsafnOptions>,
): Promise<{ captures: PywbCapture[]; queryParams: unknown }> {
  const fetchOptions = await createFetchOptions(
    BASE_URL,
    { ...params, output: "json", limit: String(limit) },
    {
      retries: options.retries,
      signal: options.signal,
      timeout: options.timeout,
      responseType: "stream",
    },
  );
  try {
    const stream: unknown = await fetchData("/cdx", fetchOptions);
    return { captures: await readCaptures(stream, limit), queryParams: fetchOptions.params };
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

/** Vefsafn, the Icelandic web archive run by the National and University Library of Iceland. */
export class VefsafnProvider extends BaseProvider<VefsafnOptions> {
  readonly name = "Vefsafn";
  readonly slug = "vefsafn";

  override cacheKey(options?: Readonly<ArchiveOptions>): string {
    const requestedLimit =
      options && Object.hasOwn(options, "limit") ? options.limit : this.options.limit;
    return `vefsafnLimit=${requestedLimit ?? 1000}`;
  }

  async snapshots(
    url: string,
    reqOptions: Readonly<VefsafnOptions> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const params = {
        url: exactTarget(url, "listing"),
        ...requestedWindow(options),
        ...(options.order === "newest" ? { reverse: "true" } : {}),
      };
      const { captures, queryParams } = await fetchCaptures(params, options.limit ?? 1000, options);
      return createSuccessResponse(captures.map(page), "vefsafn", { queryParams });
    } catch (error) {
      return createErrorResponse(error, "vefsafn");
    }
  }

  override async content(
    url: string,
    reqOptions: Readonly<VefsafnOptions & ArchiveContentOptions> = {},
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
          `No Vefsafn capture for ${target}${wanted ? ` near ${wanted}` : ""}`,
          "vefsafn",
          { requestedTimestamp: wanted || undefined },
        );
      }

      const content = await readPlaybackCapture({
        baseURL: BASE_URL,
        prefix: "",
        original: capture.url,
        stamp: capture.timestamp,
        provider: "vefsafn",
        captureStatus: capture.status,
        options,
      });
      const served =
        content._meta.timestamp === capture.timestamp
          ? { ...content, _meta: { ...content._meta, ...supplementalMetadata(capture) } }
          : content;
      return createContentResponse(served, "vefsafn", {
        requestedTimestamp: wanted || undefined,
      });
    } catch (error) {
      return createContentErrorResponse(error, "vefsafn");
    }
  }

  private async findCaptures(
    target: string,
    wanted: string,
    options: Readonly<VefsafnOptions>,
  ): Promise<PywbCapture[]> {
    const params: Record<string, string> = { url: target, reverse: "true" };
    if (wanted) params.to = wanted;

    const { captures } = await fetchCaptures(params, CONTENT_CAPTURE_LIMIT, options);
    if (captures.length > 0 || !wanted) return captures;

    return (await fetchCaptures({ url: target, from: wanted }, CONTENT_CAPTURE_LIMIT, options))
      .captures;
  }
}

export default function vefsafn(initOptions: Readonly<VefsafnOptions> = {}): VefsafnProvider {
  return new VefsafnProvider(initOptions);
}
