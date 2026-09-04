import { consola } from "consola";
import { $fetch } from "ofetch";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchivedContent,
  ArchivedPage,
  ArquivoMetadata,
} from "../types";
import type { ArquivoOptions } from "../_providers";
import {
  createContentErrorResponse,
  createContentResponse,
  createErrorResponse,
  createFetchOptions,
  createSuccessResponse,
  normalizeDomain,
  preferSameUrl,
  readPlaybackCapture,
  resolveRequestedTimestamp,
  selectCapture,
  toWaybackTimestamp,
  waybackTimestampToISO,
} from "../utils";
import { BaseProvider } from "./base-provider";

const BASE_URL = "https://arquivo.pt";
const CDX_FIELDS = "url,timestamp,status,mime,digest,length";
const CONTENT_CAPTURE_LIMIT = 200;

/** One capture returned by the Arquivo.pt CDX index. */
interface ArquivoCapture {
  url: string;
  timestamp: string;
  status?: number;
  mime?: string;
  digest?: string;
  length?: string;
}

type ArquivoPlayback = Readonly<Omit<ArchivedContent, "_meta">> & {
  readonly _meta: Readonly<ArchivedContent["_meta"]>;
};

function queryWindow(options: Readonly<ArquivoOptions>): Record<string, string> {
  const result: Record<string, string> = {};
  const from = resolveRequestedTimestamp(options.from, "from");
  const to = resolveRequestedTimestamp(options.to, "to");
  if (from) result.from = from;
  if (to) result.to = to;
  return result;
}

function listingQuery(domain: string, options: Readonly<ArquivoOptions>): Record<string, string> {
  return {
    url: normalizeDomain(domain),
    output: "json",
    fields: CDX_FIELDS,
    limit: String(options.limit ?? 1000),
    ...queryWindow(options),
  };
}

function contentQuery(
  target: string,
  bound?: Readonly<{ edge: "from" | "to"; timestamp: string }>,
): Record<string, string> {
  const params: Record<string, string> = {
    url: target,
    matchType: "exact",
    allowFuzzy: "false",
    output: "json",
    fields: CDX_FIELDS,
    limit: String(CONTENT_CAPTURE_LIMIT),
  };
  if (bound) params[bound.edge] = bound.timestamp;
  if (!bound || bound.edge === "to") params.sort = "reverse";
  return params;
}

function parseCdxRecord(line: string): Record<string, string> {
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Arquivo.pt CDX returned a non-object JSON record");
  }

  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") record[key] = value;
    if (typeof value === "number" && Number.isFinite(value)) record[key] = String(value);
  }
  return record;
}

function parseCdxRecords(raw: unknown): Array<Record<string, string>> {
  const text = typeof raw === "string" ? raw : String(raw);
  const records: Array<Record<string, string>> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) records.push(parseCdxRecord(trimmed));
  }
  return records;
}

function optionalCaptureFields(record: Readonly<Record<string, string>>): Partial<ArquivoCapture> {
  const result: Partial<ArquivoCapture> = {};
  const status = Number.parseInt(record["status"] ?? "", 10);
  if (Number.isFinite(status)) result.status = status;
  if (record["mime"]) result.mime = record["mime"];
  if (record["digest"]) result.digest = record["digest"];
  if (record["length"]) result.length = record["length"];
  return result;
}

function arquivoCapture(record: Readonly<Record<string, string>>): ArquivoCapture | undefined {
  const url = record["url"];
  const timestamp = toWaybackTimestamp(record["timestamp"] ?? "");
  if (!url || !timestamp) return undefined;
  return { url, timestamp, ...optionalCaptureFields(record) };
}

function arquivoPage(record: Readonly<Record<string, string>>): ArchivedPage | undefined {
  const capture = arquivoCapture(record);
  if (!capture) {
    consola.debug("[arquivo] Dropping CDX record without a usable URL and timestamp", record);
    return undefined;
  }

  const metadata: ArquivoMetadata = {
    timestamp: capture.timestamp,
    status: capture.status ?? 0,
    provider: "arquivo",
    ...(capture.mime ? { mime: capture.mime } : {}),
    ...(capture.digest ? { digest: capture.digest } : {}),
    ...(capture.length ? { length: capture.length } : {}),
  };
  return {
    url: capture.url,
    timestamp: waybackTimestampToISO(capture.timestamp),
    snapshot: `${BASE_URL}/wayback/${capture.timestamp}/${capture.url}`,
    _meta: metadata,
  };
}

