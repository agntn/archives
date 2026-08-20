import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveProvider,
  ArchiveResponse,
} from "../types";
import type { WebCiteOptions } from "../_providers";
import { createUnsupportedContentResponse, createUnsupportedResponse } from "../utils";
import { BaseProvider } from "./base-provider";

const UNSUPPORTED_LIST_REASON =
  "WebCite has no list-by-domain API. Existing snapshots can be fetched directly via webcitation.org/<id>; new archives have not been accepted since ~2019.";

const UNSUPPORTED_CONTENT_REASON =
  "WebCite resolves captures only by opaque snapshot id, and has no lookup-by-URL API that could turn a URL into one, so there is no capture to read.";

/**
 * WebCite archive provider.
 *
 * WebCite does not expose a list-by-domain endpoint, so `snapshots(domain)`
 * always returns an unsupported response. Existing snapshots are still
 * retrievable via direct webcitation.org/<id> URLs once a `getById` API is
 * added at the aggregator level.
 */
export class WebCiteProvider extends BaseProvider<WebCiteOptions> {
  readonly name = "WebCite";
  readonly slug = "webcite";

  async snapshots(_domain: string, _options: WebCiteOptions = {}): Promise<ArchiveResponse> {
    return createUnsupportedResponse(UNSUPPORTED_LIST_REASON, "webcite", {
      operation: "snapshots",
    });
  }

  override content(
    _url: string,
    _options: ArchiveContentOptions = {},
  ): Promise<ArchiveContentResponse> {
    return Promise.resolve(
      createUnsupportedContentResponse(UNSUPPORTED_CONTENT_REASON, "webcite", {
        operation: "content",
      }),
    );
  }
}

/**
 * Create a WebCite archive provider.
 * Backwards-compatible functional factory; prefer `new WebCiteProvider(...)`.
 */
export default function webcite(_initOptions: Partial<WebCiteOptions> = {}): ArchiveProvider {
  return new WebCiteProvider(_initOptions);
}
