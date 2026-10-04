import { objectContaining } from "./_matchers";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  brotliCompressSync,
  deflateRawSync,
  deflateSync,
  gzipSync,
  zstdCompressSync,
} from "node:zlib";
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { fetchData, fetchResponse } from "../src/utils/_fetch";
import { rawResponse } from "./_responses";
import { createArchive, resetConfig, storage, UnsupportedOperationError } from "../src";
import type { ArchiveContentOptions, ArchiveContentResponse, ArchiveProvider } from "../src/types";
import createWayback from "../src/providers/wayback";
import createCommonCrawl from "../src/providers/commoncrawl";
import createArchiveToday from "../src/providers/archive-today";
import createWebcite from "../src/providers/webcite";
import createArchiveIt from "../src/providers/archive-it";
import { fetchBody, htmlToText, unwrapSnapshotUrl } from "../src/utils";
import { preferSameUrl } from "../src/utils/_content";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
}));

const fetchMock = vi.mocked(fetchData);
const rawMock = vi.mocked(fetchResponse);

function cdxRows(rows: readonly (readonly string[])[]): string[][] {
  return [["original", "timestamp", "statuscode"], ...rows];
}

function textStream(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

/* An oracle independent of the `@agntn/hashes` digest the library computes. */
function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/* A provider stub with only the methods a given test needs. */
function stubProvider(slug: string, content?: ArchiveProvider["content"]): ArchiveProvider {
  return {
    name: slug,
    slug,
    snapshots: vi.fn().mockResolvedValue({ success: true, pages: [] }),
    ...(content ? { content } : {}),
  };
}

function contentFailure(slug: string, message: string): ArchiveContentResponse {
  return { success: false, error: message, _meta: { source: slug, provider: slug } };
}

beforeEach(async () => {
  // Bodies are cached by provider and URL, so one test would otherwise answer
  // the next test's identical read.
  await storage.clear();
  resetConfig();
  vi.resetAllMocks();
});

describe("bounded body fetches", () => {
  it("returns a redirect response instead of following it without a policy", async () => {
    rawMock.mockResolvedValueOnce(
      rawResponse("", {
        status: 302,
        url: "https://archive.example/capture",
        headers: { location: "http://127.0.0.1/private" },
      }),
    );

    const body = await fetchBody("https://archive.example", "/capture");

    expect(body.status).toBe(302);
    expect(body.url).toBe("https://archive.example/capture");
    expect(rawMock).toHaveBeenCalledTimes(1);
    expect(rawMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });
});

describe("wayback content", () => {
  it("reads the newest capture through the id_ playback modifier", async () => {
    fetchMock.mockResolvedValueOnce(
      cdxRows([
        ["https://example.com/", "20190101000000", "200"],
        ["https://example.com/", "20200202000000", "200"],
      ]),
    );
    rawMock.mockResolvedValueOnce(
      rawResponse("<html><body><h1>Hi</h1><script>x()</script></body></html>", {
        url: "https://web.archive.org/web/20200202000000id_/https://example.com/",
        headers: {
          "content-type": "text/html; charset=utf-8",
          "memento-datetime": "Sun, 02 Feb 2020 00:00:00 GMT",
        },
      }),
    );

    const response = await createArchive(createWayback()).content("example.com");

    expect(response.success).toBe(true);
    expect(response.content?.content).toContain("<h1>Hi</h1>");
    expect(response.content?.url).toBe("https://example.com/");
    expect(response.content?.timestamp).toBe("2020-02-02T00:00:00Z");
    expect(response.content?.mime).toBe("text/html");
    expect(response.content?.truncated).toBe(false);
    // The human-readable playback URL is reported; the raw one is what was read.
    expect(response.content?.snapshot).toBe(
      "https://web.archive.org/web/20200202000000/https://example.com/",
    );
    expect(response.content?._meta.rawSnapshot).toBe(
      "https://web.archive.org/web/20200202000000id_/https://example.com/",
    );
    expect(rawMock.mock.calls[0][0]).toBe("/web/20200202000000id_/https://example.com/");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      params: objectContaining({ limit: "-5", url: "example.com" }),
    });
  });

  it.each([
    ["another host", "http://127.0.0.1/private"],
    ["a non-capture path", "https://web.archive.org/private"],
    [
      "a rewritten raw destination",
      "https://web.archive.org/web/20200202000000id_/https://destination.example/",
    ],
    [
      "URL credentials",
      "https://user:secret@web.archive.org/web/20200202000000id_/https://example.com/",
    ],
  ])("does not follow an archived redirect to %s", async (_case, location) => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20200202000000", "302"]]));
    rawMock.mockResolvedValueOnce(
      rawResponse("", {
        status: 302,
        url: "https://web.archive.org/web/20200202000000id_/https://example.com/",
        headers: { location },
      }),
    );

    const response = await createArchive(createWayback()).content("example.com", {
      timestamp: "20200202000000",
    });

    expect(response.success).toBe(true);
    expect(response.content?._meta.status).toBe(302);
    expect(rawMock).toHaveBeenCalledTimes(1);
    expect(rawMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("keeps the destination a captured redirect recorded, without visiting it", async () => {
    fetchMock.mockResolvedValue(cdxRows([["https://example.com/old", "20200202000000", "301"]]));
    rawMock.mockImplementation(async () =>
      rawResponse("<h1>301 Moved Permanently</h1>", {
        status: 301,
        url: "https://web.archive.org/web/20200202000000id_/https://example.com/old",
        headers: { "content-type": "text/html", location: "https://example.org/new" },
      }),
    );
    const { contentArchives } = await import("../src/tool-operations");

    const library = await createArchive(createWayback()).content("example.com/old", {
      cache: false,
    });
    const tool = await contentArchives({
      target: "example.com/old",
      provider: "wayback",
      cache: false,
    });

    expect(library.content?._meta).toMatchObject({
      status: 301,
      location: "https://example.org/new",
    });
    expect(tool.content[0]?.text).toContain("status: 301");
    expect(tool.content[0]?.text).toContain('redirects to: "https://example.org/new"');
    // The destination is provenance: each of the two reads made one raw request
    // for the capture and none for the destination.
    expect(rawMock).toHaveBeenCalledTimes(2);
    expect(rawMock.mock.calls.map(([path]) => path)).toEqual([
      "/web/20200202000000id_/https://example.com/old",
      "/web/20200202000000id_/https://example.com/old",
    ]);
  });

  it("keeps the Location of a redirect the raw endpoint policy refused", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20200202000000", "200"]]));
    rawMock.mockResolvedValueOnce(
      rawResponse("", {
        status: 302,
        url: "https://web.archive.org/web/20200202000000id_/https://example.com/",
        headers: { location: "http://127.0.0.1/private" },
      }),
    );

    const response = await createArchive(createWayback()).content("example.com");

    expect(response.content?._meta.location).toBe("http://127.0.0.1/private");
    expect(rawMock).toHaveBeenCalledTimes(1);
  });

  it("ignores Location on a capture that is not a redirect", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20200202000000", "200"]]));
    rawMock.mockResolvedValueOnce(
      rawResponse("page", {
        url: "https://web.archive.org/web/20200202000000id_/https://example.com/",
        headers: { location: "https://example.org/elsewhere" },
      }),
    );

    const response = await createArchive(createWayback()).content("example.com");

    expect(response.content?._meta).not.toHaveProperty("location");
  });

  it("bounds and sanitizes a hostile Location before it reaches a header", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20200202000000", "301"]]));
    rawMock.mockResolvedValueOnce(
      rawResponse("", {
        status: 301,
        url: "https://web.archive.org/web/20200202000000id_/https://example.com/",
        headers: { location: `https://example.org/${"a".repeat(5000)}\u001B[31m` },
      }),
    );
    const { contentArchives } = await import("../src/tool-operations");

    const tool = await contentArchives({
      target: "example.com",
      provider: "wayback",
      cache: false,
    });

    const location = (tool.details.response.content?._meta.location as string | undefined) ?? "";
    // Control: the destination was kept, so the bounds below are about it.
    expect(location.length).toBeGreaterThan(0);
    expect(location.length).toBeLessThanOrEqual(2048);
    expect(tool.content[0]?.text).not.toContain("\u001B");
  });

  it("follows a playback redirect that stays on the archive's raw endpoint", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20200202000000", "200"]]));
    rawMock
      .mockResolvedValueOnce(
        rawResponse("", {
          status: 302,
          url: "https://web.archive.org/web/20200202000000id_/https://example.com/",
          headers: {
            location: "/web/20200303000000id_/https://example.com/",
          },
        }),
      )
      .mockResolvedValueOnce(
        rawResponse("redirected capture", {
          url: "https://web.archive.org/web/20200303000000id_/https://example.com/",
        }),
      );

    const response = await createArchive(createWayback()).content("example.com");

    expect(response.success).toBe(true);
    expect(response.content?.content).toBe("redirected capture");
    expect(response.content?.timestamp).toBe("2020-03-03T00:00:00Z");
    expect(rawMock).toHaveBeenCalledTimes(2);
  });

  it("skips a failed capture in favour of the nearest successful one", async () => {
    fetchMock.mockResolvedValueOnce(
      cdxRows([
        ["https://example.com/", "20200101000000", "200"],
        ["https://example.com/", "20200202000000", "404"],
      ]),
    );
    rawMock.mockResolvedValueOnce(rawResponse("archived", { url: "" }));

    await createArchive(createWayback()).content("example.com");

    expect(rawMock.mock.calls[0][0]).toBe("/web/20200101000000id_/https://example.com/");
  });

  it("replays the URL that was asked for, not a canonical match of it", async () => {
    // A CDX exact match folds userinfo into the same key, so the index answers a
    // query for example.com with captures of sample@example.com too.
    fetchMock.mockResolvedValueOnce(
      cdxRows([
        ["http://example.com/", "20150101000000", "200"],
        ["http://sample@example.com/", "20151231233746", "200"],
      ]),
    );
    rawMock.mockResolvedValueOnce(rawResponse("asked for", { url: "" }));

    const response = await createArchive(createWayback()).content("example.com");

    expect(rawMock.mock.calls[0][0]).toBe("/web/20150101000000id_/http://example.com/");
    expect(response.content?.url).toBe("http://example.com/");
  });

  it("keeps the scheme the caller asked for when both were captured", async () => {
    fetchMock.mockResolvedValueOnce(
      cdxRows([
        ["https://example.com/", "20200101000000", "200"],
        ["http://example.com/", "20210101000000", "200"],
      ]),
    );
    rawMock.mockResolvedValueOnce(rawResponse("secure", { url: "" }));

    const response = await createArchive(createWayback()).content("https://example.com/");

    // The index folds both schemes into one key, so the newer HTTP capture would
    // otherwise answer a request that named HTTPS.
    expect(response.content?.url).toBe("https://example.com/");
  });

  const slashPair = [
    ["https://example.com/about", "20211202002626", "302"],
    ["https://example.com/about/", "20211202002626", "200"],
  ] as const;

  it.each([
    ["index order", slashPair],
    ["reversed index order", [...slashPair].reverse()],
  ])("reads the exact URL a pinned stamp names in %s", async (_case, rows) => {
    fetchMock.mockResolvedValueOnce(cdxRows(rows));
    rawMock.mockResolvedValueOnce(rawResponse("about", { url: "" }));

    const response = await createArchive(createWayback()).content("https://example.com/about/", {
      timestamp: "20211202002626",
    });

    expect(rawMock.mock.calls[0]?.[0]).toBe("/web/20211202002626id_/https://example.com/about/");
    expect(response.content?.url).toBe("https://example.com/about/");
  });

  it.each([
    ["index order", slashPair],
    ["reversed index order", [...slashPair].reverse()],
  ])("reads the redirect capture when that is the URL asked for, in %s", async (_case, rows) => {
    fetchMock.mockResolvedValueOnce(cdxRows(rows));
    rawMock.mockResolvedValueOnce(
      rawResponse("", { status: 302, headers: { location: "https://example.com/about/" } }),
    );

    const response = await createArchive(createWayback()).content("https://example.com/about", {
      timestamp: "20211202002626",
    });

    expect(rawMock).toHaveBeenCalledTimes(1);
    expect(rawMock.mock.calls[0]?.[0]).toBe("/web/20211202002626id_/https://example.com/about");
    expect(response.content?._meta).toMatchObject({
      status: 302,
      location: "https://example.com/about/",
    });
  });

  it.each([
    ["index order", false],
    ["reversed index order", true],
  ])("breaks a timestamp tie toward the exact URL in %s", async (_case, reversed) => {
    const rows = [
      ["https://example.com/about", "20211202002626", "200"],
      ["https://example.com/about/", "20211202002626", "200"],
    ];
    fetchMock.mockResolvedValueOnce(cdxRows(reversed ? [...rows].reverse() : rows));
    rawMock.mockResolvedValueOnce(rawResponse("about", { url: "" }));

    const response = await createArchive(createWayback()).content("https://example.com/about/", {
      timestamp: "2022",
    });

    expect(response.content?.url).toBe("https://example.com/about/");
  });

  it("falls back to a slash alias when the exact URL was never captured", async () => {
    fetchMock.mockResolvedValueOnce(
      cdxRows([["https://example.com/about", "20211202002626", "200"]]),
    );
    rawMock.mockResolvedValueOnce(rawResponse("alias", { url: "" }));

    const response = await createArchive(createWayback()).content("https://example.com/about/", {
      timestamp: "20211202002626",
    });

    expect(response.success).toBe(true);
    expect(response.content?.url).toBe("https://example.com/about");
  });

  it("answers an HTTPS request from HTTP captures when that is all there is", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["http://example.com/", "20080101000000", "200"]]));
    rawMock.mockResolvedValueOnce(rawResponse("old", { url: "" }));

    const response = await createArchive(createWayback()).content("https://example.com/");

    expect(response.success).toBe(true);
    expect(response.content?.url).toBe("http://example.com/");
  });

  it("accepts a whole-hour offset, which Date alone refuses", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20190302040000", "200"]]));
    rawMock.mockResolvedValueOnce(rawResponse("utc", { url: "" }));

    await createArchive(createWayback()).content("example.com", {
      timestamp: "2019-03-01T23:30:00-05",
    });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      params: objectContaining({ to: "20190302043000" }),
    });
  });

  it("rejects a zoned timestamp whose date never existed", async () => {
    // `Date` rolls February 29th of a common year forward instead of refusing it.
    const response = await createArchive(createWayback()).content("example.com", {
      timestamp: "2021-02-29T00:00:00Z",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("Invalid timestamp");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the capture a playback URL names even when it failed", async () => {
    fetchMock.mockResolvedValueOnce(
      cdxRows([
        ["https://example.com/", "20190101000000", "200"],
        ["https://example.com/", "20190301120000", "404"],
      ]),
    );
    rawMock.mockResolvedValueOnce(rawResponse("the 404 page", { url: "" }));

    await createArchive(createWayback()).content(
      "https://web.archive.org/web/20190301120000/https://example.com/",
    );

    // Preferring a successful capture is for date requests. This URL named one.
    expect(rawMock.mock.calls[0][0]).toBe("/web/20190301120000id_/https://example.com/");
  });

  it("rejects a timestamp with a valid-looking prefix and a typo after it", async () => {
    const response = await createArchive(createWayback()).content("example.com", {
      timestamp: "2019-03-01junk",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Invalid timestamp "2019-03-01junk"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a canonical match when the exact URL was never captured", async () => {
    fetchMock.mockResolvedValueOnce(
      cdxRows([["http://www.example.com/", "20150101000000", "200"]]),
    );
    rawMock.mockResolvedValueOnce(rawResponse("www capture", { url: "" }));

    const response = await createArchive(createWayback()).content("example.com");

    expect(response.success).toBe(true);
    expect(response.content?.url).toBe("http://www.example.com/");
  });

  it("bounds the index query with the requested instant", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20190228120000", "200"]]));
    rawMock.mockResolvedValueOnce(rawResponse("march", { url: "" }));

    const response = await createArchive(createWayback()).content("example.com", {
      timestamp: "2019-03-01",
    });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      params: objectContaining({ to: "20190301" }),
    });
    expect(response.content?.timestamp).toBe("2019-02-28T12:00:00Z");
  });

  it("falls back to the closest later capture when none precedes the request", async () => {
    fetchMock
      .mockResolvedValueOnce(cdxRows([]))
      .mockResolvedValueOnce(cdxRows([["https://example.com/", "20210505000000", "200"]]));
    rawMock.mockResolvedValueOnce(rawResponse("later", { url: "" }));

    const response = await createArchive(createWayback()).content("example.com", {
      timestamp: "2019",
    });

    // The bound that just came back empty has to go, or the second query asks
    // for the same window and the later capture stays invisible.
    const fallback = (fetchMock.mock.calls[1][1] as { params: Record<string, string> }).params;
    expect(fallback).toMatchObject({ from: "2019", limit: "5" });
    expect(fallback).not.toHaveProperty("to");
    expect(response.content?.timestamp).toBe("2021-05-05T00:00:00Z");
  });

  it("reads an ISO instant that names its offset as the UTC one", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20190302040000", "200"]]));
    rawMock.mockResolvedValueOnce(rawResponse("utc", { url: "" }));

    await createArchive(createWayback()).content("example.com", {
      timestamp: "2019-03-01T23:30:00-05:00",
    });

    // 23:30 in -05:00 is 04:30 the next day in UTC, which is how archives index it.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      params: objectContaining({ to: "20190302043000" }),
    });
  });

  it("reads the capture a playback URL names instead of searching for that URL", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20190301120000", "200"]]));
    rawMock.mockResolvedValueOnce(rawResponse("unwrapped", { url: "" }));

    const response = await createArchive(createWayback()).content(
      "https://web.archive.org/web/20190301120000id_/https://example.com/",
    );

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      params: objectContaining({ url: "example.com/", to: "20190301120000" }),
    });
    expect(response.success).toBe(true);
  });

  it("replays a pinned playback URL when the index is down", async () => {
    fetchMock.mockRejectedValue(new Error('[GET] "/cdx/search/cdx": 503 Service Unavailable'));
    rawMock.mockResolvedValueOnce(
      rawResponse("pinned", {
        url: "https://web.archive.org/web/20020120142510id_/http://example.com:80/",
        headers: { "content-type": "text/html" },
      }),
    );

    const response = await createArchive(createWayback({ retries: 0 })).content(
      "https://web.archive.org/web/20020120142510id_/http://example.com:80/",
    );

    expect(response.success).toBe(true);
    expect(response.content?.content).toBe("pinned");
    expect(response.content?.url).toBe("http://example.com:80/");
    expect(response.content?.timestamp).toBe("2002-01-20T14:25:10Z");
    // The read says the index never chose this capture, so its status is unknown.
    expect(response.content?._meta.selection).toBe("pinned");
    expect(rawMock.mock.calls[0][0]).toBe("/web/20020120142510id_/http://example.com:80/");
    // Redirect safety is the indexed read's: the raw-endpoint policy still applies.
    expect(rawMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("keeps the index failure when the archive replays a different capture", async () => {
    fetchMock.mockRejectedValue(new Error('[GET] "/cdx/search/cdx": 503 Service Unavailable'));
    rawMock.mockResolvedValueOnce(
      rawResponse("substitute", {
        url: "https://web.archive.org/web/20030101000000id_/http://example.com/",
      }),
    );

    const response = await createArchive(createWayback({ retries: 0 })).content(
      "https://web.archive.org/web/20020120142510id_/http://example.com/",
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain("503");
  });

  it("keeps the index failure when the archive replays another URL under the same stamp", async () => {
    fetchMock.mockRejectedValue(new Error('[GET] "/cdx/search/cdx": 503 Service Unavailable'));
    rawMock.mockResolvedValueOnce(
      rawResponse("other page", {
        url: "https://web.archive.org/web/20020120142510id_/http://example.org/",
      }),
    );

    const response = await createArchive(createWayback({ retries: 0 })).content(
      "https://web.archive.org/web/20020120142510id_/http://example.com/",
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain("503");
  });

  it.each([
    ["a partial timestamp", "https://example.com/", "2020"],
    ["a target without a scheme", "example.com", "20200202000000"],
    ["no timestamp", "https://example.com/", undefined],
  ])("still reports the index failure for %s", async (_case, target, timestamp) => {
    fetchMock.mockRejectedValue(new Error('[GET] "/cdx/search/cdx": 503 Service Unavailable'));

    const response = await createArchive(createWayback({ retries: 0 })).content(
      target,
      timestamp === undefined ? {} : { timestamp },
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain("503");
    expect(rawMock).not.toHaveBeenCalled();
  });

  it("does not replay after the caller cancelled the read", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));

    const response = await createArchive(createWayback({ retries: 0 })).content(
      "https://example.com/",
      { timestamp: "20200202000000", signal: controller.signal },
    );

    expect(response.success).toBe(false);
    expect(rawMock).not.toHaveBeenCalled();
  });

  it("reports an archive with no capture of the URL", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([]));

    const response = await createArchive(createWayback()).content("example.com");

    expect(response.success).toBe(false);
    expect(response.error).toContain("No Wayback capture");
    expect(rawMock).not.toHaveBeenCalled();
  });

  it("rejects a timestamp no archive could act on, before any network work", async () => {
    const response = await createArchive(createWayback()).content("example.com", {
      timestamp: "last tuesday",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Invalid timestamp "last tuesday"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a wildcard pattern, which names no single capture", async () => {
    const response = await createArchive(createWayback()).content("example.com/*");

    expect(response.success).toBe(false);
    expect(response.error).toContain("exact URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops reading at the byte cap and says the body was cut", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20200101000000", "200"]]));
    rawMock.mockResolvedValueOnce(
      rawResponse(textStream(["0123456789", "abcdefghij"]), {
        headers: { "content-type": "text/plain" },
      }),
    );

    const response = await createArchive(createWayback()).content("example.com", {
      maxBytes: 15,
    });

    expect(response.content?.content).toBe("0123456789abcde");
    expect(response.content?.bytes).toBe(15);
    expect(response.content?.truncated).toBe(true);
  });

  it("decodes a capture that declares its charset only in the markup", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.pl/", "20030101000000", "200"]]));
    const body = Uint8Array.from([
      ...new TextEncoder().encode('<html><head><meta charset="iso-8859-2"></head><body>'),
      0xb1,
      0xe6,
      0xea,
      ...new TextEncoder().encode("</body></html>"),
    ]);
    rawMock.mockResolvedValueOnce(rawResponse(body, { headers: { "content-type": "text/html" } }));

    const response = await createArchive(createWayback()).content("example.pl");

    expect(response.content?.content).toContain("ąćę");
  });

  it("hashes the bytes it read, not the text they decode to", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.pl/", "20030101000000", "200"]]));
    const body = Uint8Array.from([0x3c, 0x70, 0x3e, 0xb1, 0xe6, 0xea]);
    rawMock.mockResolvedValueOnce(
      rawResponse(body, { headers: { "content-type": "text/html; charset=iso-8859-2" } }),
    );

    const response = await createArchive(createWayback()).content("example.pl");

    expect(response.content?.content).toBe("<p>ąćę");
    expect(response.content?.sha256).toBe(sha256Hex(body));
    expect(response.content?.sha256).not.toBe(sha256Hex("<p>ąćę"));
  });

  it("hashes only the bytes kept under the byte cap", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20200101000000", "200"]]));
    rawMock.mockResolvedValueOnce(
      rawResponse(textStream(["0123456789", "abcdefghij"]), {
        headers: { "content-type": "text/plain" },
      }),
    );

    const response = await createArchive(createWayback()).content("example.com", {
      maxBytes: 15,
    });

    expect(response.content?.truncated).toBe(true);
    expect(response.content?.sha256).toBe(sha256Hex("0123456789abcde"));
  });

  it("prints the same body digest on every slice of one capture", async () => {
    const body = "abcdefghij";
    fetchMock.mockResolvedValue(cdxRows([["https://example.com/", "20200202000000", "200"]]));
    rawMock.mockImplementation(async () =>
      rawResponse(body, {
        url: "https://web.archive.org/web/20200202000000id_/https://example.com/",
        headers: { "content-type": "text/plain" },
      }),
    );
    const { contentArchives } = await import("../src/tool-operations");

    const first = await contentArchives({
      target: "https://example.com/",
      provider: "wayback",
      maxChars: 4,
      cache: false,
    });
    const second = await contentArchives({
      target: "https://example.com/",
      provider: "wayback",
      maxChars: 4,
      offset: 4,
      timestamp: "2020-02-02T00:00:00Z",
      cache: false,
    });

    const line = `\nsha256: ${sha256Hex(body)}\n`;
    expect(first.content[0]?.text).toContain("slice: 0..4");
    expect(first.content[0]?.text).toContain(line);
    expect(second.content[0]?.text).toContain("slice: 4..8");
    expect(second.content[0]?.text).toContain(line);
  });

  it("says when the printed digest covers only the bytes under the tool's cap", async () => {
    const body = "a".repeat(2_000_001);
    fetchMock.mockResolvedValue(cdxRows([["https://example.com/", "20200202000000", "200"]]));
    rawMock.mockImplementation(async () =>
      rawResponse(body, { headers: { "content-type": "text/plain" } }),
    );
    const { contentArchives } = await import("../src/tool-operations");

    const tool = await contentArchives({
      target: "https://example.com/",
      provider: "wayback",
      cache: false,
    });

    expect(tool.content[0]?.text).toContain(
      `\nsha256: ${sha256Hex(body.slice(0, 2_000_000))} (of the bytes read, not the whole body)\n`,
    );
  });

  it("serves a repeated read from the cache without touching the archive", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20200101000000", "200"]]));
    rawMock.mockResolvedValueOnce(rawResponse("cached body", { url: "" }));
    const archive = createArchive(createWayback());

    const first = await archive.content("example.com");
    const second = await archive.content("example.com");

    expect(first.fromCache).toBeUndefined();
    expect(second.fromCache).toBe(true);
    expect(second.content?.content).toBe("cached body");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rawMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a read for a different capture out of the cached one's entry", async () => {
    fetchMock.mockResolvedValue(cdxRows([["https://example.com/", "20200101000000", "200"]]));
    rawMock
      .mockResolvedValueOnce(rawResponse("newest", { url: "" }))
      .mockResolvedValueOnce(rawResponse("older", { url: "" }));
    const archive = createArchive(createWayback());

    await archive.content("example.com");
    const second = await archive.content("example.com", { timestamp: "2019" });

    expect(second.fromCache).toBeUndefined();
    expect(second.content?.content).toBe("older");
  });
});

