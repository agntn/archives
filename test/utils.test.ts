import { describe, it, expect } from "vitest";
import {
  USER_AGENT,
  createFetchOptions,
  createSuccessResponse,
  mapCdxRows,
  normalizeDomain,
  processInParallel,
  waybackTimestampToISO,
  withUserAgent,
} from "../src/utils";
import { version } from "../src/version";

describe("processInParallel", () => {
  it("preserves input order regardless of completion order", async () => {
    const items = [300, 200, 100, 50, 10];

    const result = await processInParallel(
      items,
      (delay) =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve(`done-${delay}`), delay);
        }),
      { concurrency: 2, batchSize: 10 },
    );

    expect(result).toEqual(["done-300", "done-200", "done-100", "done-50", "done-10"]);
  });

  it("handles errors without breaking order of successful results", async () => {
    const items = [1, 2, 3, 4, 5];

    const result = await processInParallel(
      items,
      async (n) => {
        if (n === 3) throw new Error("fail");
        return n * 10;
      },
      { concurrency: 2, batchSize: 10 },
    );

    expect(result).toEqual([10, 20, 40, 50]);
  });

  it("processes small datasets via Promise.all (fast path)", async () => {
    const items = [1, 2];

    const result = await processInParallel(items, async (n) => n * 2, {
      concurrency: 5,
      batchSize: 10,
    });

    expect(result).toEqual([2, 4]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid concurrency %s",
    async (concurrency) => {
      await expect(processInParallel([1, 2], async (n) => n, { concurrency })).rejects.toThrow(
        "concurrency must be a positive integer",
      );
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid batch size %s",
    async (batchSize) => {
      await expect(
        processInParallel([1, 2], async (n) => n, { concurrency: 1, batchSize }),
      ).rejects.toThrow("batchSize must be a positive integer");
    },
  );
});

describe("withUserAgent", () => {
  it("names the package and its version", () => {
    expect(USER_AGENT).toBe(`@agntn/archives/${version} (+https://github.com/agntn/archives)`);
  });

  it("adds the User-Agent to every request; runtimes without a default one are refused by the CDX API", async () => {
    const options = await createFetchOptions("https://web.archive.org", { url: "example.com" });
    expect(options.headers).toEqual({ "user-agent": USER_AGENT });
  });

  it("keeps caller headers and a caller-chosen User-Agent", () => {
    expect(withUserAgent({ Authorization: "ApiKey secret", "User-Agent": "custom/1.0" })).toEqual({
      Authorization: "ApiKey secret",
      "User-Agent": "custom/1.0",
    });
    expect(withUserAgent(new Headers({ Range: "bytes=0-9" }))).toEqual({
      range: "bytes=0-9",
      "user-agent": USER_AGENT,
    });
  });
});

describe("createSuccessResponse", () => {
  it("uses the response source as each page provider", () => {
    const response = createSuccessResponse(
      [
        {
          url: "https://example.com/",
          timestamp: "2023-01-01T00:00:00Z",
          snapshot: "https://archive.example/capture",
          _meta: { digest: "example", provider: "stale-source" },
        },
      ],
      "example-archive",
    );

    expect(response.pages[0]._meta).toEqual({
      digest: "example",
      provider: "example-archive",
    });
  });
});

describe("normalizeDomain", () => {
  it("keeps a bare host as a prefix search", () => {
    expect(normalizeDomain("https://example.com/")).toBe("example.com/*");
  });

  it("keeps paths and queries exact", () => {
    expect(normalizeDomain("https://example.com/page")).toBe("example.com/page");
    expect(normalizeDomain("https://example.com/?q=1")).toBe("example.com/?q=1");
  });

  it("drops a default port, which the CDX index cannot match", () => {
    expect(normalizeDomain("http://www.example.com:80/", false)).toBe("www.example.com/");
    expect(normalizeDomain("https://example.com:443/about", false)).toBe("example.com/about");
    expect(normalizeDomain("example.com:80")).toBe("example.com/*");
    expect(normalizeDomain("http://example.com:8080/", false)).toBe("example.com:8080/");
  });

  it("keeps a caller-supplied wildcard", () => {
    expect(normalizeDomain("https://example.com/pages/*")).toBe("example.com/pages/*");
  });
});

describe("waybackTimestampToISO", () => {
  it("converts a full CDX timestamp", () => {
    expect(waybackTimestampToISO("20220101153045")).toBe("2022-01-01T15:30:45Z");
    expect(waybackTimestampToISO("  20220101153045  ")).toBe("2022-01-01T15:30:45Z");
  });

  it("fills missing precision deterministically", () => {
    expect(waybackTimestampToISO("2022")).toBe("2022-01-01T00:00:00Z");
    expect(waybackTimestampToISO("202201")).toBe("2022-01-01T00:00:00Z");
    expect(waybackTimestampToISO("20220101")).toBe("2022-01-01T00:00:00Z");
    expect(waybackTimestampToISO("2022010115")).toBe("2022-01-01T15:00:00Z");
    expect(waybackTimestampToISO("202201011530")).toBe("2022-01-01T15:30:00Z");
    expect(waybackTimestampToISO("20200229000000")).toBe("2020-02-29T00:00:00Z");
  });

  it("returns empty string for malformed values", () => {
    expect(waybackTimestampToISO("")).toBe("");
    expect(waybackTimestampToISO("202201011")).toBe("");
    expect(waybackTimestampToISO("abcd")).toBe("");
    expect(waybackTimestampToISO("20221301120000")).toBe("");
    expect(waybackTimestampToISO("20220230000000")).toBe("");
    expect(waybackTimestampToISO("20220001000000")).toBe("");
    expect(waybackTimestampToISO("20220000000000")).toBe("");
    expect(waybackTimestampToISO("20220101250000")).toBe("");
    expect(waybackTimestampToISO("20220101006000")).toBe("");
    expect(waybackTimestampToISO("20220101000060")).toBe("");
    expect(waybackTimestampToISO("20210229000000")).toBe("");
  });

  it("handles max year boundary", () => {
    expect(waybackTimestampToISO("99990101000000")).toBe("9999-01-01T00:00:00Z");
  });
});

describe("mapCdxRows", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid batch size %s",
    async (batchSize) => {
      await expect(
        mapCdxRows(
          [["https://example.com/", "20220101120000", "200"]],
          "https://archive.test",
          "test",
          { batchSize },
        ),
      ).rejects.toThrow("batchSize must be a positive integer");
    },
  );

  it("returns empty array for empty input", async () => {
    const pages = await mapCdxRows([], "https://web.archive.org/web", "wayback", { batchSize: 50 });
    expect(pages).toEqual([]);
  });

  it("returns empty array when all rows are invalid", async () => {
    const rows = [
      ["https://example.com/bad1", "20220101000060", "200"],
      ["https://example.com/bad2", "abcd", "200"],
    ];

    const pages = await mapCdxRows(rows, "https://web.archive.org/web", "wayback", {
      batchSize: 50,
    });

    expect(pages).toEqual([]);
  });

  it("drops rows with invalid timestamps", async () => {
    const rows = [
      ["https://example.com/ok", "20220101153045", "200"],
      ["https://example.com/bad", "20220101000060", "200"],
    ];

    const pages = await mapCdxRows(rows, "https://web.archive.org/web", "wayback", {
      batchSize: 50,
    });

    expect(pages).toHaveLength(1);
    expect(pages[0].url).toBe("https://example.com/ok");
    expect(pages[0].timestamp).toBe("2022-01-01T15:30:45Z");
    expect(pages[0]._meta.timestamp).toBe("20220101153045");
  });

  it("keeps valid leap day rows and drops invalid leap day rows", async () => {
    const rows = [
      ["https://example.com/leap-valid", "20200229000000", "200"],
      ["https://example.com/leap-invalid", "20210229000000", "200"],
    ];

    const pages = await mapCdxRows(rows, "https://web.archive.org/web", "wayback", {
      batchSize: 50,
    });

    expect(pages).toHaveLength(1);
    expect(pages[0].url).toBe("https://example.com/leap-valid");
    expect(pages[0].timestamp).toBe("2020-02-29T00:00:00Z");
  });
});
