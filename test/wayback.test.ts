import { objectContaining } from "./_matchers";
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { fetchData } from "../src/utils/_fetch";
import { createArchive, resetConfig } from "../src";
import createWayback from "../src/providers/wayback";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
}));

describe("wayback machine", () => {
  beforeEach(async () => {
    resetConfig();
    vi.resetAllMocks();
  });

  it("lists pages for a domain", async () => {
    const mockResponse = [
      ["original", "timestamp", "statuscode"],
      ["https://example.com", "20220101000000", "200"],
      ["https://example.com/page1", "20220201000000", "200"],
    ];

    vi.mocked(fetchData).mockResolvedValueOnce(mockResponse);

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
    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({
        baseURL: "https://web.archive.org",
        signal: controller.signal,
        method: "GET",
      }),
    );
  });

  it("keeps snapshots callable when passed as a callback", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);
    /* oxlint-disable-next-line typescript/unbound-method -- extraction is the behavior under test; BaseProvider binds this method. */
    const snapshots = createWayback().snapshots;

    const result = await snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("handles empty results", async () => {
    // Mock an empty response (only headers, no data rows)
    vi.mocked(fetchData).mockResolvedValueOnce([
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

  it("asks CDX for the digest, MIME type and length of every capture", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce([
      ["original", "timestamp", "statuscode", "digest", "mimetype", "length"],
      [
        "http://example.com:80/",
        "20020120142510",
        "200",
        "HT2DYGA5UKZCPBSFVCV3JOBXGW2G5UUA",
        "text/html",
        "1792",
      ],
      [
        "http://example.com/",
        "20020328012821",
        "-",
        "UY3I2DT2AMWAY6DECFCFYMT5ZOTFHUCH",
        "warc/revisit",
        "-",
      ],
    ]);

    const result = await createArchive(
      createWayback({ filter: "digest:HT2DYGA5UKZCPBSFVCV3JOBXGW2G5UUA" }),
    ).snapshots("example.com");

    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({
        params: objectContaining({
          fl: "original,timestamp,statuscode,digest,mimetype,length",
          filter: "digest:HT2DYGA5UKZCPBSFVCV3JOBXGW2G5UUA",
        }),
      }),
    );
    expect(result.pages[0]?._meta).toEqual({
      timestamp: "20020120142510",
      status: 200,
      digest: "HT2DYGA5UKZCPBSFVCV3JOBXGW2G5UUA",
      mime: "text/html",
      length: "1792",
      provider: "wayback",
    });
    expect(result.pages[1]?._meta).not.toHaveProperty("length");
    expect(result.pages[1]?._meta.digest).toBe("UY3I2DT2AMWAY6DECFCFYMT5ZOTFHUCH");
  });

  it("passes CDX collapse and filter options", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);

    const archive = createArchive(
      createWayback({ collapse: "digest", filter: "statuscode:200", limit: 25 }),
    );
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({
        params: objectContaining({
          collapse: "digest",
          filter: "statuscode:200",
          limit: "25",
        }),
      }),
    );
  });

  it("narrows the CDX query to the requested window", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);

    const archive = createArchive(createWayback());
    const result = await archive.snapshots("example.com", { from: "2019-03-01", to: "2019-06" });

    expect(result.success).toBe(true);
    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({
        params: objectContaining({ from: "20190301", to: "201906" }),
      }),
    );
  });

  /**
   * The provider is a public export, so a caller can hand it the ISO bounds
   * ArchiveOptions promises without going through Archive.snapshots; the digits
   * have to come out of the provider's own normalization then.
   */
  it("normalizes ISO bounds when the provider is called directly", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);

    const result = await createWayback().snapshots("example.com", {
      from: "2019-03-01",
      to: "2019-06",
    });

    expect(result.success).toBe(true);
    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({
        params: objectContaining({ from: "20190301", to: "201906" }),
      }),
    );
  });

  /**
   * Left raw, the init-level date would reach CDX as from=2019-03-01, which
   * the index does not read as an instant.
   */
  it("normalizes an init-level ISO bound before it reaches the CDX query", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);

    const archive = createArchive(createWayback({ from: "2019-03-01" }));
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({
        params: objectContaining({ from: "20190301" }),
      }),
    );
  });

  /** The third query repeats the first window, so it must replay that answer rather than the other window's entry or a fresh fetch. */
  /** A plain limit keeps CDX's first rows, so old captures crowd out the latest ones. */
  it("asks CDX for the last rows of a page when the newest come first", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce([
      ["original", "timestamp", "statuscode"],
      ["https://example.com/about", "20240101000000", "200"],
      ["https://example.com/about", "20250101000000", "200"],
    ]);

    const result = await createArchive(createWayback()).snapshots("https://example.com/about", {
      limit: 2,
      order: "newest",
    });

    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({ params: objectContaining({ limit: "-2" }) }),
    );
    expect(result.pages.map((page) => page.timestamp)).toEqual([
      "2025-01-01T00:00:00Z",
      "2024-01-01T00:00:00Z",
    ]);
  });

  /** Unordered, the same URL lists the whole site; ordered, only a page has a newest end. */
  it("reads a home page written with its scheme as that one page when ordered", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);

    const result = await createArchive(createWayback()).snapshots("https://example.com/", {
      order: "newest",
    });

    expect(result.success).toBe(true);
    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({ params: objectContaining({ url: "example.com/" }) }),
    );
  });

  /** The provider is a public export, so it can't lean on `Archive.snapshots` for the refusal. */
  it("refuses an ordered domain when called directly", async () => {
    const result = await createWayback().snapshots("example.com", { order: "newest" });

    expect(result.success).toBe(false);
    expect(result.error).toContain('order needs a page URL: "example.com"');
    expect(fetchData).not.toHaveBeenCalled();
  });

  it("keeps the first rows when the oldest come first", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce([["original", "timestamp", "statuscode"]]);

    await createArchive(createWayback()).snapshots("https://example.com/about", {
      limit: 2,
      order: "oldest",
    });

    expect(fetchData).toHaveBeenCalledWith(
      "/cdx/search/cdx",
      objectContaining({ params: objectContaining({ limit: "2" }) }),
    );
  });

  it("returns an error response when fetching fails", async () => {
    vi.mocked(fetchData).mockRejectedValueOnce(new Error("API error"));

    const archive = createArchive(createWayback());
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe("API error");
    expect(result._meta?.source).toBe("wayback");
  });
});
