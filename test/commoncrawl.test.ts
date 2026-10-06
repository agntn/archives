import { objectContaining } from "./_matchers";
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { fetchData } from "../src/utils/_fetch";
import { createArchive, resetConfig, storage } from "../src";
import type { CommonCrawlOptions } from "../src/_providers";
import createCommonCrawl from "../src/providers/commoncrawl";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
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
    vi.mocked(fetchData).mockResolvedValueOnce(collInfo).mockResolvedValueOnce(ndjson);

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
    expect(fetchData).toHaveBeenNthCalledWith(
      1,
      "/collinfo.json",
      objectContaining({ baseURL: "https://index.commoncrawl.org" }),
    );
    expect(fetchData).toHaveBeenNthCalledWith(
      2,
      "/CC-MAIN-2023-50-index",
      objectContaining({
        baseURL: "https://index.commoncrawl.org",
        method: "GET",
        params: objectContaining({
          url: "example.com/*",
          output: "json",
        }),
      }),
    );
  });

  it("uses the alternate CDX field when the primary field is empty", async () => {
    vi.mocked(fetchData)
      .mockResolvedValueOnce([
        {
          "cdx-api": "",
          cdxApi: "https://index.commoncrawl.org/CC-MAIN-2024-10-index",
        },
      ])
      .mockResolvedValueOnce("");

    const result = await createArchive(createCommonCrawl()).snapshots("example.com");

    expect(result.success).toBe(true);
    expect(fetchData).toHaveBeenNthCalledWith(
      2,
      "/CC-MAIN-2024-10-index",
      objectContaining({ baseURL: "https://index.commoncrawl.org" }),
    );
  });

  it("surfaces a collinfo fetch failure without querying a fake latest index", async () => {
    vi.mocked(fetchData).mockRejectedValueOnce(new Error("collinfo unavailable"));

    const result = await createArchive(createCommonCrawl()).snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("collinfo unavailable");
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an empty list", []],
    ["a non-list response", {}],
    ["an unusable entry", [{}]],
  ])("rejects %s from collinfo without querying a fake latest index", async (_label, collInfo) => {
    vi.mocked(fetchData).mockResolvedValueOnce(collInfo);

    const result = await createArchive(createCommonCrawl()).snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Common Crawl collinfo.json returned no usable collection");
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it("handles empty results", async () => {
    // CommonCrawl returns no data for empty results
    // Mock collection info then empty NDJSON
    const collInfo = [{ name: "CC-MAIN-2023-50" }];
    vi.mocked(fetchData).mockResolvedValueOnce(collInfo).mockResolvedValueOnce("");

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
    vi.mocked(fetchData).mockResolvedValueOnce(collInfo).mockRejectedValueOnce(noCaptures);

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
    vi.mocked(fetchData).mockRejectedValueOnce(missingIndex);

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
    vi.mocked(fetchData).mockResolvedValueOnce(collInfo).mockResolvedValueOnce(ndjson);

    const ccInstance = createCommonCrawl();
    const archive = createArchive(ccInstance);
    const result = await archive.snapshots("invalid-time.example");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].url).toBe("https://example.com/ok");
  });

  it("returns an error response when fetching the selected index fails", async () => {
    vi.mocked(fetchData).mockRejectedValueOnce(new Error("API error"));

    const archive = createArchive(createCommonCrawl());
    const result = await archive.snapshots("example.com", { collection: "CC-MAIN-2023-50" });

    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.error).toBe("API error");
    expect(result._meta?.source).toBe("commoncrawl");
    expect(result._meta?.collection).toBe("CC-MAIN-2023-50");
    expect(fetchData).toHaveBeenCalledTimes(1);
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

    vi.mocked(fetchData)
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
    expect(fetchData).toHaveBeenCalledTimes(2);
  });

  describe("picking a crawl by date", () => {
    const crawls = [
      {
        id: "CC-MAIN-2024-10",
        "cdx-api": "https://index.commoncrawl.org/CC-MAIN-2024-10-index",
        from: "2024-02-20T17:21:51",
        to: "2024-03-05T09:41:14",
      },
      {
        id: "CC-MAIN-2019-51",
        "cdx-api": "https://index.commoncrawl.org/CC-MAIN-2019-51-index",
        from: "2019-12-05T09:22:01",
        to: "2019-12-16T07:15:31",
      },
      {
        id: "CC-MAIN-2019-47",
        "cdx-api": "https://index.commoncrawl.org/CC-MAIN-2019-47-index",
        from: "2019-11-11T10:23:11",
        to: "2019-11-22T15:54:47",
      },
      {
        id: "CC-MAIN-2012",
        "cdx-api": "https://index.commoncrawl.org/CC-MAIN-2012-index",
        from: "2012-01-27T17:41:51",
        to: "2012-06-05T06:28:50",
      },
    ];

    it("lists a window from the newest crawl that ran inside it", async () => {
      vi.mocked(fetchData).mockResolvedValueOnce(crawls).mockResolvedValueOnce("");

      const result = await createArchive(createCommonCrawl()).snapshots("example.com", {
        from: "2019",
        to: "2019",
      });

      expect(result.success).toBe(true);
      expect(result._meta?.collection).toBe("CC-MAIN-2019-51");
      expect(fetchData).toHaveBeenNthCalledWith(
        2,
        "/CC-MAIN-2019-51-index",
        objectContaining({ params: objectContaining({ from: "2019", to: "2019" }) }),
      );
    });

    it("finds a crawl that overlaps only the edge of the window", async () => {
      vi.mocked(fetchData).mockResolvedValueOnce(crawls).mockResolvedValueOnce("");

      const result = await createArchive(createCommonCrawl()).snapshots("example.com", {
        from: "2019-11-20",
        to: "2019-12-01",
      });

      expect(result._meta?.collection).toBe("CC-MAIN-2019-47");
    });

    it("answers empty without an index query when no crawl ran in the window", async () => {
      vi.mocked(fetchData).mockResolvedValueOnce(crawls);

      const result = await createArchive(createCommonCrawl()).snapshots("example.com", {
        from: "2015",
        to: "2016",
      });

      expect(result.success).toBe(true);
      expect(result.pages).toEqual([]);
      expect(fetchData).toHaveBeenCalledTimes(1);
    });

    it("keeps the newest crawl when collinfo carries no dates", async () => {
      vi.mocked(fetchData)
        .mockResolvedValueOnce([{ name: "CC-MAIN-2023-50" }])
        .mockResolvedValueOnce("");

      const result = await createArchive(createCommonCrawl()).snapshots("example.com", {
        from: "2019",
        to: "2019",
      });

      expect(result._meta?.collection).toBe("CC-MAIN-2023-50");
    });

    it.each([
      ["inside a crawl", "20191210", "CC-MAIN-2019-51"],
      ["between two crawls", "2019-12-01", "CC-MAIN-2019-47"],
      ["as a whole year", "2019", "CC-MAIN-2019-51"],
      ["before every crawl", "2005", "CC-MAIN-2012"],
    ])(
      "reads a capture requested %s from the crawl it fell in",
      async (_label, timestamp, crawl) => {
        vi.mocked(fetchData).mockResolvedValueOnce(crawls).mockResolvedValueOnce("");

        const response = await createCommonCrawl().content("https://example.com/", { timestamp });

        expect(response.success).toBe(false);
        expect(response.error).toContain(` in ${crawl} near `);
        expect(fetchData).toHaveBeenNthCalledWith(2, `/${crawl}-index`, objectContaining({}));
      },
    );

    it("reads the newest crawl when no timestamp is named", async () => {
      vi.mocked(fetchData).mockResolvedValueOnce(crawls).mockResolvedValueOnce("");

      const response = await createCommonCrawl().content("https://example.com/");

      expect(response.error).toContain(" in CC-MAIN-2024-10");
    });
  });
});
