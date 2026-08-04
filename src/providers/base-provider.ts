import type { ArchiveOptions, ArchiveProvider, ArchiveResponse } from "../types";
import { mergeOptions } from "../utils";

/**
 * Abstract base class for archive providers.
 * Holds the instance's initial options; concrete providers override
 * `snapshots()` and call `this.resolveOptions(reqOptions)` to get the
 * effective options for a request.
 */
export abstract class BaseProvider implements ArchiveProvider {
  abstract readonly name: string;
  abstract readonly slug?: string;

  readonly initOptions: ArchiveOptions;

  constructor(initOptions: ArchiveOptions = {}) {
    this.initOptions = initOptions;
  }

  protected resolveOptions<T extends ArchiveOptions>(
    reqOptions: Partial<T> = {},
  ): Promise<T> {
    return mergeOptions<T>(this.initOptions as Partial<T>, reqOptions);
  }

  abstract snapshots(domain: string, options?: ArchiveOptions): Promise<ArchiveResponse>;
}
