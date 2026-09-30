import type {
  ArchiveContentOptions,
  ArchiveContentResponse,
  ArchiveOptions,
  ArchiveProvider,
  ArchiveResponse,
} from "../types.ts";
import { mergeOptions } from "../utils/index.ts";

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

  /** Floor in ms for the configured timeout; a factory or call timeout wins, and `0` stays `0`. */
  protected readonly defaultTimeout?: number;

  protected async resolveOptions(reqOptions: Partial<TOptions> = {}): Promise<TOptions> {
    return this.applyDefaultTimeout(
      await mergeOptions<TOptions>(this.options, reqOptions),
      reqOptions,
    );
  }

  /**
   * Same cascade as {@link resolveOptions}, keeping the content-only options typed.
   *
   * @param reqOptions - Req Options.
   * @returns {Promise<TOptions & ArchiveContentOptions>} A promise resolving to the operation result.
   */
  protected async resolveContentOptions(
    reqOptions?: Readonly<Partial<TOptions & ArchiveContentOptions>>,
  ): Promise<TOptions & ArchiveContentOptions> {
    return this.applyDefaultTimeout(
      await mergeOptions<TOptions & ArchiveContentOptions>(this.options, reqOptions ?? {}),
      reqOptions,
    );
  }

  /**
   * Raises an unnamed timeout to {@link defaultTimeout}.
   *
   * @param merged - Options after the cascade.
   * @param reqOptions - Options of the call, as the caller passed them.
   * @returns {T} The options with the provider's timeout floor applied.
   */
  private applyDefaultTimeout<T extends ArchiveOptions>(
    merged: T,
    reqOptions?: Readonly<ArchiveOptions>,
  ): T {
    const floor = this.defaultTimeout;
    if (floor === undefined || this.options.timeout !== undefined) return merged;
    if (reqOptions?.timeout !== undefined || merged.timeout === 0) return merged;
    return { ...merged, timeout: Math.max(merged.timeout ?? 0, floor) };
  }

  abstract snapshots(domain: string, options?: Readonly<ArchiveOptions>): Promise<ArchiveResponse>;

  content?(url: string, options?: Readonly<ArchiveContentOptions>): Promise<ArchiveContentResponse>;
}
