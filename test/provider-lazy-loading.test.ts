import { describe, expect, it } from "vitest";
import { createRetryableLazyImport } from "../src/providers/_lazy-import";

describe("provider lazy loading", () => {
  it("shares one in-flight module load across concurrent calls", async () => {
    const deferred = Promise.withResolvers<{ readonly value: string }>();
    let attempts = 0;
    const load = createRetryableLazyImport(() => {
      attempts += 1;
      return deferred.promise;
    });

    const first = load();
    const second = load();

    expect(attempts).toBe(1);
    expect(first).toBe(second);

    deferred.resolve({ value: "loaded" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: "loaded" },
      { value: "loaded" },
    ]);
  });

  it("retries a module load after rejection", async () => {
    const failure = new Error("load failed");
    let attempts = 0;
    const load = createRetryableLazyImport(async () => {
      attempts += 1;
      if (attempts === 1) throw failure;
      return { value: "loaded" };
    });

    await expect(load()).rejects.toBe(failure);
    await expect(load()).resolves.toEqual({ value: "loaded" });
    expect(attempts).toBe(2);
  });
});