function exactContentTarget(url: string): string {
  const target = normalizeDomain(url, false).trim();
  if (!target) throw new Error("Arquivo.pt target must not be empty");
  if (target.includes("*")) {
    throw new Error("Reading archived content requires one exact URL, not a wildcard pattern");
  }
  return target;
}

function decoratePlayback(
  playback: ArquivoPlayback,
  capture: Readonly<ArquivoCapture>,
): ArchivedContent {
  const servedStamp = String(playback._meta.timestamp ?? capture.timestamp);
  return {
    ...playback,
    snapshot: `${BASE_URL}/wayback/${servedStamp}/${capture.url}`,
    _meta: {
      ...playback._meta,
      status: capture.status ?? playback._meta.status,
      ...(capture.mime ? { mime: capture.mime } : {}),
      ...(capture.digest ? { digest: capture.digest } : {}),
      ...(capture.length ? { length: capture.length } : {}),
    },
  };
}

async function fetchCdxRecords(
  params: Readonly<Record<string, string>>,
  options: Readonly<ArquivoOptions>,
): Promise<{ records: Array<Record<string, string>>; queryParams: unknown }> {
  const fetchOptions = await createFetchOptions(BASE_URL, params, {
    retries: options.retries,
    signal: options.signal,
    timeout: options.timeout,
    responseType: "text",
  });
  const raw: unknown = await $fetch("/wayback/cdx", fetchOptions);
  return { records: parseCdxRecords(raw), queryParams: fetchOptions.params };
}

/** Arquivo.pt web archive provider. */
export class ArquivoProvider extends BaseProvider<ArquivoOptions> {
  readonly name = "Arquivo.pt";
  readonly slug = "arquivo";

  override cacheKey(options?: Readonly<ArchiveOptions>): string {
    const requestedLimit =
      options && Object.hasOwn(options, "limit") ? options.limit : this.options.limit;
    return `arquivoLimit=${requestedLimit ?? 1000}`;
  }

  async snapshots(
    domain: string,
    reqOptions: Readonly<ArquivoOptions> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const target = domain.trim();
      if (!target) throw new Error("Arquivo.pt target must not be empty");

      const { records, queryParams } = await fetchCdxRecords(
        listingQuery(target, options),
        options,
      );
      const pages = records
        .map((record) => arquivoPage(record))
        .filter((page): page is ArchivedPage => page !== undefined);

      return createSuccessResponse(pages, "arquivo", { queryParams });
    } catch (error) {
      return createErrorResponse(error, "arquivo");
    }
  }

  override async content(
    url: string,
    reqOptions: Readonly<ArquivoOptions & ArchiveContentOptions> = {},
  ): Promise<ArchiveContentResponse> {
    try {
      const options = await this.resolveContentOptions(reqOptions);
      const target = exactContentTarget(url);
      const wanted = resolveRequestedTimestamp(options.timestamp);
      const captures = await this.findCaptures(target, wanted, options);
      const capture = selectCapture(
        preferSameUrl(captures, url, (candidate) => candidate.url),
        wanted,
      );
      if (!capture) {
        return createContentErrorResponse(
          `No Arquivo.pt capture for ${target}${wanted ? ` near ${wanted}` : ""}`,
          "arquivo",
          { requestedTimestamp: wanted || undefined },
        );
      }

      const playback = await readPlaybackCapture({
        baseURL: BASE_URL,
        prefix: "/noFrame/replay",
        original: capture.url,
        stamp: capture.timestamp,
        provider: "arquivo",
        captureStatus: capture.status,
        options,
      });
      return createContentResponse(decoratePlayback(playback, capture), "arquivo", {
        requestedTimestamp: wanted || undefined,
      });
    } catch (error) {
      return createContentErrorResponse(error, "arquivo");
    }
  }

  private async findCaptures(
    target: string,
    wanted: string,
    options: Readonly<ArquivoOptions>,
  ): Promise<ArquivoCapture[]> {
    const firstBound = wanted ? { edge: "to" as const, timestamp: wanted } : undefined;
    const { records } = await fetchCdxRecords(contentQuery(target, firstBound), options);
    const captures = records
      .map((record) => arquivoCapture(record))
      .filter((capture): capture is ArquivoCapture => capture !== undefined);
    if (captures.length > 0 || !wanted) return captures;

    const later = await fetchCdxRecords(
      contentQuery(target, { edge: "from", timestamp: wanted }),
      options,
    );
    return later.records
      .map((record) => arquivoCapture(record))
      .filter((capture): capture is ArquivoCapture => capture !== undefined);
  }
}

export default function arquivo(initOptions: Readonly<ArquivoOptions> = {}): ArquivoProvider {
  return new ArquivoProvider(initOptions);
}
