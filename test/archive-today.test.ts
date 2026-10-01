import { objectContaining } from "./_matchers";
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { fetchData } from "../src/utils/_fetch";
import { createArchive as createArchiveClient, resetConfig, storage } from "../src";
import createArchiveToday from "../src/providers/archive-today";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
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

    vi.mocked(fetchData).mockResolvedValueOnce(mockTimemapResponse);

    const archiveInstance = createArchiveToday();
    const archive = createArchiveClient(archiveInstance);
    const controller = new AbortController();
    const result = await archive.snapshots("example.com", { signal: controller.signal });

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(4);

    // Check first snapshot
    expect(result.pages[0].url).toBe("http://example.com/");
    expect(result.pages[0].snapshot).toBe("http://archive.md/20020120142510/http://example.com/");
    expect(result.pages[0]._meta.hash).toBe("20020120142510");
    expect(result.pages[0]._meta.raw_date).toBe("Sun, 20 Jan 2002 14:25:10 GMT");
    expect(result.pages[0]._meta.provider).toBe("archive-today");

    // Verify API call
    expect(fetchData).toHaveBeenCalledWith(
      "/timemap/http://example.com",
      objectContaining({
        baseURL: "https://archive.is",
        signal: controller.signal,
        responseType: "text",
        retry: 1,
        timeout: 60_000,
      }),
    );
  });

  it("preserves the original and snapshot URLs reported by the timemap", async () => {
    const originalUrl = "http://example.com/path//?next=//cdn.example/";
    const snapshotUrl = `http://archive.md/20140101030405/${originalUrl}`;
    vi.mocked(fetchData).mockResolvedValueOnce(
      `<${snapshotUrl}>; rel="memento"; datetime="Wed, 01 Jan 2014 03:04:05 GMT"`,
    );

    const archive = createArchiveClient(createArchiveToday());
    const result = await archive.snapshots("https://example.com/path//?next=//cdn.example/");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].url).toBe(originalUrl);
    expect(result.pages[0].snapshot).toBe(snapshotUrl);
  });

  /**
   * Honored before the filter, the init limit would let the 2018 memento
   * consume it and 2019 would read as never archived; dropped entirely, both
   * 2019 captures would come back. It caps the filtered rows instead.
   */
  it("lifts an init-level limit for the windowed fetch and restores it after the filter", async () => {
    const mockTimemapResponse = `
    <http://archive.md/20180101000000/https://example.com/>; rel="memento"; datetime="Mon, 01 Jan 2018 00:00:00 GMT",
    <http://archive.md/20190601000000/https://example.com/>; rel="memento"; datetime="Sat, 01 Jun 2019 00:00:00 GMT",
    <http://archive.md/20190901000000/https://example.com/>; rel="memento"; datetime="Sun, 01 Sep 2019 00:00:00 GMT"
    `;
    vi.mocked(fetchData).mockResolvedValueOnce(mockTimemapResponse);

    const archive = createArchiveClient(createArchiveToday({ limit: 1 }));
    const result = await archive.snapshots("example.com", { from: "2019", to: "2019" });

    expect(result.success).toBe(true);
    expect(result.pages.map((page) => page._meta.hash)).toEqual(["20190601000000"]);
  });

  it("falls back to the snapshot URL stamp when a memento datetime is unreadable", async () => {
    const mockTimemapResponse = `
    <http://archive.md/20140101030405/https://example.com/>; rel="memento"; datetime="not a date",
    <http://archive.md/201503081/https://example.com/>; rel="memento"; datetime="also not a date",
    <http://archive.md/20160810200921/https://example.com/>; rel="memento"; datetime="Wed, 10 Aug 2016 20:09:21 GMT"
    `;

    vi.mocked(fetchData).mockResolvedValueOnce(mockTimemapResponse);

    const archive = createArchiveClient(createArchiveToday());
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(true);
    // The first memento keeps the capture time its URL names instead of "now";
    // the second has no readable time anywhere and is dropped.
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].timestamp).toBe("2014-01-01T03:04:05Z");
    expect(result.pages[0]._meta.hash).toBe("20140101030405");
    expect(result.pages[1].timestamp).toBe("2016-08-10T20:09:21.000Z");
    expect(result.pages[1]._meta.position).toBe(1);
  });

  /**
   * The live timemap labels its newest row `rel="last memento"` and a lone
   * capture `rel="first last memento"`, so a match accepting only the `first`
   * qualifier silently drops the newest capture from every listing.
   */
  it("keeps the memento labeled last", async () => {
    const mockTimemapResponse = `
    <https://example.com/>; rel="original",
    <http://archive.md/timegate/https://example.com/>; rel="timegate",
    <http://archive.md/20020120142510/http://example.com/>; rel="first memento"; datetime="Sun, 20 Jan 2002 14:25:10 GMT",
    <http://archive.md/20140101030405/https://example.com/>; rel="memento"; datetime="Wed, 01 Jan 2014 03:04:05 GMT",
    <http://archive.md/20160810200921/https://example.com/>; rel="last memento"; datetime="Wed, 10 Aug 2016 20:09:21 GMT"
    `;

    vi.mocked(fetchData).mockResolvedValueOnce(mockTimemapResponse);

    const archive = createArchiveClient(createArchiveToday());
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages.map((page) => page._meta.hash)).toEqual([
      "20020120142510",
      "20140101030405",
      "20160810200921",
    ]);
  });

  it("parses a single-capture timemap labeled first last memento", async () => {
    const mockTimemapResponse = `
    <http://archive.md/20160810200921/https://example.com/>; rel="first last memento"; datetime="Wed, 10 Aug 2016 20:09:21 GMT"
    `;

    vi.mocked(fetchData).mockResolvedValueOnce(mockTimemapResponse);

    const archive = createArchiveClient(createArchiveToday());
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]._meta.hash).toBe("20160810200921");
  });

  it("returns an error response when the Memento API fails", async () => {
    vi.mocked(fetchData).mockRejectedValueOnce(new Error("API error"));

    const archive = createArchiveClient(createArchiveToday());
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe("API error");
    expect(result._meta?.source).toBe("archive-today");
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it("lists nothing for a URL the timemap answers 404 as never captured", async () => {
    const noMementos = Object.assign(new Error("404 Not Found"), {
      statusCode: 404,
      data: "TimeMap does not exists. The archive has no Mementos for the requested URI\n",
    });
    vi.mocked(fetchData).mockRejectedValueOnce(noMementos);

    const archive = createArchiveClient(createArchiveToday());
    const result = await archive.snapshots("nonexistent-domain.com");

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.pages).toHaveLength(0);
    expect(result._meta?.source).toBe("archive-today");
  });

  it("keeps other 404 responses as errors", async () => {
    const notFound = Object.assign(new Error("404 Not Found"), {
      statusCode: 404,
      data: "<html>Not Found</html>",
    });
    vi.mocked(fetchData).mockRejectedValueOnce(notFound);

    const archive = createArchiveClient(createArchiveToday());
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("404 Not Found");
  });

  it("handles empty response from both APIs", async () => {
    // Memento API returns empty response
    vi.mocked(fetchData).mockResolvedValueOnce("");

    const archiveInstance = createArchiveToday();
    const archive = createArchiveClient(archiveInstance);
    const result = await archive.snapshots("empty-domain-test.com");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
    expect(result._meta?.source).toBe("archive-today");
  });
});
