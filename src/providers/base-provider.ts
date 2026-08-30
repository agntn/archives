import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveProvider,
  ArchiveResponse,
} from "../types";
import { mergeOptions } from "../utils";

/**
 * Abstract base class for archive providers.
 * Holds the instance's initial options; concrete providers override
 * `snapshots()` and call `this.resolveOptions(reqOptions)` to get the
 * effective options for a request.
 *
 * `content()` is optional: a provider that cannot serve archived bodies leaves
 * it out, or overrides it with an unsupported response naming the gap.
 *
 * @template TOptions - Provider-specific options extending the shared archive options.
 */
export abstract class BaseProvider<
  TOptions extends ArchiveOptions = ArchiveOptions,
> implements ArchiveProvider {
  abstract readonly name: string;
  abstract readonly slug?: string;
  cacheKey(_options?: Readonly<ArchiveOptions>): string | undefined {
    return undefined;
  }

  readonly options: Partial<TOptions>;

  constructor(options: Partial<TOptions> = {}) {
    this.options = { ...options };
    if (typeof this.snapshots === "function") {
      this.snapshots = this.snapshots.bind(this);
    }
    if (typeof this.content === "function") {
      this.content = this.content.bind(this);
    }
  }

  protected resolveOptions(reqOptions: Partial<TOptions> = {}): Promise<TOptions> {
    return mergeOptions<TOptions>(this.options, reqOptions);
  }

  /**
   * Same cascade as {@link resolveOptions}, keeping the content-only options typed.
   *
   * @param reqOptions - Req Options.
   * @returns {Promise<TOptions & ArchiveContentOptions>} A promise resolving to the operation result.
   */
  protected resolveContentOptions(
    reqOptions?: Readonly<Partial<TOptions & ArchiveContentOptions>>,
  ): Promise<TOptions & ArchiveContentOptions> {
    return mergeOptions<TOptions & ArchiveContentOptions>(this.options, reqOptions ?? {});
  }

  abstract snapshots(domain: string, options?: Readonly<ArchiveOptions>): Promise<ArchiveResponse>;

  content?(url: string, options?: Readonly<ArchiveContentOptions>): Promise<ArchiveContentResponse>;
}