describe("content cache", () => {
  it("keeps query URLs and capture options in separate cache entries", async () => {
    const read = vi.fn(
      async (
        url: string,
        options?: Readonly<ArchiveContentOptions>,
      ): Promise<ArchiveContentResponse> => ({
        success: true,
        content: {
          url,
          timestamp: options?.timestamp ?? "2020-01-01",
          snapshot: `https://archive.test/${encodeURIComponent(url)}`,
          content: `${url}:${options?.maxBytes}`,
          bytes: options?.maxBytes ?? 0,
          truncated: false,
          _meta: { provider: "stub" },
        },
        _meta: { source: "stub", provider: "stub" },
      }),
    );
    const archive = createArchive(stubProvider("stub", read));
    const firstUrl = "https://example.test/app.js?id=aaa";
    const secondUrl = "https://example.test/app.js?id=bbb";

    const firstOptions = { timestamp: "2023-01-01", maxBytes: 64 } as const;
    await archive.content(firstUrl, firstOptions);
    const second = await archive.content(secondUrl, firstOptions);
    const third = await archive.content(secondUrl, {
      timestamp: "2024-01-01",
      maxBytes: 128,
    });
    const repeated = await archive.content(secondUrl, firstOptions);

    expect(second.fromCache).toBeUndefined();
    expect(second.content?.url).toBe(secondUrl);
    expect(third.fromCache).toBeUndefined();
    expect(third.content).toMatchObject({
      url: secondUrl,
      timestamp: "2024-01-01",
      content: `${secondUrl}:128`,
    });
    expect(repeated.fromCache).toBe(true);
    expect(repeated.content?.content).toBe(`${secondUrl}:64`);
    expect(read).toHaveBeenCalledTimes(3);
    expect(await storage.getKeys()).toHaveLength(3);
  });
});

