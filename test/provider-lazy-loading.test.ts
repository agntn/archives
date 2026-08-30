import { describe, expect, it } from "vitest";
import { createRetryableLazyImport } from "../src/providers/_lazy-import";

function deferred<T>() {
  let resolve = (_value: T): void => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describe("provider lazy loading", () => {
  it("shares one in-flight module load across concurrent calls", async () => {
    const pending = deferred<{ readonly value: string }>();
    let attempts = 0;
    const load = createRetryableLazyImport(() => {
      attempts += 1;
      return pending.promise;
    });

    const first = load();
    const second = load();

    expect(attempts).toBe(1);
    expect(first).toBe(second);

    pending.resolve({ value: "loaded" });
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
