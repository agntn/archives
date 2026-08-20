import { gzipSync } from "node:zlib";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { $fetch, type FetchResponse } from "ofetch";
import { createArchive, resetConfig, storage, UnsupportedOperationError } from "../src";
import type { ArchiveContentResponse, ArchiveProvider } from "../src/types";
import createWayback from "../src/providers/wayback";
import createCommonCrawl from "../src/providers/commoncrawl";
import createArchiveToday from "../src/providers/archive-today";
import createWebcite from "../src/providers/webcite";
import createArchiveIt from "../src/providers/archive-it";
import { htmlToText, unwrapSnapshotUrl } from "../src/utils";

vi.mock("ofetch", () => {
  const raw = vi.fn();
  return { $fetch: Object.assign(vi.fn(), { raw }) };
});

const fetchMock = vi.mocked($fetch);
const rawMock = vi.mocked($fetch.raw);

function cdxRows(rows: string[][]): string[][] {
  return [["original", "timestamp", "statuscode"], ...rows];
}

function rawResponse(
  body: string | Uint8Array | ReadableStream<Uint8Array>,
  init: { url?: string; status?: number; headers?: Record<string, string> } = {},
) {
  // SAFETY: the helpers under test read only these four fields of a response.
  return {
    status: init.status ?? 200,
    url: init.url ?? "",
    headers: new Headers(init.headers ?? {}),
    _data: body,
  } as unknown as FetchResponse<unknown>;
}

function textStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

/** A provider stub with only the methods a given test needs. */
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
      params: expect.objectContaining({ limit: "-5", url: "example.com" }),
    });
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
      params: expect.objectContaining({ to: "20190302043000" }),
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
      params: expect.objectContaining({ to: "20190301" }),
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
      params: expect.objectContaining({ to: "20190302043000" }),
    });
  });

  it("reads the capture a playback URL names instead of searching for that URL", async () => {
    fetchMock.mockResolvedValueOnce(cdxRows([["https://example.com/", "20190301120000", "200"]]));
    rawMock.mockResolvedValueOnce(rawResponse("unwrapped", { url: "" }));

    const response = await createArchive(createWayback()).content(
      "https://web.archive.org/web/20190301120000id_/https://example.com/",
    );

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      params: expect.objectContaining({ url: "example.com/", to: "20190301120000" }),
    });
    expect(response.success).toBe(true);
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
      params: expect.objectContaining({ sort: "reverse" }),
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
      params: expect.objectContaining({ closest: "20240199999999", sort: "closest" }),
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
  });

  it("reports a record whose HTTP response cannot be found", async () => {
    fetchMock
      .mockResolvedValueOnce(
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20240101000000",
          status: "200",
          length: "10",
          offset: "0",
          filename: "segment.warc.gz",
        }),
      )
      .mockResolvedValueOnce(gzipSync(Buffer.from("not a warc record")));

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
  it("names Archive.today's gap instead of returning its wrapper page", async () => {
    const response = await createArchive(createArchiveToday()).content("example.com");

    expect(response.success).toBe(false);
    expect(response.unsupported).toBe(true);
    expect(response.unsupportedReason).toContain("no raw-capture endpoint");
  });

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
    const unsupported = stubProvider("archive-today", () =>
      Promise.resolve({
        success: false,
        unsupported: true,
        unsupportedReason: "no raw-capture endpoint",
        _meta: { source: "archive-today", provider: "archive-today" },
      } satisfies ArchiveContentResponse),
    );

    const response = await createArchive([failing, unsupported, answering]).content("example.com");

    expect(response.success).toBe(true);
    expect(response.content?.content).toBe("crawled");
    expect(response._meta?.errors).toEqual(["wayback: Wayback unavailable"]);
    expect(response._meta?.unsupportedProviders).toEqual([
      { provider: "archive-today", reason: "no raw-capture endpoint" },
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
    const archive = createArchive([createArchiveToday(), createWebcite()]);

    await expect(archive.getContent("example.com")).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
    await expect(archive.getContent("example.com")).rejects.toMatchObject({
      providers: [
        expect.objectContaining({ provider: "archive-today" }),
        expect.objectContaining({ provider: "webcite" }),
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
  it("keeps the raw error object out of the response that reaches a transcript", async () => {
    // An ofetch error carries the request it failed on, headers included, so the
    // diagnostic field is a credential channel rather than a detail.
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
    expect(unwrapSnapshotUrl("https://example.com/web/page")).toEqual({
      url: "https://example.com/web/page",
    });
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
