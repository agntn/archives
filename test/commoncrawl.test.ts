import { describe, it, expect, vi, beforeEach } from "vitest";
import { $fetch } from "ofetch";
import { createArchive, resetConfig, storage } from "../src";
import type { CommonCrawlOptions } from "../src/_providers";
import createCommonCrawl from "../src/providers/commoncrawl";

vi.mock("ofetch", () => ({
  $fetch: vi.fn(),
}));

describe("Common Crawl", () => {
  beforeEach(async () => {
    await storage.clear();
    resetConfig();
    vi.resetAllMocks();
  });

  it("lists pages for a domain", async () => {
    const records = [
      {
        url: "https://example.com",
        timestamp: "20220101000000",
        mime: "text/html",
        status: "200",
        digest: "AAAABBBCCCDD",
        length: "12345",
        offset: "123",
        filename: "warc/CC-MAIN-latest/AAAABBBCCCDD",
      },
      {
        url: "https://example.com/page1",
        timestamp: "20220202000000",
        mime: "text/html",
        status: "200",
        digest: "EEEFFGGHHII",
        length: "23456",
        offset: "456",
        filename: "warc/CC-MAIN-latest/EEEFFGGHHII",
      },
    ];
    const ndjson = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    // Mock collection info first, then NDJSON lines
    const collInfo = [{ name: "CC-MAIN-2023-50" }];
    vi.mocked($fetch).mockResolvedValueOnce(collInfo).mockResolvedValueOnce(ndjson);

    const ccInstance = createCommonCrawl();
    const archive = createArchive(ccInstance);
    const result = await archive.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(2);

    // Check first result
    expect(result.pages[0].url).toBe("https://example.com");
    expect(result.pages[0].timestamp).toBe("2022-01-01T00:00:00Z");
    expect(result.pages[0].snapshot).toMatch(
      /https:\/\/data\.commoncrawl\.org\/warc\/CC-MAIN-latest\/AAAABBBCCCDD/,
    );
    expect(result.pages[0]._meta.status).toBe(200);
    expect(result.pages[0]._meta.collection).toBe("CC-MAIN-2023-50");

    // Check second result
    expect(result.pages[1].url).toBe("https://example.com/page1");
    expect(result.pages[1].snapshot).toMatch(
      /https:\/\/data\.commoncrawl\.org\/warc\/CC-MAIN-latest\/EEEFFGGHHII/,
    );

    // Check calls: first to fetch collections, then to fetch index
    expect($fetch).toHaveBeenNthCalledWith(
      1,
      "/collinfo.json",
      expect.objectContaining({ baseURL: "https://index.commoncrawl.org" }),
    );
    expect($fetch).toHaveBeenNthCalledWith(
      2,
      "/CC-MAIN-2023-50-index",
      expect.objectContaining({
        baseURL: "https://index.commoncrawl.org",
        method: "GET",
        params: expect.objectContaining({
          url: "example.com/*",
          output: "json",
        }),
      }),
    );
  });

  it("handles empty results", async () => {
    // CommonCrawl returns no data for empty results
    // Mock collection info then empty NDJSON
    const collInfo = [{ name: "CC-MAIN-2023-50" }];
    vi.mocked($fetch).mockResolvedValueOnce(collInfo).mockResolvedValueOnce("");

    const ccInstance = createCommonCrawl();
    const archive = createArchive(ccInstance);
    const result = await archive.snapshots("nonexistentdomain.com");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(0);
    expect(result._meta?.source).toBe("commoncrawl");
  });

  it("treats the no-captures 404 as an empty result", async () => {
    const collInfo = [{ name: "CC-MAIN-2023-50" }];
    const noCaptures = Object.assign(new Error("404 Not Found"), {
      statusCode: 404,
      data: '{"message": "No Captures found for: definitely-not-real.example/"}',
    });
    vi.mocked($fetch).mockResolvedValueOnce(collInfo).mockRejectedValueOnce(noCaptures);

    const archive = createArchive(createCommonCrawl());
    const result = await archive.snapshots("definitely-not-real.example");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(0);
    expect(result._meta?.collection).toBe("CC-MAIN-2023-50");
  });

  it("keeps other 404 responses as errors", async () => {
    const missingIndex = Object.assign(new Error("404 Not Found"), {
      statusCode: 404,
      data: "Not Found",
    });
    vi.mocked($fetch).mockRejectedValueOnce(missingIndex);

    const options: CommonCrawlOptions = { collection: "CC-MAIN-2019-04" };
    const archive = createArchive(createCommonCrawl());
    const result = await archive.snapshots("example.com", options);

    expect(result.success).toBe(false);
    expect(result.error).toBe("404 Not Found");
  });

  it("drops records with malformed timestamps", async () => {
    const records = [
      {
        url: "https://example.com/ok",
        timestamp: "20220101000000",
        mime: "text/html",
        status: "200",
        digest: "AAAABBBCCCDD",
        length: "12345",
        offset: "123",
        filename: "warc/CC-MAIN-latest/AAAABBBCCCDD",
      },
      {
        url: "https://example.com/bad",
        timestamp: "20220101000060",
        mime: "text/html",
        status: "200",
        digest: "EEEFFGGHHII",
        length: "23456",
        offset: "456",
        filename: "warc/CC-MAIN-latest/EEEFFGGHHII",
      },
    ];

    const ndjson = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    const collInfo = [{ name: "CC-MAIN-2023-50" }];
    vi.mocked($fetch).mockResolvedValueOnce(collInfo).mockResolvedValueOnce(ndjson);

    const ccInstance = createCommonCrawl();
    const archive = createArchive(ccInstance);
    const result = await archive.snapshots("invalid-time.example");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].url).toBe("https://example.com/ok");
  });

  it("returns an error response when fetching the selected index fails", async () => {
    vi.mocked($fetch).mockRejectedValueOnce(new Error("API error"));

    const archive = createArchive(createCommonCrawl());
    const result = await archive.snapshots("example.com", { collection: "CC-MAIN-2023-50" });

    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe("API error");
    expect(result._meta?.source).toBe("commoncrawl");
    expect(result._meta?.collection).toBe("CC-MAIN-2023-50");
    expect($fetch).toHaveBeenCalledTimes(1);
  });

  it("separates cache entries for different collection options", async () => {
    const record = (collection: string) =>
      JSON.stringify({
        url: `https://example.com/${collection}`,
        timestamp: "20220101000000",
        mime: "text/html",
        status: "200",
        digest: collection,
        length: "12345",
        offset: "123",
        filename: `warc/${collection}/AAAABBBCCCDD`,
      }) + "\n";

    vi.mocked($fetch)
      .mockResolvedValueOnce(record("CC-MAIN-2023-50"))
      .mockResolvedValueOnce(record("CC-MAIN-2024-10"));

    const archive = createArchive(createCommonCrawl());
    const collectionA: CommonCrawlOptions = { collection: "CC-MAIN-2023-50" };
    const collectionB: CommonCrawlOptions = { collection: "CC-MAIN-2024-10" };

    const first = await archive.snapshots("example.com", collectionA);
    const second = await archive.snapshots("example.com", collectionB);
    const cachedFirst = await archive.snapshots("example.com", collectionA);

    expect(first.pages[0]._meta.collection).toBe("CC-MAIN-2023-50");
    expect(second.pages[0]._meta.collection).toBe("CC-MAIN-2024-10");
    expect(cachedFirst.fromCache).toBe(true);
    expect(cachedFirst.pages[0]._meta.collection).toBe("CC-MAIN-2023-50");
    expect($fetch).toHaveBeenCalledTimes(2);
  });
});
