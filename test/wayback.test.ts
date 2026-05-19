import { describe, it, expect, vi, beforeEach } from "vitest";
import { $fetch } from "ofetch";
import { createArchive, resetConfig, storage } from "../src";
import createWayback from "../src/providers/wayback";

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
    const result = await archive.snapshots("example.com");

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
        method: "GET",
      }),
    );
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