describe("archive-it content", () => {
  it("replays a capture from the collection's own playback host", async () => {
    fetchMock.mockResolvedValueOnce(
      ["https://example.com/ 20180101000000 200", "https://example.com/ 20190101000000 200"].join(
        "\n",
      ),
    );
    rawMock.mockResolvedValueOnce(rawResponse("collection body", { url: "" }));

    const response = await createArchive(createArchiveIt({ collection: 4399 })).content(
      "example.com",
    );

    expect(response.success).toBe(true);
    expect(response.content?.content).toBe("collection body");
    expect(response.content?._meta.collection).toBe("4399");
    expect(rawMock.mock.calls[0][0]).toBe("/4399/20190101000000id_/https://example.com/");
    expect(rawMock.mock.calls[0][1]).toMatchObject({ baseURL: "https://wayback.archive-it.org" });
  });

  it("asks the collection for the captures nearest the instant, not a closed window", async () => {
    fetchMock.mockResolvedValueOnce("https://example.com/ 20180101000000 200");
    rawMock.mockResolvedValueOnce(rawResponse("near", { url: "" }));

    await createArchive(createArchiveIt({ collection: 4399 })).content("example.com", {
      timestamp: "2019",
    });

    const params = (fetchMock.mock.calls[0][1] as { params: Record<string, string> }).params;
    expect(params).toMatchObject({ closest: "20199999999999", sort: "closest" });
    // A `to` bound is honored by the collection, so it would hide later captures.
    expect(params).not.toHaveProperty("to");
  });

  it("asks for the newest captures when no instant is named", async () => {
    fetchMock.mockResolvedValueOnce("https://example.com/ 20180101000000 200");
    rawMock.mockResolvedValueOnce(rawResponse("newest", { url: "" }));

    await createArchive(createArchiveIt({ collection: 4399 })).content("example.com");

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      params: objectContaining({ sort: "reverse" }),
    });
  });

  it("chooses the capture locally, so an ignored bound cannot pick the wrong one", async () => {
    fetchMock.mockResolvedValueOnce(
      ["https://example.com/ 20180101000000 200", "https://example.com/ 20220101000000 200"].join(
        "\n",
      ),
    );
    rawMock.mockResolvedValueOnce(rawResponse("older", { url: "" }));

    await createArchive(createArchiveIt({ collection: 4399 })).content("example.com", {
      timestamp: "2019",
    });

    expect(rawMock.mock.calls[0][0]).toBe("/4399/20180101000000id_/https://example.com/");
  });
});

