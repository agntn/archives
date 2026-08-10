import { createHash } from "node:crypto";
import { $fetch } from "ofetch";
import { hasProtocol } from "ufo";
import type { PermaccOptions } from "../_providers";
import type { ArchiveOptions, ArchiveResponse, ArchivedPage } from "../types";
import { createSuccessResponse, createErrorResponse, createFetchOptions } from "../utils";
import { BaseProvider } from "./base-provider";

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

function parseCreationTimestamp(value: string): string | undefined {
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const hasThirtyDays = month === 4 || month === 6 || month === 9 || month === 11;
  const daysInMonth = month === 2 ? (isLeapYear ? 29 : 28) : hasThirtyDays ? 30 : 31;
  if (day < 1 || day > daysInMonth) return undefined;

  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : undefined;
}

function mapArchive(value: unknown): ArchivedPage | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("guid" in value) ||
    !("url" in value) ||
    !("creation_timestamp" in value)
  ) {
    return undefined;
  }

  const { guid, url, creation_timestamp: creationTimestamp } = value;
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

  const metadata: ArchivedPage["_meta"] = { guid, timestamp: creationTimestamp };
  if ("title" in value && typeof value.title === "string") metadata.title = value.title;
  if ("status" in value && typeof value.status === "string") metadata.status = value.status;

  const createdBy =
    "created_by" in value &&
    typeof value.created_by === "object" &&
    value.created_by !== null &&
    "id" in value.created_by
      ? value.created_by.id
      : undefined;
  if (typeof createdBy === "string" || typeof createdBy === "number") {
    metadata.created_by = String(createdBy);
  }

  return {
    url: archivedUrl,
    timestamp,
    snapshot: `https://perma.cc/${encodeURIComponent(guid)}`,
    _meta: metadata,
  };
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
   */
  override cacheKey(options?: ArchiveOptions): string | undefined {
    const apiKey = options?.apiKey ?? this.options.apiKey;
    if (!apiKey) return undefined;

    const fingerprint = createHash("sha256").update(apiKey).digest("base64url");
    const limit = options?.limit ?? this.options.limit ?? 100;
    return `apiKey=${fingerprint},limit=${limit}`;
  }

  /**
   * Fetch archives matching one exact URL from the authenticated Perma.cc account.
   */
  async snapshots(
    domain: string,
    reqOptions: Partial<PermaccOptions> = {},
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
          timeout: options.timeout,
        },
      );

      const response: unknown = await $fetch("/v1/archives/", fetchOptions);
      if (
        typeof response !== "object" ||
        response === null ||
        !("objects" in response) ||
        !Array.isArray(response.objects)
      ) {
        throw new Error("Invalid Perma.cc API response");
      }

      const pages: ArchivedPage[] = [];
      for (const archive of response.objects) {
        const page = mapArchive(archive);
        if (page) pages.push(page);
      }

      const responseMeta: Record<string, unknown> = {};
      if ("meta" in response && typeof response.meta === "object" && response.meta !== null) {
        if ("limit" in response.meta && typeof response.meta.limit === "number") {
          responseMeta.limit = response.meta.limit;
        }
        if ("offset" in response.meta && typeof response.meta.offset === "number") {
          responseMeta.offset = response.meta.offset;
        }
        if ("total_count" in response.meta && typeof response.meta.total_count === "number") {
          responseMeta.total_count = response.meta.total_count;
        }
        if (
          "next" in response.meta &&
          (typeof response.meta.next === "string" || response.meta.next === null)
        ) {
          responseMeta.next = response.meta.next;
        }
        if (
          "previous" in response.meta &&
          (typeof response.meta.previous === "string" || response.meta.previous === null)
        ) {
          responseMeta.previous = response.meta.previous;
        }
      }

      return createSuccessResponse(pages, "permacc", {
        queryParams: fetchOptions.params,
        meta: responseMeta,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "UnknownError";
      return createErrorResponse(message, "permacc", { errorName });
    }
  }
}

export default function permacc(initOptions: Partial<PermaccOptions> = {}): PermaccProvider {
  return new PermaccProvider(initOptions);
}
