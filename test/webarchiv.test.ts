import { objectContaining } from "./_matchers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { $fetch, type FetchResponse } from "ofetch";
import { WebarchivProvider, createArchive, providers, resetConfig, storage } from "../src";
import createWebarchiv from "../src/providers/webarchiv";

vi.mock("ofetch", async (importOriginal) => {
  const original = await importOriginal<typeof import("ofetch")>();
  const raw = vi.fn();
  return { ...original, $fetch: Object.assign(vi.fn(), { raw }) };
});

const fetchMock = vi.mocked($fetch);
/* oxlint-disable-next-line typescript/unbound-method -- ofetch.raw is a standalone callable and the mock has no receiver state. */
const rawMock = fetchMock.raw;

function cdx(timestamp: string, url = "https://www.onb.ac.at/", extra = {}) {
  return `at,ac,onb)/ ${timestamp} ${JSON.stringify({
    url,
    mime: "text/html",
    status: "200",
    digest: `digest-${timestamp}`,
    length: "512",
    ...extra,
  })}`;
}

function rawResponse(
  body: string,
  init: Readonly<{
    url?: string;
    status?: number;
    headers?: Readonly<Record<string, string>>;
  }> = {},
) {
  return {
    status: init.status ?? 200,
    url: init.url ?? "",
    headers: new Headers(init.headers ?? {}),
    _data: body,
  } as unknown as FetchResponse<unknown>;
}

beforeEach(async () => {
  await storage.clear();
  resetConfig();
  vi.resetAllMocks();
});