describe("archive-today content", () => {
  const timemap = `
    <http://archive.md/20190101000000/https://example.com/>; rel="first memento"; datetime="Tue, 01 Jan 2019 00:00:00 GMT",
    <http://archive.md/20200606060606/https://example.com/>; rel="memento"; datetime="Sat, 06 Jun 2020 06:06:06 GMT",
    <http://archive.md/20210326214327/https://example.com/>; rel="last memento"; datetime="Fri, 26 Mar 2021 21:43:27 GMT"
    `;

  it("reads the newest capture's wrapper page from its snapshot URL", async () => {
    fetchMock.mockResolvedValueOnce(timemap);
    rawMock.mockResolvedValueOnce(
      rawResponse("<html><body>archived profile</body></html>", {
        url: "http://archive.md/20210326214327/https://example.com/",
        headers: {
          "content-type": "text/html;charset=utf-8",
          "memento-datetime": "Fri, 26 Mar 2021 21:43:27 GMT",
        },
      }),
    );

    const response = await createArchive(createArchiveToday()).content("example.com");

    expect(response.success).toBe(true);
    expect(response.content?.url).toBe("https://example.com/");
    expect(response.content?.snapshot).toBe(
      "http://archive.md/20210326214327/https://example.com/",
    );
    expect(response.content?.timestamp).toBe("2021-03-26T21:43:27Z");
    expect(response.content?.content).toContain("archived profile");
    expect(rawMock).toHaveBeenCalledWith(
      "/20210326214327/https://example.com/",
      objectContaining({ baseURL: "http://archive.md" }),
    );
  });

  it("reports a never-captured URL as a missing capture, not a timemap failure", async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error("404 Not Found"), {
        statusCode: 404,
        data: "TimeMap does not exists. The archive has no Mementos for the requested URI\n",
      }),
    );

    const response = await createArchive(createArchiveToday()).content("example.com/never");

    expect(response.success).toBe(false);
    expect(response.error).toBe("No Archive.today capture for example.com/never");
    expect(rawMock).not.toHaveBeenCalled();
  });

  it("picks the capture the requested instant means, not the newest one", async () => {
    fetchMock.mockResolvedValueOnce(timemap);
    rawMock.mockResolvedValueOnce(
      rawResponse("<html>older</html>", {
        headers: { "memento-datetime": "Sat, 06 Jun 2020 06:06:06 GMT" },
      }),
    );

    await createArchive(createArchiveToday()).content("example.com", { timestamp: "2020-12-31" });

    expect(rawMock).toHaveBeenCalledWith(
      "/20200606060606/https://example.com/",
      objectContaining({ baseURL: "http://archive.md" }),
    );
  });

  it("reads the capture a snapshot URL names, asking the timemap about the original", async () => {
    fetchMock.mockResolvedValueOnce(timemap);
    rawMock.mockResolvedValueOnce(
      rawResponse("<html>archived</html>", {
        headers: { "memento-datetime": "Sat, 06 Jun 2020 06:06:06 GMT" },
      }),
    );

    const response = await createArchive(createArchiveToday()).content(
      "https://archive.ph/20200606060606/https://example.com",
    );

    expect(response.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/timemap/http://example.com", expect.anything());
    expect(rawMock).toHaveBeenCalledWith(
      "/20200606060606/https://example.com/",
      objectContaining({ baseURL: "http://archive.md" }),
    );
  });

  /**
   * The newer capture here is a userinfo variant, so it wins exactly when the
   * same-url narrowing fails to run: a fragment kept anywhere in the compared
   * URL empties the narrowing, and a fragment kept in the target empties the
   * timemap match itself.
   */
  it("reads a capture when the target carries a URL fragment", async () => {
    fetchMock.mockResolvedValueOnce(`
    <http://archive.md/20200606060606/https://example.com/>; rel="first memento"; datetime="Sat, 06 Jun 2020 06:06:06 GMT",
    <http://archive.md/20210101000000/https://sample@example.com/>; rel="last memento"; datetime="Fri, 01 Jan 2021 00:00:00 GMT"
    `);
    rawMock.mockResolvedValueOnce(
      rawResponse("<html>archived</html>", {
        headers: { "memento-datetime": "Sat, 06 Jun 2020 06:06:06 GMT" },
      }),
    );

    const response = await createArchive(createArchiveToday()).content(
      "https://example.com#section",
    );

    expect(response.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/timemap/http://example.com", expect.anything());
    expect(response.content?.snapshot).toBe(
      "http://archive.md/20200606060606/https://example.com/",
    );
  });

  it("follows a capture redirect between Archive.today aliases", async () => {
    fetchMock.mockResolvedValueOnce(timemap);
    rawMock
      .mockResolvedValueOnce(
        rawResponse("", {
          status: 302,
          url: "http://archive.md/20210326214327/https://example.com/",
          headers: {
            location: "https://archive.fo/20210326214327/https://example.com/",
          },
        }),
      )
      .mockResolvedValueOnce(
        rawResponse("<html>aliased capture</html>", {
          url: "https://archive.fo/20210326214327/https://example.com/",
          headers: { "memento-datetime": "Fri, 26 Mar 2021 21:43:27 GMT" },
        }),
      );

    const response = await createArchive(createArchiveToday()).content("example.com");

    expect(response.success).toBe(true);
    expect(response.content?.content).toBe("<html>aliased capture</html>");
    expect(rawMock.mock.calls[1]?.[1]).toMatchObject({
      baseURL: "https://archive.fo",
      redirect: "manual",
    });
  });

  it.each([
    ["another host", "http://127.0.0.1/private"],
    ["a deceptive hostname", "https://archive.is.evil.example/20210326214327/example.com"],
    ["a non-capture path", "https://archive.is/error/403"],
  ])("refuses an Archive.today redirect to %s", async (_case, location) => {
    fetchMock.mockResolvedValueOnce(timemap);
    rawMock.mockResolvedValueOnce(
      rawResponse("", {
        status: 302,
        url: "http://archive.md/20210326214327/https://example.com/",
        headers: { location },
      }),
    );

    const response = await createArchive(createArchiveToday()).content("example.com");

    expect(response.success).toBe(false);
    expect(response.error).toBe("Archive.today playback left its capture endpoint");
    expect(rawMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a body that arrives without a Memento-Datetime header", async () => {
    fetchMock.mockResolvedValueOnce(timemap);
    rawMock.mockResolvedValueOnce(
      rawResponse("<html>please solve this captcha</html>", {
        headers: { "content-type": "text/html" },
      }),
    );

    const response = await createArchive(createArchiveToday()).content("example.com");

    expect(response.success).toBe(false);
    expect(response.error).toContain("bot-protection");
  });

  it("reports an archive with no capture of the URL", async () => {
    fetchMock.mockResolvedValueOnce("");

    const response = await createArchive(createArchiveToday()).content(
      "https://example.com/missing",
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain("No Archive.today capture");
  });
});

describe("common crawl content", () => {
  const record = Buffer.concat([
    Buffer.from("WARC/1.0\r\nWARC-Type: response\r\nContent-Length: 96\r\n\r\n"),
    Buffer.from("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n"),
    Buffer.from("<html><body>Crawled body</body></html>"),
  ]);

  it("reads the WARC byte range the index points at", async () => {
    fetchMock
      .mockResolvedValueOnce(
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20240101000000",
          status: "200",
          mime: "text/html",
          length: "512",
          offset: "1024",
          filename: "crawl-data/CC-MAIN-2024-10/segment.warc.gz",
          digest: "ABC",
        }),
      )
      .mockResolvedValueOnce(gzipSync(record));

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com");

    expect(response.success).toBe(true);
    expect(response.content?.content).toBe("<html><body>Crawled body</body></html>");
    expect(response.content?.mime).toBe("text/html");
    expect(response.content?.timestamp).toBe("2024-01-01T00:00:00Z");
    expect(response.content?.snapshot).toBe(
      "https://data.commoncrawl.org/crawl-data/CC-MAIN-2024-10/segment.warc.gz",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      baseURL: "https://data.commoncrawl.org",
      headers: { range: "bytes=1024-1535" },
    });
  });

  it("reports the missing capture when the index answers no-captures", async () => {
    const noCaptures = Object.assign(new Error("404 Not Found"), {
      statusCode: 404,
      data: '{"message": "No Captures found for: example.com/"}',
    });
    fetchMock.mockRejectedValueOnce(noCaptures);

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com");

    expect(response.success).toBe(false);
    expect(response.error).toContain("No Common Crawl capture for");
  });

  it("bounds the index query around the requested instant", async () => {
    fetchMock
      .mockResolvedValueOnce(
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20240101000000",
          status: "200",
          length: "512",
          offset: "1024",
          filename: "segment.warc.gz",
        }),
      )
      .mockResolvedValueOnce(gzipSync(record));

    await createArchive(createCommonCrawl({ collection: "CC-MAIN-2024-10" })).content(
      "example.com",
      { timestamp: "2024-01" },
    );

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      params: objectContaining({ closest: "20240199999999", sort: "closest" }),
    });
  });

  it("streams the range so the cap applies while the bytes arrive", async () => {
    fetchMock
      .mockResolvedValueOnce(
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20240101000000",
          status: "200",
          length: "512",
          offset: "1024",
          filename: "segment.warc.gz",
        }),
      )
      .mockResolvedValueOnce(gzipSync(record));

    await createArchive(createCommonCrawl({ collection: "CC-MAIN-2024-10" })).content(
      "example.com",
    );

    // Buffering the whole member first would defeat maxBytes for a record the
    // crawler stored at whatever size it found.
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ responseType: "stream" });
  });

  it("undoes the framing and encoding the response travelled with", async () => {
    const payload = gzipSync(Buffer.from("<html><body>Encoded body</body></html>"));
    const chunked = Buffer.concat([
      Buffer.from(`${payload.length.toString(16)}\r\n`),
      payload,
      Buffer.from("\r\n0\r\n\r\n"),
    ]);
    const encodedRecord = Buffer.concat([
      Buffer.from("WARC/1.0\r\nWARC-Type: response\r\n\r\n"),
      Buffer.from(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Encoding: gzip\r\nTransfer-Encoding: chunked\r\n\r\n",
      ),
      chunked,
    ]);
    fetchMock
      .mockResolvedValueOnce(
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20240101000000",
          status: "200",
          length: "512",
          offset: "0",
          filename: "segment.warc.gz",
        }),
      )
      .mockResolvedValueOnce(gzipSync(encodedRecord));

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com");

    // A record keeps the response as it went over the wire, so the chunk sizes
    // and the compression are part of the stored bytes.
    expect(response.content?.content).toBe("<html><body>Encoded body</body></html>");
    expect(response.content?.sha256).toBe(sha256Hex("<html><body>Encoded body</body></html>"));
  });

  it("truncates an encoded body past the cap and keeps its opening", async () => {
    const noisy = Buffer.from("<html><body>" + "page text ".repeat(30_000) + "</body></html>");
    const encodedRecord = Buffer.concat([
      Buffer.from("WARC/1.0\r\nWARC-Type: response\r\n\r\n"),
      Buffer.from("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Encoding: gzip\r\n\r\n"),
      gzipSync(noisy),
    ]);
    fetchMock
      .mockResolvedValueOnce(
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20240101000000",
          status: "200",
          length: "512",
          offset: "0",
          filename: "segment.warc.gz",
        }),
      )
      .mockResolvedValueOnce(gzipSync(encodedRecord));

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com", { maxBytes: 64 });

    // Decompression only expands, so the read cap ends this cleanly: a short body
    // with the flag set, carrying the opening of the page rather than nothing.
    expect(response.success).toBe(true);
    expect(response.content?.truncated).toBe(true);
    expect(response.content?.content).toHaveLength(64);
    expect(response.content?.content.startsWith("<html><body>page text")).toBe(true);
  });

  /* A WARC record whose response went out with `encoding`, gzipped as Common Crawl stores it. */
  function encodedSegment(encoding: string, body: Uint8Array): Buffer {
    return gzipSync(
      Buffer.concat([
        Buffer.from("WARC/1.0\r\nWARC-Type: response\r\n\r\n"),
        Buffer.from(
          `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Encoding: ${encoding}\r\n\r\n`,
        ),
        body,
      ]),
    );
  }

  /* The index row pointing at a segment of `length` bytes. */
  function indexRow(length: number): string {
    return JSON.stringify({
      url: "https://example.com/",
      timestamp: "20240101000000",
      status: "200",
      length: String(length),
      offset: "0",
      filename: "segment.warc.gz",
    });
  }

  it.each([
    ["br", "brotli", brotliCompressSync],
    ["zstd", "zstd", zstdCompressSync],
    ["deflate", "zlib", deflateSync],
    ["deflate", "raw deflate", deflateRawSync],
  ] as const)("decodes a body stored %s-encoded as %s", async (encoding, _stream, encode) => {
    const page = "<html><body>Squeezed body</body></html>";
    const segment = encodedSegment(encoding, encode(Buffer.from(page)));
    fetchMock.mockResolvedValueOnce(indexRow(segment.length)).mockResolvedValueOnce(segment);

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com");

    expect(response.content?.content).toBe(page);
    expect(response.content?.truncated).toBe(false);
  });

  it("cuts a brotli body at the cap and keeps its opening", async () => {
    const page = "<html><body>" + "page text ".repeat(30_000) + "</body></html>";
    const segment = encodedSegment("br", brotliCompressSync(Buffer.from(page)));
    fetchMock.mockResolvedValueOnce(indexRow(segment.length)).mockResolvedValueOnce(segment);

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com", { maxBytes: 64 });

    expect(response.content?.truncated).toBe(true);
    expect(response.content?.content).toBe(page.slice(0, 64));
  });

  it("names an encoding it cannot undo instead of returning noise", async () => {
    const segment = encodedSegment("compress", Buffer.from([0x1f, 0x9d, 0x90]));
    fetchMock.mockResolvedValueOnce(indexRow(segment.length)).mockResolvedValueOnce(segment);

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com");

    expect(response.success).toBe(false);
    expect(response.error).toContain("compress-encoded, which this client cannot decode");
  });

  /* A crawl file runs to gigabytes, so past the record this one never ends. */
  it("stops reading at the record length when the server ignores the range", async () => {
    const segment = gzipSync(record);
    let served = 0;
    const wholeFile = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(segment);
        served += segment.length;
      },
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
        served += 64 * 1024;
      },
    });
    fetchMock.mockResolvedValueOnce(indexRow(segment.length)).mockResolvedValueOnce(wholeFile);

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com");

    expect(response.content?.content).toBe("<html><body>Crawled body</body></html>");
    expect(served).toBeLessThan(segment.length + 256 * 1024);
  });

  it.each([
    ["text", Buffer.from(randomBytes(150_000).toString("hex"))],
    ["incompressible bytes", randomBytes(300_000)],
  ])("stops downloading %s once a prefix decodes past the cap", async (_kind, page) => {
    const segment = gzipSync(
      Buffer.concat([
        Buffer.from("WARC/1.0\r\nWARC-Type: response\r\n\r\n"),
        Buffer.from("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n"),
        page,
      ]),
    );
    let served = 0;
    const ranged = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (served >= segment.length) {
          controller.close();
          return;
        }
        const chunk = segment.subarray(served, served + 4096);
        served += chunk.length;
        controller.enqueue(chunk);
      },
    });
    fetchMock.mockResolvedValueOnce(indexRow(segment.length)).mockResolvedValueOnce(ranged);

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com", { maxBytes: 64 });

    expect(response.content?.sha256).toBe(sha256Hex(page.subarray(0, 64)));
    expect(response.content?.truncated).toBe(true);
    expect(served).toBeLessThan(segment.length / 4);
  });

  it("reports a record whose HTTP response cannot be found", async () => {
    const segment = gzipSync(Buffer.from("not a warc record"));
    fetchMock
      .mockResolvedValueOnce(
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20240101000000",
          status: "200",
          length: String(segment.length),
          offset: "0",
          filename: "segment.warc.gz",
        }),
      )
      .mockResolvedValueOnce(segment);

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com");

    expect(response.success).toBe(false);
    expect(response.error).toContain("readable HTTP response");
  });
});

