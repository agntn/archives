import { describe, it, expect, vi, beforeEach } from "vitest";
import { $fetch } from "ofetch";
import { createArchive as createArchiveClient, resetConfig, storage } from "../src";
import createArchiveToday from "../src/providers/archive-today";

vi.mock("ofetch", () => ({
  $fetch: vi.fn(),
}));

describe("archive.today", () => {
  beforeEach(async () => {
    await storage.clear();
    resetConfig();
    vi.resetAllMocks();
  });

  it("lists pages for a domain using Memento API", async () => {
    const mockTimemapResponse = `
    <https://example.com/>; rel="original",
    <http://archive.md/timegate/https://example.com/>; rel="timegate",
    <http://archive.md/20020120142510/http://example.com/>; rel="first memento"; datetime="Sun, 20 Jan 2002 14:25:10 GMT",
    <http://archive.md/20140101030405/https://example.com/>; rel="memento"; datetime="Wed, 01 Jan 2014 03:04:05 GMT",
    <http://archive.md/20150308151422/https://example.com/>; rel="memento"; datetime="Sun, 08 Mar 2015 15:14:22 GMT",
    <http://archive.md/20160810200921/https://example.com/>; rel="memento"; datetime="Wed, 10 Aug 2016 20:09:21 GMT"
    `;

    vi.mocked($fetch).mockResolvedValueOnce(mockTimemapResponse);

    const archiveInstance = createArchiveToday();
    const archive = createArchiveClient(archiveInstance);
    const controller = new AbortController();
    const result = await archive.snapshots("example.com", { signal: controller.signal });

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(4);

    // Check first snapshot
    expect(result.pages[0].url).toBe("https://example.com");
    expect(result.pages[0].snapshot).toBe("http://archive.md/20020120142510/http://example.com");
    expect(result.pages[0]._meta.hash).toBe("20020120142510");
    expect(result.pages[0]._meta.raw_date).toBe("Sun, 20 Jan 2002 14:25:10 GMT");

    // Verify API call
    expect($fetch).toHaveBeenCalledWith(
      "/timemap/http://example.com",
      expect.objectContaining({
        baseURL: "https://archive.is",
        signal: controller.signal,
        responseType: "text",
        retry: 1,
        timeout: 10000,
      }),
    );
  });

  it("returns an error response when the Memento API fails", async () => {
    vi.mocked($fetch).mockRejectedValueOnce(new Error("API error"));

    const archive = createArchiveClient(createArchiveToday());
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe("API error");
    expect(result._meta?.source).toBe("archive-today");
    expect($fetch).toHaveBeenCalledTimes(1);
  });

  it("handles empty results from Memento API", async () => {
    const mockEmptyResponse =
      "TimeMap does not exists. The archive has no Mementos for the requested URI";

    vi.mocked($fetch).mockResolvedValueOnce(mockEmptyResponse);

    const archiveInstance = createArchiveToday();
    const archive = createArchiveClient(archiveInstance);
    const result = await archive.snapshots("nonexistent-domain.com");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(0);
    expect(result._meta?.source).toBe("archive-today");
  });

  it("handles empty response from both APIs", async () => {
    // Memento API returns empty response
    vi.mocked($fetch).mockResolvedValueOnce("");

    const archiveInstance = createArchiveToday();
    const archive = createArchiveClient(archiveInstance);
    const result = await archive.snapshots("empty-domain-test.com");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
    expect(result._meta?.source).toBe("archive-today");
  });
});
