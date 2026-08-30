import { createHash } from "node:crypto";
import { $fetch } from "ofetch";
import { hasProtocol } from "ufo";
import type { PermaccOptions } from "../_providers";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchivedPage,
} from "../types";
import {
  createSuccessResponse,
  createErrorResponse,
  createFetchOptions,
  createUnsupportedContentResponse,
} from "../utils";
import { BaseProvider } from "./base-provider";

const UNSUPPORTED_CONTENT_REASON =
  "Perma.cc's API returns capture metadata only. The archived bytes are served through its playback UI or an account-scoped WARC download, neither of which this provider performs.";

function normalizeExactUrl(input: string): string {
  const trimmedInput = input.trim();
  const candidate = hasProtocol(trimmedInput, { strict: true })
    ? trimmedInput
    : `https://${trimmedInput}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Perma.cc requires a valid HTTP(S) URL");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new Error("Perma.cc requires a valid HTTP(S) URL");
  }

  url.hash = "";
  return url.href;
}

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

interface TimestampParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function timestampParts(match: readonly string[]): TimestampParts {
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
}

function validClock(parts: Readonly<TimestampParts>): boolean {
  return !(
    parts.month < 1 ||
    parts.month > 12 ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.second > 59
  );
}

function monthLength(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month === 2) return leap ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseCreationTimestamp(value: string): string | undefined {
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) return undefined;
  const parts = timestampParts(match);
  if (!validClock(parts) || parts.day < 1 || parts.day > monthLength(parts.year, parts.month)) {
    return undefined;
  }

  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function archiveMetadata(
  value: Readonly<Record<string, unknown>>,
  guid: string,
  timestamp: string,
) {
  const metadata: ArchivedPage["_meta"] = { guid, timestamp };
  if (typeof value["title"] === "string") metadata.title = value["title"];
  if (typeof value["status"] === "string") metadata.status = value["status"];

  const createdBy = isRecord(value["created_by"]) ? value["created_by"]["id"] : undefined;
  if (typeof createdBy === "string" || typeof createdBy === "number") {
    metadata.created_by = String(createdBy);
  }
  return metadata;
}

function mapArchive(value: unknown): ArchivedPage | undefined {
  if (!isRecord(value)) return undefined;
  const guid = value["guid"];
  const url = value["url"];
  const creationTimestamp = value["creation_timestamp"];
  if (
    typeof guid !== "string" ||
    guid.length === 0 ||
    typeof url !== "string" ||
    typeof creationTimestamp !== "string"
  ) {
    return undefined;
  }

  const timestamp = parseCreationTimestamp(creationTimestamp);
  if (!timestamp) return undefined;

  let archivedUrl: string;
  try {
    archivedUrl = normalizeExactUrl(url);
  } catch {
    return undefined;
  }

  return {
    url: archivedUrl,
    timestamp,
    snapshot: `https://perma.cc/${encodeURIComponent(guid)}`,
    _meta: archiveMetadata(value, guid, creationTimestamp),
  };
}

interface PermaccPayload {
  objects: readonly unknown[];
  meta?: Readonly<Record<string, unknown>>;
}

function parsePermaccPayload(value: unknown): PermaccPayload {
  if (!isRecord(value) || !Array.isArray(value["objects"])) {
    throw new Error("Invalid Perma.cc API response");
  }
  return {
    objects: value["objects"],
    ...(isRecord(value["meta"]) ? { meta: value["meta"] } : {}),
  };
}

function permaccResponseMetadata(
  meta?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (!meta) return {};
  const result: Record<string, unknown> = {};
  for (const key of ["limit", "offset", "total_count"] as const) {
    if (typeof meta[key] === "number") result[key] = meta[key];
  }
  for (const key of ["next", "previous"] as const) {
    const value = meta[key];
    if (typeof value === "string" || value === null) result[key] = value;
  }
  return result;
}

/**
 * Perma.cc requires an API key and returns only archives accessible to that
 * account. Lookups match one exact submitted URL; bare domains are normalized
 * to their HTTPS root URL. When neither init-time nor request-time `apiKey` is
 * provided, `snapshots()` returns an error response.
 */
export class PermaccProvider extends BaseProvider<PermaccOptions> {
  readonly name = "Perma.cc";
  readonly slug = "permacc";

  /**
   * Partition responses by account and effective limit without storing the raw API key.

   *
   * @param options - Options.
   * @returns {string | undefined} The operation result.
   */
  override cacheKey(options?: Readonly<ArchiveOptions>): string | undefined {
    const apiKey = options?.apiKey ?? this.options.apiKey;
    if (!apiKey) return undefined;

    const fingerprint = createHash("sha256").update(apiKey).digest("base64url");
    const limit = options?.limit ?? this.options.limit ?? 100;
    return `apiKey=${fingerprint},limit=${limit}`;
  }

  /**
   * Fetch archives matching one exact URL from the authenticated Perma.cc account.

   *
   * @param domain - Domain.
   * @param reqOptions - Req Options.
   * @returns {Promise<ArchiveResponse>} A promise resolving to the operation result.
   */
  async snapshots(
    domain: string,
    reqOptions: Readonly<Partial<PermaccOptions>> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);

      if (!options.apiKey) {
        throw new Error("API key is required for Perma.cc");
      }

      const baseUrl = "https://api.perma.cc";
      const { apiKey } = options;
      const exactUrl = normalizeExactUrl(domain);

      const fetchOptions = await createFetchOptions(
        baseUrl,
        {
          limit: options.limit ?? 100,
          url: exactUrl,
        },
        {
          headers: {
            Authorization: `ApiKey ${apiKey}`,
          },
          retries: options.retries,
          signal: options.signal,
          timeout: options.timeout,
        },
      );

      const payload = parsePermaccPayload(await $fetch("/v1/archives/", fetchOptions));
      const pages = payload.objects
        .map((archive) => mapArchive(archive))
        .filter((page): page is ArchivedPage => page !== undefined);

      return createSuccessResponse(pages, "permacc", {
        queryParams: fetchOptions.params,
        meta: permaccResponseMetadata(payload.meta),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "UnknownError";
      return createErrorResponse(message, "permacc", { errorName });
    }
  }

  override content(
    _url: string,
    _options: Readonly<ArchiveContentOptions> = {},
  ): Promise<ArchiveContentResponse> {
    return Promise.resolve(
      createUnsupportedContentResponse(UNSUPPORTED_CONTENT_REASON, "permacc", {
        operation: "content",
      }),
    );
  }
}

export default function permacc(
  initOptions: Readonly<Partial<PermaccOptions>> = {},
): PermaccProvider {
  return new PermaccProvider(initOptions);
}