describe("targets that name storage rather than a page", () => {
  it("explains a Common Crawl snapshot URL instead of searching for it", async () => {
    const response = await createArchive(createWayback()).content(
      "https://data.commoncrawl.org/crawl-data/CC-MAIN-2024-10/segment.warc.gz",
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain("names the WARC file");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("providers without an archived-body endpoint", () => {
  it("names WebCite's gap", async () => {
    const response = await createArchive(createWebcite()).content("example.com");

    expect(response.unsupported).toBe(true);
    expect(response.unsupportedReason).toContain("opaque snapshot id");
  });
});

describe("multi-provider content", () => {
  it("returns the first body and keeps the other providers' outcomes beside it", async () => {
    const failing = stubProvider("wayback", () =>
      Promise.resolve(contentFailure("wayback", "Wayback unavailable")),
    );
    const answering = stubProvider("commoncrawl", () =>
      Promise.resolve({
        success: true,
        content: {
          url: "https://example.com/",
          timestamp: "2024-01-01T00:00:00Z",
          snapshot: "https://data.commoncrawl.org/segment.warc.gz",
          content: "crawled",
          bytes: 7,
          truncated: false,
          _meta: { provider: "commoncrawl" },
        },
        _meta: { source: "commoncrawl", provider: "commoncrawl" },
      } satisfies ArchiveContentResponse),
    );
    const unsupported = stubProvider("webcite", () =>
      Promise.resolve({
        success: false,
        unsupported: true,
        unsupportedReason: "no archived-body endpoint",
        _meta: { source: "webcite", provider: "webcite" },
      } satisfies ArchiveContentResponse),
    );

    const response = await createArchive([failing, unsupported, answering]).content("example.com");

    expect(response.success).toBe(true);
    expect(response.content?.content).toBe("crawled");
    expect(response._meta?.errors).toEqual(["wayback: Wayback unavailable"]);
    expect(response._meta?.unsupportedProviders).toEqual([
      { provider: "webcite", reason: "no archived-body endpoint" },
    ]);
  });

  it("stops at the first provider that answers", async () => {
    const first = stubProvider("wayback", () =>
      Promise.resolve({
        success: true,
        content: {
          url: "https://example.com/",
          timestamp: "2024-01-01T00:00:00Z",
          snapshot: "https://web.archive.org/web/20240101000000/https://example.com/",
          content: "first",
          bytes: 5,
          truncated: false,
          _meta: { provider: "wayback" },
        },
        _meta: { source: "wayback", provider: "wayback" },
      } satisfies ArchiveContentResponse),
    );
    const second = stubProvider("commoncrawl", vi.fn());

    await createArchive([first, second]).content("example.com");

    expect(second.content).not.toHaveBeenCalled();
  });

  it("treats a provider without the method as unsupported, by name", async () => {
    const response = await createArchive([stubProvider("archive-today")]).content("example.com");

    expect(response.unsupported).toBe(true);
    expect(response.unsupportedReason).toContain("does not implement reading archived content");
  });

  it("throws UnsupportedOperationError from getContent when nobody can read", async () => {
    const archive = createArchive([stubProvider("conifer"), createWebcite()]);

    await expect(archive.getContent("example.com")).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
    await expect(archive.getContent("example.com")).rejects.toMatchObject({
      providers: [
        objectContaining({ provider: "conifer" }),
        objectContaining({ provider: "webcite" }),
      ],
    });
  });

  it("throws a plain error from getContent when a read failed at runtime", async () => {
    const failing = stubProvider("wayback", () =>
      Promise.resolve(contentFailure("wayback", "Wayback unavailable")),
    );

    await expect(createArchive([failing]).getContent("example.com")).rejects.toThrow(
      "Wayback unavailable",
    );
  });
});

describe("failed reads", () => {
  /** A transport error can carry its request headers, so the diagnostic field is a credential channel. */
  it("keeps the raw error object out of the response that reaches a transcript", async () => {
    const failure = Object.assign(new Error("Request failed"), {
      request: "https://web.archive.org/cdx/search/cdx",
      options: { headers: { authorization: "ApiKey super-secret-test-key" } },
    });
    fetchMock.mockRejectedValue(failure);
    const { contentArchives } = await import("../src/tool-operations");

    const raw = await createArchive(createWayback()).content("example.com", { cache: false });
    const tool = await contentArchives({
      target: "example.com",
      provider: "wayback",
      cache: false,
    });

    // Control: the provider response really does carry the secret, so the
    // assertion below is about redaction rather than about an absent error.
    expect(raw.success).toBe(false);
    expect(JSON.stringify(raw._meta?.errorDetails)).toContain("super-secret-test-key");

    expect(tool.details.response._meta?.errorDetails).toBe("<redacted>");
    expect(JSON.stringify(tool.details)).not.toContain("super-secret-test-key");
  });
});

describe("content helpers", () => {
  it("unwraps playback URLs and leaves ordinary ones alone", () => {
    expect(
      unwrapSnapshotUrl("https://web.archive.org/web/20190301120000id_/https://example.com/page"),
    ).toEqual({ url: "https://example.com/page", timestamp: "20190301120000" });
    expect(unwrapSnapshotUrl("https://wayback.archive-it.org/4399/20190301/example.com")).toEqual({
      url: "example.com",
      timestamp: "20190301",
    });
    expect(
      unwrapSnapshotUrl("https://arquivo.pt/wayback/20200402133000id_/https://example.com/page"),
    ).toEqual({ url: "https://example.com/page", timestamp: "20200402133000" });
    expect(
      unwrapSnapshotUrl("https://vefsafn.is/20200402195411mp_/https://www.example.com/"),
    ).toEqual({ url: "https://www.example.com/", timestamp: "20200402195411" });
    expect(unwrapSnapshotUrl("https://example.com/web/page")).toEqual({
      url: "https://example.com/web/page",
    });
    expect(unwrapSnapshotUrl("https://example.com/archive/20200402133000/report.html")).toEqual({
      url: "https://example.com/archive/20200402133000/report.html",
    });
  });

  it("treats a port as part of the page unless the scheme implies it", () => {
    const urls = [
      "http://example.com:80/",
      "http://example.com:8080/",
      "http://example.com:443/",
      "https://example.com:443/",
      "https://example.com/",
    ];
    const same = (target: string) => preferSameUrl(urls, target, (url) => url);

    expect(same("http://example.com/")).toEqual(["http://example.com:80/"]);
    expect(same("https://example.com/")).toEqual([
      "https://example.com/",
      "https://example.com:443/",
    ]);
    expect(same("http://example.com:8080/")).toEqual(["http://example.com:8080/"]);
    expect(same("http://example.com:443/")).toEqual(["http://example.com:443/"]);
  });

  it("reduces markup to what a reader would see", () => {
    const text = htmlToText(
      `<html><head><style>b{color:red}</style><script>alert("x")</script></head>
       <body><h1>Title</h1><p>First&nbsp;line &amp; more</p><p>Second</p></body></html>`,
    );

    expect(text).toBe("Title\nFirst line & more\nSecond");
  });

  it("drops an unterminated script block left behind by truncation", () => {
    expect(htmlToText("<p>Kept</p><script>var a = '<p>forged</p>'")).toBe("Kept");
  });

  it("keeps a quoted angle bracket inside its tag", () => {
    expect(htmlToText('<div title="1 > 0">Hello</div>')).toBe("Hello");
    expect(htmlToText("<a href='/x?a=1&gt;2'>Link</a>")).toBe("Link");
  });

  it("does not mistake a longer tag name for the closing one", () => {
    // A script that mentions `</scripture>` would otherwise resume the scan in
    // the middle of its own source and emit the rest as page text.
    expect(
      htmlToText('<p>Kept</p><script>var a = "</scripture>"; leak();</script><p>After</p>'),
    ).toBe("Kept\nAfter");
  });

  it("keeps a less-than sign that opens no tag", () => {
    expect(htmlToText("<p>Price: 2 < 3 and 5 > 4</p>")).toBe("Price: 2 < 3 and 5 > 4");
    // A doctype still counts as markup rather than text.
    expect(htmlToText("<!doctype html><p>Body</p>")).toBe("Body");
  });

  it("stays linear on markup that never terminates", () => {
    // An archived page is an input an attacker picks, and the byte cap admits
    // 2 MiB of it. The `replace()` chain this scan replaced backtracked
    // quadratically on each of these: 128 KiB of bare `<` cost 9.8 seconds.
    const budgetMs = 5000;

    for (const unit of ["<", "<!--", "<script >"]) {
      const body = unit.repeat((2 * 1024 * 1024) / unit.length);
      const started = performance.now();
      htmlToText(body);
      expect(performance.now() - started).toBeLessThan(budgetMs);
    }
  });
});

describe("capture bytes", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x80]);
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), "capture-bytes-")));
    vi.stubEnv("ARCHIVES_CAPTURE_DIR", root);
    return async () => {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    };
  });

  function servePng(): void {
    fetchMock.mockResolvedValue(cdxRows([["https://example.com/a.png", "20200202000000", "200"]]));
    rawMock.mockImplementation(async () =>
      rawResponse(png, {
        url: "https://web.archive.org/web/20200202000000id_/https://example.com/a.png",
        headers: { "content-type": "image/png" },
      }),
    );
  }

  async function readPng(path: string) {
    const { contentArchives } = await import("../src/tool-operations");
    return contentArchives({ target: "https://example.com/a.png", provider: "wayback", path });
  }

  it("returns the bytes behind the digest only when the read asks for them", async () => {
    servePng();
    const archive = createArchive(createWayback());

    const plain = await archive.content("https://example.com/a.png", { cache: false });
    const withBody = await archive.content("https://example.com/a.png", { body: true });

    expect(plain.content?.body).toBeUndefined();
    expect(withBody.content?.body).toEqual(png);
    expect(withBody.content?.sha256).toBe(sha256Hex(png));
  });

  it("reads bytes from the archive every time instead of the cache", async () => {
    servePng();
    const archive = createArchive(createWayback());

    await archive.content("https://example.com/a.png");
    const withBody = await archive.content("https://example.com/a.png", { body: true });
    const again = await archive.content("https://example.com/a.png", { body: true });

    expect(withBody.fromCache).toBeUndefined();
    expect(again.content?.body).toEqual(png);
    expect(rawMock).toHaveBeenCalledTimes(3);
  });

  it("returns a Common Crawl body with its transfer and content encodings undone", async () => {
    const page = "<html><body>Encoded body</body></html>";
    const record = Buffer.concat([
      Buffer.from("WARC/1.0\r\nWARC-Type: response\r\n\r\n"),
      Buffer.from("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Encoding: gzip\r\n\r\n"),
      gzipSync(page),
    ]);
    fetchMock
      .mockResolvedValueOnce(
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20240101000000",
          status: "200",
          length: "512",
          offset: "0",
          filename: "segment.warc.gz",
        }),
      )
      .mockResolvedValueOnce(gzipSync(record));

    const response = await createArchive(
      createCommonCrawl({ collection: "CC-MAIN-2024-10" }),
    ).content("example.com", { body: true });

    expect(new TextDecoder().decode(response.content?.body)).toBe(page);
    expect(response.content?.sha256).toBe(sha256Hex(page));
  });

  it("writes a binary capture to a new file whose hash is the one reported", async () => {
    servePng();

    const result = await readPng("shots/a.png");

    const file = join(root, "shots", "a.png");
    const text = result.content[0]?.text ?? "";
    expect(result.isError).toBeUndefined();
    expect(new Uint8Array(await readFile(file))).toEqual(png);
    expect(text).toContain(`\nsha256: ${sha256Hex(png)}\n`);
    expect(text).toContain(`\nfile: ${file}; ${png.byteLength} bytes written\n`);
    expect(text).toContain("The file above holds its bytes.");
    expect(result.details.path).toBe(file);
    expect(result.details.response.content).not.toHaveProperty("body");
  });

  it("points at path when a binary capture is read without one", async () => {
    servePng();
    const { contentArchives } = await import("../src/tool-operations");

    const result = await contentArchives({
      target: "https://example.com/a.png",
      provider: "wayback",
    });

    expect(result.content[0]?.text).toContain("Pass path to write them to a file.");
  });

  it.each([
    ["a parent directory", "../outside.png"],
    ["an absolute path elsewhere", "/etc/outside.png"],
    ["the directory itself", "."],
  ])("refuses %s before asking any archive", async (_label, path) => {
    servePng();

    await expect(readPng(path)).rejects.toThrow("leaves the capture directory");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rawMock).not.toHaveBeenCalled();
  });

  it("escapes line separators and bidi controls when it names a refused path", async () => {
    servePng();

    const error: unknown = await readPng("a\u2028\u202Eb/../../c.png").catch(
      (caught: unknown) => caught,
    );

    expect(String(error)).toContain(String.raw`a\u{2028}\u{202e}b`);
    expect(String(error)).not.toMatch(/[\u2028\u202E]/u);
  });

  it("refuses a link inside the directory that points out of it", async () => {
    const outside = await realpath(await mkdtemp(join(tmpdir(), "capture-outside-")));
    await symlink(outside, join(root, "out"));
    servePng();

    try {
      await expect(readPng("out/a.png")).rejects.toThrow("through a link");
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("leaves an existing file alone", async () => {
    await writeFile(join(root, "a.png"), "kept");
    servePng();

    await expect(readPng("a.png")).rejects.toThrow("already exists");
    expect(await readFile(join(root, "a.png"), "utf8")).toBe("kept");
    expect(rawMock).not.toHaveBeenCalled();
  });

  it("does not write a body cut at the byte cap and fails the call", async () => {
    fetchMock.mockResolvedValue(cdxRows([["https://example.com/a.png", "20200202000000", "200"]]));
    rawMock.mockImplementation(async () =>
      rawResponse(new Uint8Array(2_000_001), { headers: { "content-type": "image/png" } }),
    );

    const result = await readPng("big.png");

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "file: not written, the body is longer than the 2000000 bytes one call reads",
    );
    expect(await readdir(root)).toEqual([]);
  });

  it("names a capture directory that does not exist", async () => {
    vi.stubEnv("ARCHIVES_CAPTURE_DIR", join(root, "missing"));

    await expect(readPng("a.png")).rejects.toThrow("ARCHIVES_CAPTURE_DIR names");
  });
});
