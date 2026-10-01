import { objectContaining } from "./_matchers";
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { loadConfig } from "c12";
import { fetchData } from "../src/utils/_fetch";
import { createArchive, resetConfig } from "../src";
import type { ArchiveOptions } from "../src";
import createArchiveToday from "../src/providers/archive-today";
import createArquivo from "../src/providers/arquivo";
import createCommonCrawl from "../src/providers/commoncrawl";
import createWayback from "../src/providers/wayback";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
}));

vi.mock("c12", () => ({
  loadConfig: vi.fn(),
}));

const EMPTY_CDX = [["original", "timestamp", "statuscode"]];

/* Uses the given config timeout, or the built-in ten seconds without one. */
function configTimeout(timeout?: number): void {
  vi.mocked(loadConfig).mockResolvedValue({
    config: timeout === undefined ? {} : { performance: { timeout } },
  } as Awaited<ReturnType<typeof loadConfig>>);
  resetConfig();
}

/* The timeout of the first request the provider sent. */
function sentTimeout(): unknown {
  const [, options] = vi.mocked(fetchData).mock.calls[0] ?? [];
  return (options as { timeout?: unknown } | undefined)?.timeout;
}

describe("provider timeouts inside createArchive", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    configTimeout();
    vi.mocked(fetchData).mockResolvedValue(EMPTY_CDX);
  });

  it.each([
    ["wayback", () => createWayback({ timeout: 2_000 })],
    ["arquivo", () => createArquivo({ timeout: 2_000 })],
  ])("keeps the %s factory timeout rather than the config default", async (_name, create) => {
    const archive = createArchive(create(), { cache: false });

    await archive.snapshots("example.com");

    expect(sentTimeout()).toBe(2_000);
  });

  it("gives the Wayback index a minute when nobody names a timeout", async () => {
    const archive = createArchive(createWayback(), { cache: false });

    await archive.snapshots("example.com");
    expect(sentTimeout()).toBe(60_000);

    vi.mocked(fetchData).mockClear();
    await archive.content("https://example.com/", { timestamp: "2026" });
    expect(sentTimeout()).toBe(60_000);
  });

  it.each([
    ["commoncrawl", createCommonCrawl],
    ["archive-today", createArchiveToday],
  ])("gives %s a minute when nobody names a timeout", async (_name, create) => {
    const archive = createArchive(create(), { cache: false, retries: 0 });

    await archive.snapshots("example.com");
    expect(sentTimeout()).toBe(60_000);

    vi.mocked(fetchData).mockClear();
    await archive.content("https://example.com/", { timestamp: "2026" });
    expect(sentTimeout()).toBe(60_000);
  });

  it("leaves providers without a default on the configured timeout", async () => {
    const archive = createArchive(createArquivo(), { cache: false });

    await archive.snapshots("example.com");

    expect(sentTimeout()).toBe(10_000);
  });

  it.each<[string, number | undefined, ArchiveOptions, ArchiveOptions, number]>([
    ["archive options", undefined, { timeout: 5_000 }, {}, 5_000],
    ["call options", undefined, {}, { timeout: 5_000 }, 5_000],
    ["a longer config timeout", 90_000, {}, {}, 90_000],
    ["a config without a deadline", 0, {}, {}, 0],
  ])("lets %s decide the Wayback timeout", async (_name, config, init, call, expected) => {
    configTimeout(config);
    const archive = createArchive(createWayback(), { cache: false, ...init });

    await archive.snapshots("example.com", call);

    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({ timeout: expected }),
    );
  });
});
