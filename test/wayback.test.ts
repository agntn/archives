import { describe, it, expect, vi, beforeEach } from "vitest";
import { $fetch } from "ofetch";
import { createArchive, resetConfig, storage } from "../src";
import createWayback from "../src/providers/wayback";
import type { WaybackOptions } from "../src/_providers";

vi.mock("ofetch", () => ({
  $fetch: vi.fn(),
}));

describe("wayback machine", () => {
  beforeEach(async () => {
    await storage.clear();
    resetConfig();
    vi.resetAllMocks();
  });

  it("lists pages for a domain", async () => {
    const mockResponse = [
      ["original", "timestamp", "statuscode"],
      ["https://example.com", "20220101000000", "200"],
      ["https://example.com/page1", "20220201000000", "200"],
    ];

    vi.mocked($fetch).mockResolvedValueOnce(mockResponse);

    const waybackInstance = createWayback();
    const archive = createArchive(waybackInstance);
    const controller = new AbortController();
    const result = await archive.snapshots("example.com", { signal: controller.signal });

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].url).toBe("https://example.com");
    expect(result.pages[0].snapshot).toBe(
      "https://web.archive.org/web/20220101000000/https://example.com",
    );
    expect(result.pages[0]._meta.timestamp).toBe("20220101000000");
    expect(result.pages[0]._meta.status).toBe(200);

    expect(result.pages[1].url).toBe("https://example.com/page1");
    expect(result.pages[1].snapshot).toBe(
      "https://web.archive.org/web/20220201000000/https://example.com/page1",
    );
    expect(result.pages[1]._meta.timestamp).toBe("20220201000000");
    expect(result.pages[1]._meta.status).toBe(200);
    expect($fetch).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      expect.objectContaining({
        baseURL: "https://web.archive.org",
        signal: controller.signal,
        method: "GET",
      }),
    );
  });

  it("keeps snapshots callable when passed as a callback", async () => {
    vi.mocked($fetch).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);
    const snapshots = createWayback().snapshots;

    const result = await snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("handles empty results", async () => {
    // Mock an empty response (only headers, no data rows)
    vi.mocked($fetch).mockResolvedValueOnce([
      ["original", "timestamp", "statuscode"],
      // No data rows
    ]);

    const waybackInstance = createWayback();
    const archive = createArchive(waybackInstance);
    const result = await archive.snapshots("nonexistent-domain.com");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(0);
    expect(result._meta?.source).toBe("wayback");
  });

  it("passes CDX collapse and filter options", async () => {
    vi.mocked($fetch).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);

    const archive = createArchive(
      createWayback({ collapse: "digest", filter: "statuscode:200", limit: 25 }),
    );
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(true);
    expect($fetch).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      expect.objectContaining({
        params: expect.objectContaining({
          collapse: "digest",
          filter: "statuscode:200",
          limit: "25",
        }),
      }),
    );
  });

  it("separates cache entries for CDX collapse and filter options", async () => {
    vi.mocked($fetch)
      .mockResolvedValueOnce([
        ["original", "timestamp", "statuscode"],
        ["https://example.com/digest", "20220101000000", "200"],
      ])
      .mockResolvedValueOnce([
        ["original", "timestamp", "statuscode"],
        ["https://example.com/year", "20220101000000", "200"],
      ])
      .mockResolvedValueOnce([
        ["original", "timestamp", "statuscode"],
        ["https://example.com/not-found", "20220101000000", "200"],
      ]);

    const archive = createArchive(
      createWayback({ collapse: "digest", filter: "statuscode:200" }),
    );
    const byYear: WaybackOptions = { collapse: "timestamp:4" };
    const notFound: WaybackOptions = { filter: "statuscode:404" };

    const first = await archive.snapshots("example.com");
    const second = await archive.snapshots("example.com", byYear);
    const third = await archive.snapshots("example.com", notFound);
    const cachedFirst = await archive.snapshots("example.com");

    expect(first.pages[0].url).toBe("https://example.com/digest");
    expect(second.pages[0].url).toBe("https://example.com/year");
    expect(third.pages[0].url).toBe("https://example.com/not-found");
    expect(cachedFirst.fromCache).toBe(true);
    expect(cachedFirst.pages[0].url).toBe("https://example.com/digest");
    expect($fetch).toHaveBeenCalledTimes(3);
  });

  it("returns an error response when fetching fails", async () => {
    vi.mocked($fetch).mockRejectedValueOnce(new Error("API error"));

    const archive = createArchive(createWayback());
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe("API error");
    expect(result._meta?.source).toBe("wayback");
  });
});
