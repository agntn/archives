import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { assertRateLimit, cachedAnswer, RATE_LIMIT } from "../docs/server/utils/query";

type Env = Readonly<Record<string, unknown>>;

interface FakeEvent {
  readonly headers: Readonly<Record<string, string>>;
  readonly context: Readonly<{ cloudflare?: Readonly<{ env: Env }>; clientAddress?: string }>;
}

type H3Event = Parameters<typeof assertRateLimit>[0];

/** Headers the code under test set on the response, reset before each test. */
const sentHeaders = new Map<string, unknown>();

function fakeEvent(headers: Readonly<Record<string, string>>, env?: Env): H3Event {
  const event: FakeEvent = { headers, context: env ? { cloudflare: { env } } : {} };
  return event as unknown as H3Event;
}

/**
 * KV as the worker sees it: every read and write settles on a later tick.
 *
 * @returns {object} A `useStorage` stand-in with spied `getItem` and `setItem`.
 */
function memoryStorage() {
  const items = new Map<string, unknown>();
  return {
    getItem: vi.fn(async (key: string) => {
      await Promise.resolve();
      return items.get(key) ?? null;
    }),
    setItem: vi.fn(async (key: string, value: unknown, _options?: unknown) => {
      await Promise.resolve();
      items.set(key, value);
    }),
  };
}

/** Stubs the h3 auto-imports Nitro provides, reduced to what the rate limit reads. */
function stubH3(): void {
  vi.stubGlobal(
    "getRequestHeader",
    (event: Readonly<FakeEvent>, name: string) => event.headers[name.toLowerCase()],
  );
  vi.stubGlobal(
    "getRequestIP",
    (event: Readonly<FakeEvent>, options?: Readonly<{ xForwardedFor?: boolean }>) => {
      const forwarded = options?.xForwardedFor
        ? event.headers["x-forwarded-for"]?.split(",")[0]?.trim()
        : undefined;
      return forwarded ?? event.context.clientAddress;
    },
  );
  vi.stubGlobal("setResponseHeader", (_event: unknown, name: string, value: unknown) => {
    sentHeaders.set(name, value);
  });
  vi.stubGlobal("createError", (input: Readonly<{ statusCode: number; statusMessage: string }>) =>
    Object.assign(new Error(input.statusMessage), input),
  );
}

beforeEach(() => {
  sentHeaders.clear();
  stubH3();
  vi.stubGlobal("useStorage", () => memoryStorage());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("docs rate limit", () => {
  it("keys the binding by CF-Connecting-IP, whatever X-Forwarded-For says", async () => {
    const keys: string[] = [];
    const env = {
      ARCHIVE_LIMIT: {
        limit: async ({ key }: Readonly<{ key: string }>) => {
          keys.push(key);
          return { success: true };
        },
      },
    };

    for (const spoofed of ["10.0.0.1", "10.0.0.2", "10.0.0.3"]) {
      await assertRateLimit(
        fakeEvent(
          { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": `${spoofed}, 203.0.113.7` },
          env,
        ),
      );
    }

    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
  });

  it("answers 429 with Retry-After when the binding refuses", async () => {
    const event = fakeEvent(
      { "cf-connecting-ip": "203.0.113.7" },
      { ARCHIVE_LIMIT: { limit: async () => ({ success: false }) } },
    );

    await expect(assertRateLimit(event)).rejects.toMatchObject({ statusCode: 429 });
    expect(sentHeaders.get("Retry-After")).toBe(60);
  });

  it("ignores a rotated X-Forwarded-For without the binding", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T12:00:10Z"), toFake: ["Date"] });
    const storage = memoryStorage();
    vi.stubGlobal("useStorage", () => storage);
    let refused = 0;

    for (let index = 0; index < RATE_LIMIT + 5; index++) {
      const event = fakeEvent({
        "cf-connecting-ip": "198.51.100.9",
        "x-forwarded-for": `10.1.0.${index}`,
      });
      try {
        await assertRateLimit(event);
      } catch {
        refused++;
      }
    }

    expect(refused).toBe(5);
  });

  it("holds the limit for a burst of parallel misses without the binding", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T12:01:10Z"), toFake: ["Date"] });
    const storage = memoryStorage();
    vi.stubGlobal("useStorage", () => storage);

    const results = await Promise.allSettled(
      Array.from({ length: RATE_LIMIT + 5 }, () =>
        assertRateLimit(fakeEvent({ "cf-connecting-ip": "198.51.100.10" })),
      ),
    );

    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(5);
  });

  it("gives the binding the number the 429 message quotes", () => {
    const config = readFileSync(new URL("../docs/wrangler.jsonc", import.meta.url), "utf8");
    const binding =
      /"name": "ARCHIVE_LIMIT",[^}]*"simple": \{ "limit": (\d+), "period": 60 \}/u.exec(config);

    expect(Number(binding?.[1])).toBe(RATE_LIMIT);
  });

  it("writes a cached answer with its ttl so KV drops it", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("useStorage", () => storage);
    const event = fakeEvent(
      { "cf-connecting-ip": "203.0.113.7" },
      { ARCHIVE_LIMIT: { limit: async () => ({ success: true }) } },
    );

    await cachedAnswer(event, "snapshots", { target: "example.com" }, 1800, async () => ({
      value: "clean",
      degraded: false,
    }));
    await cachedAnswer(event, "snapshots", { target: "example.org" }, 1800, async () => ({
      value: "degraded",
      degraded: true,
    }));

    expect(storage.setItem.mock.calls.map((call) => call[2])).toEqual([
      { ttl: 1800 },
      { ttl: 300 },
    ]);
  });
});
