import { fetchData } from "../utils/_fetch.ts";
import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveResponse,
  ArchivedPage,
  NlnzMetadata,
} from "../types.ts";
import type { NlnzOptions } from "../_providers.ts";
import {
  createErrorResponse,
  createFetchOptions,
  createSuccessResponse,
  createUnsupportedContentResponse,
  parsePywbCaptures,
  type PywbCapture,
  requestedWindow,
  waybackTimestampToISO,
  reverseSortQuery,
  listingPattern,
} from "../utils/index.ts";
import { BaseProvider } from "./base-provider.ts";

const BASE_URL = "https://ndhadeliver.natlib.govt.nz";
const PREFIX = "/webarchive";
/** No `length`: the index writes "0" there for nearly every record. */
const CDX_FIELDS = "url,timestamp,status,mime,digest";
const MALFORMED = "New Zealand Web Archive returned a malformed CDX record";

const UNSUPPORTED_CONTENT_REASON =
  "The New Zealand Web Archive serves its replay behind Imperva's browser check, which answers a script with a JavaScript challenge page (HTTP 200) instead of the capture. Only the CDX index is open to clients, so this provider lists captures and cannot read them. For the bytes, ask Wayback or Common Crawl for the same URL.";

function page(capture: Readonly<PywbCapture>): ArchivedPage {
  const metadata: NlnzMetadata = {
    provider: "nlnz",
    timestamp: capture.timestamp,
    ...(capture.status === undefined ? {} : { status: capture.status }),
    ...(capture.mime ? { mime: capture.mime } : {}),
    ...(capture.digest ? { digest: capture.digest } : {}),
  };
  return {
    url: capture.url,
    timestamp: waybackTimestampToISO(capture.timestamp),
    snapshot: `${BASE_URL}${PREFIX}/${capture.timestamp}/${capture.url}`,
    _meta: metadata,
  };
}

/** The New Zealand Web Archive at the National Library. Its index is open, its replay is not. */
export class NlnzProvider extends BaseProvider<NlnzOptions> {
  readonly name = "New Zealand Web Archive";
  readonly slug = "nlnz";

  override cacheKey(options?: Readonly<ArchiveOptions>): string {
    const requestedLimit =
      options && Object.hasOwn(options, "limit") ? options.limit : this.options.limit;
    return `nlnzLimit=${requestedLimit ?? 1000}`;
  }

  /**
   * Lists captures under a domain or URL. pywb reads limit=0 as "everything", so it never goes out.
   * @param domain - Domain, URL or URL prefix to list.
   * @param reqOptions - Per call options.
   * @returns {Promise<ArchiveResponse>} The captures, oldest first.
   */
  async snapshots(
    domain: string,
    reqOptions: Readonly<NlnzOptions> = {},
  ): Promise<ArchiveResponse> {
    try {
      const options = await this.resolveOptions(reqOptions);
      const target = domain.trim();
      if (!target) throw new Error("New Zealand Web Archive target must not be empty");

      const limit = options.limit ?? 1000;
      if (limit <= 0) return createSuccessResponse([], "nlnz");

      const fetchOptions = await createFetchOptions(
        BASE_URL,
        {
          url: listingPattern(target, options.order),
          ...requestedWindow(options),
          ...reverseSortQuery(options.order),
          output: "json",
          fl: CDX_FIELDS,
          limit: String(limit),
        },
        {
          retries: options.retries,
          signal: options.signal,
          timeout: options.timeout,
          responseType: "text",
        },
      );
      const raw: unknown = await fetchData(`${PREFIX}/cdx`, fetchOptions);
      return createSuccessResponse(parsePywbCaptures(raw, MALFORMED).map(page), "nlnz", {
        queryParams: fetchOptions.params,
      });
    } catch (error) {
      return createErrorResponse(error, "nlnz");
    }
  }

  override content(
    _url: string,
    _options: Readonly<ArchiveContentOptions> = {},
  ): Promise<ArchiveContentResponse> {
    return Promise.resolve(
      createUnsupportedContentResponse(UNSUPPORTED_CONTENT_REASON, "nlnz", {
        operation: "content",
      }),
    );
  }
}

export default function nlnz(initOptions: Readonly<NlnzOptions> = {}): NlnzProvider {
  return new NlnzProvider(initOptions);
}
