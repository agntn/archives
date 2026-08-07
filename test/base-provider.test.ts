import { describe, expect, it } from "vitest";
import { BaseProvider } from "../src/providers/base-provider";
import type { ArchiveOptions, ArchiveResponse } from "../src/types";

class ArrowProvider extends BaseProvider {
  readonly name = "Arrow provider";
  readonly slug = "arrow";

  snapshots = async (
    _domain: string,
    _options?: ArchiveOptions,
  ): Promise<ArchiveResponse> => ({
    success: true,
    pages: [],
  });
}

class MethodProvider extends BaseProvider {
  readonly name = "Method provider";
  readonly slug = "method";

  async snapshots(): Promise<ArchiveResponse> {
    return { success: true, pages: [] };
  }
}

describe("BaseProvider", () => {
  it("supports snapshots implemented as an arrow field", async () => {
    const provider = new ArrowProvider();
    const snapshots = provider.snapshots;

    await expect(snapshots("example.com")).resolves.toMatchObject({
      success: true,
      pages: [],
    });
  });

  it("defaults to no provider-specific cache key", () => {
    const provider = new MethodProvider();

    expect(provider.cacheKey()).toBeUndefined();
  });

  it("isolates provider state from caller-owned options", () => {
    const options = { limit: 1 };
    const provider = new MethodProvider(options);

    options.limit = 2;

    expect(provider.options.limit).toBe(1);
  });
});