describe("Webarchiv Österreich", () => {
  it("is available through the public registry and provider=all", async () => {
    const provider = await providers.webarchiv();
    const all = await providers.all();

    expect(provider).toBeInstanceOf(WebarchivProvider);
    expect(provider.slug).toBe("webarchiv");
    expect(all.map((entry) => entry.slug)).toContain("webarchiv");
  });

  it("lists CDXJ captures with normalized metadata and request bounds", async () => {
    fetchMock.mockResolvedValueOnce(
      [cdx("20200203040506"), cdx("not-a-date", "https://www.onb.ac.at/broken")].join("\n"),
    );

    const controller = new AbortController();
    const result = await createArchive(createWebarchiv()).snapshots("https://www.onb.ac.at/", {
      limit: 2,
      from: "2020",
      to: "2021-04-05",
      signal: controller.signal,
    });

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([
      {
        url: "https://www.onb.ac.at/",
        timestamp: "2020-02-03T04:05:06Z",
        snapshot: "https://webarchiv.onb.ac.at/web/20200203040506/https://www.onb.ac.at/",
        _meta: {
          provider: "webarchiv",
          timestamp: "20200203040506",
          status: 200,
          mime: "text/html",
          digest: "digest-20200203040506",
          length: "512",
        },
      },
    ]);
    expect(result._meta).toMatchObject({ source: "webarchiv", provider: "webarchiv" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/web/cdx",
      objectContaining({
        baseURL: "https://webarchiv.onb.ac.at",
        responseType: "text",
        signal: controller.signal,
        params: {
          url: "http://www.onb.ac.at/",
          limit: "1000",
          from: "2020",
          to: "20210405",
        },
      }),
    );
  });

  it("returns an empty success when the CDX endpoint has no capture", async () => {
    fetchMock.mockRejectedValueOnce({ response: new Response("not found", { status: 404 }) });

    const result = await createArchive(createWebarchiv()).snapshots("missing.example");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("separates cached listings created with different provider limits", async () => {
    fetchMock
      .mockResolvedValueOnce(cdx("20200101000000"))
      .mockResolvedValueOnce([cdx("20200101000000"), cdx("20200102000000")].join("\n"));

    const narrow = await createArchive(createWebarchiv({ limit: 1 })).snapshots("onb.ac.at");
    const wide = await createArchive(createWebarchiv({ limit: 2 })).snapshots("onb.ac.at");

    expect(narrow.pages).toHaveLength(1);
    expect(wide.pages).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not invent an HTTP status missing from CDXJ", async () => {
    fetchMock.mockResolvedValueOnce(cdx("20200101000000", undefined, { status: undefined }));

    const result = await createArchive(createWebarchiv()).snapshots("onb.ac.at");

    expect(result.success).toBe(true);
    expect(result.pages[0]?._meta).not.toHaveProperty("status");
  });

  it("reports a malformed CDXJ record as a provider error", async () => {
    fetchMock.mockResolvedValueOnce("not a CDXJ record");

    const result = await createArchive(createWebarchiv()).snapshots("onb.ac.at");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Webarchiv Österreich returned a malformed CDXJ record");
  });

  it("reads the preferred exact capture through the raw replay endpoint", async () => {
    fetchMock.mockResolvedValueOnce([cdx("20190101000000"), cdx("20210101000000")].join("\n"));
    rawMock.mockResolvedValueOnce(
      rawResponse("<html><body>archived</body></html>", {
        url: "https://webarchiv.onb.ac.at/web/20190101000000id_/https://www.onb.ac.at/",
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const controller = new AbortController();
    const result = await createArchive(createWebarchiv()).content("https://www.onb.ac.at/", {
      timestamp: "2020-06-01",
      maxBytes: 4096,
      signal: controller.signal,
    });

    expect(result.success).toBe(true);
    expect(result.content).toMatchObject({
      url: "https://www.onb.ac.at/",
      timestamp: "2019-01-01T00:00:00Z",
      snapshot: "https://webarchiv.onb.ac.at/web/20190101000000/https://www.onb.ac.at/",
      content: "<html><body>archived</body></html>",
      mime: "text/html",
      bytes: 34,
      truncated: false,
      _meta: {
        provider: "webarchiv",
        timestamp: "20190101000000",
        status: 200,
        mime: "text/html",
        digest: "digest-20190101000000",
        length: "512",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/web/cdx",
      objectContaining({
        params: {
          url: "http://www.onb.ac.at/",
          limit: "5",
          to: "20200601",
          reverse: "true",
        },
      }),
    );
    expect(rawMock).toHaveBeenCalledWith(
      "/web/20190101000000id_/https://www.onb.ac.at/",
      objectContaining({
        baseURL: "https://webarchiv.onb.ac.at",
        responseType: "stream",
        signal: controller.signal,
      }),
    );
  });

  it("queries forward only when no capture exists at or before the requested time", async () => {
    fetchMock.mockResolvedValueOnce("").mockResolvedValueOnce(cdx("20210101000000"));
    rawMock.mockResolvedValueOnce(
      rawResponse("later", {
        url: "https://webarchiv.onb.ac.at/web/20210101000000id_/https://www.onb.ac.at/",
      }),
    );

    const result = await createArchive(createWebarchiv()).content("https://www.onb.ac.at/", {
      timestamp: "2020",
    });

    expect(result.success).toBe(true);
    expect(result.content?.timestamp).toBe("2021-01-01T00:00:00Z");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/web/cdx",
      objectContaining({ params: objectContaining({ to: "2020", reverse: "true" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/web/cdx",
      objectContaining({ params: objectContaining({ from: "2020" }) }),
    );
    const secondOptions = fetchMock.mock.calls[1]?.[1] as { params?: Record<string, string> };
    expect(secondOptions.params).not.toHaveProperty("reverse");
  });

  it("does not follow a replay redirect outside Webarchiv Österreich", async () => {
    fetchMock.mockResolvedValueOnce(cdx("20200203040506"));
    rawMock.mockResolvedValueOnce(
      rawResponse("", {
        status: 302,
        url: "https://webarchiv.onb.ac.at/web/20200203040506id_/https://www.onb.ac.at/",
        headers: { location: "http://127.0.0.1/private" },
      }),
    );

    const result = await createArchive(createWebarchiv()).content("https://www.onb.ac.at/", {
      timestamp: "20200203040506",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Webarchiv Österreich replay left its raw playback endpoint");
    expect(rawMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect on the same origin when it leaves the replay endpoint", async () => {
    fetchMock.mockResolvedValueOnce(cdx("20200203040506"));
    rawMock
      .mockResolvedValueOnce(
        rawResponse("", {
          status: 302,
          url: "https://webarchiv.onb.ac.at/web/20200203040506id_/https://www.onb.ac.at/",
          headers: { location: "/error/403" },
        }),
      )
      .mockResolvedValueOnce(
        rawResponse("access denied", {
          url: "https://webarchiv.onb.ac.at/error/403",
        }),
      );

    const result = await createArchive(createWebarchiv()).content("https://www.onb.ac.at/", {
      timestamp: "20200203040506",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Webarchiv Österreich replay left its raw playback endpoint");
    expect(rawMock).toHaveBeenCalledTimes(1);
  });

  it("uses the timestamp and original URL from a Webarchiv snapshot URL", async () => {
    fetchMock.mockResolvedValueOnce(cdx("20200203040506"));
    rawMock.mockResolvedValueOnce(
      rawResponse("body", {
        url: "https://webarchiv.onb.ac.at/web/20200203040506id_/https://www.onb.ac.at/",
      }),
    );

    const result = await createArchive(createWebarchiv()).content(
      "https://webarchiv.onb.ac.at/web/20200203040506/https://www.onb.ac.at/",
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/web/cdx",
      objectContaining({
        params: objectContaining({
          url: "http://www.onb.ac.at/",
          to: "20200203040506",
          reverse: "true",
        }),
      }),
    );
  });

  it("rejects wildcard content targets without making a request", async () => {
    const result = await createArchive(createWebarchiv()).content("onb.ac.at/*");

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Reading archived content requires one exact URL, not a wildcard pattern",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rawMock).not.toHaveBeenCalled();
  });
});
