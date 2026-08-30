import { objectContaining } from "./_matchers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { $fetch } from "ofetch";
import { createArchive, resetConfig, storage } from "../src";
import createArchiveIt from "../src/providers/archive-it";

vi.mock("ofetch", () => ({
  $fetch: vi.fn(),
}));

describe("Archive-It", () => {
  beforeEach(async () => {
    await storage.clear();
    resetConfig();
    vi.resetAllMocks();
  });

  it("normalizes collection whitespace in cache keys", () => {
    expect(createArchiveIt({ collection: " 4399 " }).cacheKey()).toBe("collection=4399");
  });

  it("includes the provider init limit in its cache key", () => {
    expect(createArchiveIt({ collection: 4399, limit: 25 }).cacheKey()).toBe(
      "collection=4399:limit=25",
    );
  });

  it("does not duplicate a request limit in its provider cache key", () => {
    expect(createArchiveIt({ collection: 4399, limit: 25 }).cacheKey({ limit: 10 })).toBe(
      "collection=4399",
    );
  });

  /**
   * The provider is a public export, so a caller can hand it the ISO bounds
   * ArchiveOptions promises without going through Archive.snapshots; the digits
   * have to come out of the provider's own normalization then.
   */
  it("normalizes ISO bounds when the provider is called directly", async () => {
    vi.mocked($fetch).mockResolvedValueOnce("");

    const result = await createArchiveIt({ collection: 4399 }).snapshots("example.com", {
      from: "2019-03-01",
      to: "2019-06",
    });

    expect(result.success).toBe(true);
    expect($fetch).toHaveBeenCalledWith(
      "/4399/timemap/cdx",
      objectContaining({
        params: objectContaining({ from: "20190301", to: "201906" }),
      }),
    );
  });

  it("lists pages from a collection CDX index", async () => {
    vi.mocked($fetch).mockResolvedValueOnce(
      [
        "https://example.com/ 20220101000000 200",
        "https://example.com/page 20220201000000 404",
      ].join("\n"),
    );

    const archive = createArchive(createArchiveIt({ collection: 4399 }));
    const result = await archive.snapshots("example.com", { limit: 2 });

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toMatchObject({
      url: "https://example.com/",
      timestamp: "2022-01-01T00:00:00Z",
      snapshot: "https://wayback.archive-it.org/4399/20220101000000/https://example.com/",
      _meta: {
        timestamp: "20220101000000",
        status: 200,
        provider: "archive-it",
      },
    });
    expect(result._meta).toMatchObject({ source: "archive-it", collection: "4399" });
    expect($fetch).toHaveBeenCalledWith(
      "/4399/timemap/cdx",
      objectContaining({
        baseURL: "https://wayback.archive-it.org",
        responseType: "text",
        params: objectContaining({
          url: "example.com/*",
          fl: "original,timestamp,statuscode",
          limit: "2",
        }),
      }),
    );
  });

  it("passes collection-specific CDX filters", async () => {
    vi.mocked($fetch).mockResolvedValueOnce("");

    const archive = createArchive(
      createArchiveIt({
        collection: "4399",
        collapse: "timestamp:10",
        filter: "statuscode:200",
        from: "2020",
        to: "2024",
      }),
    );
    await archive.snapshots("https://example.com/page");

    expect($fetch).toHaveBeenCalledWith(
      "/4399/timemap/cdx",
      objectContaining({
        params: objectContaining({
          url: "example.com/page",
          collapse: "timestamp:10",
          filter: "statuscode:200",
          from: "2020",
          to: "2024",
        }),
      }),
    );
  });

  it("returns an empty success response for an empty CDX result", async () => {
    vi.mocked($fetch).mockResolvedValueOnce("");

    const result = await createArchive(createArchiveIt({ collection: 4399 })).snapshots(
      "missing.example",
    );

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("rejects a non-numeric collection ID without making a request", async () => {
    const result = await createArchive(createArchiveIt({ collection: "all" })).snapshots(
      "example.com",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Archive-It collection must be a numeric collection ID");
    expect($fetch).not.toHaveBeenCalled();
  });
});
