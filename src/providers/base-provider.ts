import type { ArchiveOptions, ArchiveProvider, ArchiveResponse } from "../types";
import { mergeOptions } from "../utils";

/**
 * Abstract base class for archive providers.
 * Holds the instance's initial options; concrete providers override
 * `snapshots()` and call `this.resolveOptions(reqOptions)` to get the
 * effective options for a request.
 *
 * @template TOptions - Provider-specific options extending the shared archive options.
 */
export abstract class BaseProvider<TOptions extends ArchiveOptions = ArchiveOptions>
  implements ArchiveProvider
{
  abstract readonly name: string;
  abstract readonly slug?: string;

  readonly options: Partial<TOptions>;

  constructor(options: Partial<TOptions> = {}) {
    this.options = { ...options };
    if (typeof this.snapshots === "function") {
      this.snapshots = this.snapshots.bind(this);
    }
  }

  protected resolveOptions(reqOptions: Partial<TOptions> = {}): Promise<TOptions> {
    return mergeOptions<TOptions>(this.options, reqOptions);
  }

  abstract snapshots(
    domain: string,
    options?: ArchiveOptions,
  ): Promise<ArchiveResponse>;
}
