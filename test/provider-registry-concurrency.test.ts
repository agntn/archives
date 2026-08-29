import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("../src/providers/_lazy-import");
  vi.resetModules();
});

describe("provider registry concurrency", () => {
  it("loads a cold provider module once while keeping instances independent", async () => {
    let importAttempts = 0;
    vi.doMock("../src/providers/_lazy-import", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/providers/_lazy-import")>();

      return {
        ...actual,
        createRetryableLazyImport: <T>(load: () => Promise<T>) =>
          actual.createRetryableLazyImport(() => {
            importAttempts += 1;
            return load();
          }),
      };
    });

    const { providers } = await import("../src/providers/index");
    const [first, second] = await Promise.all([
      providers.wayback({ limit: 1 }),
      providers.wayback({ limit: 2 }),
    ]);

    expect(importAttempts).toBe(1);
    expect(first).not.toBe(second);
    expect(first.options?.limit).toBe(1);
    expect(second.options?.limit).toBe(2);
  });
});
