import { objectContaining } from "./_matchers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { $fetch, type FetchResponse } from "ofetch";
import { ArquivoProvider, createArchive, providers, resetConfig, storage } from "../src";
import createArquivo from "../src/providers/arquivo";

vi.mock("ofetch", () => {
  const raw = vi.fn();
  return { $fetch: Object.assign(vi.fn(), { raw }) };
});

const fetchMock = vi.mocked($fetch);
/* oxlint-disable-next-line typescript/unbound-method -- ofetch.raw is a standalone callable and the mock has no receiver state. */
const rawMock = fetchMock.raw;

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

describe("Arquivo.pt", () => {
  it("is available through the public registry and provider=all", async () => {
    const provider = await providers.arquivo();
    const all = await providers.all();

    expect(provider).toBeInstanceOf(ArquivoProvider);
    expect(provider.slug).toBe("arquivo");
    expect(all.map((entry) => entry.slug)).toContain("arquivo");
  });

  it("lists CDX captures with normalized metadata and request bounds", async () => {
    fetchMock.mockResolvedValueOnce(
      [
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20220203040506",
          status: "200",
          mime: "text/html",
          digest: "ABC123",
          length: "512",
        }),
        JSON.stringify({
          url: "https://example.com/broken",
          timestamp: "not-a-date",
          status: "200",
        }),
      ].join("\n"),
    );

    const controller = new AbortController();
    const result = await createArchive(createArquivo()).snapshots("example.com", {
      limit: 2,
      from: "2021-03",
      to: "2022-04-05",
      signal: controller.signal,
    });

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([
      {
        url: "https://example.com/",
        timestamp: "2022-02-03T04:05:06Z",
        snapshot: "https://arquivo.pt/wayback/20220203040506/https://example.com/",
        _meta: {
          provider: "arquivo",
          timestamp: "20220203040506",
          status: 200,
          mime: "text/html",
          digest: "ABC123",
          length: "512",
        },
      },
    ]);
    expect(result._meta).toMatchObject({ source: "arquivo", provider: "arquivo" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/wayback/cdx",
      objectContaining({
        baseURL: "https://arquivo.pt",
        responseType: "text",
        signal: controller.signal,
        params: {
          url: "example.com/*",
          output: "json",
          fields: "url,timestamp,status,mime,digest,length",
          limit: "1000",
          from: "202103",
          to: "20220405",
        },
      }),
    );
  });

  it("returns an empty success for an empty CDX response", async () => {
    fetchMock.mockResolvedValueOnce("");

    const result = await createArchive(createArquivo()).snapshots("missing.example");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("separates cached listings created with different provider limits", async () => {
    fetchMock
      .mockResolvedValueOnce(
        JSON.stringify({ url: "https://example.com/1", timestamp: "20200101000000" }),
      )
      .mockResolvedValueOnce(
        [
          JSON.stringify({ url: "https://example.com/1", timestamp: "20200101000000" }),
          JSON.stringify({ url: "https://example.com/2", timestamp: "20200102000000" }),
        ].join("\n"),
      );

    const narrow = await createArchive(createArquivo({ limit: 1 })).snapshots("example.com");
    const wide = await createArchive(createArquivo({ limit: 2 })).snapshots("example.com");

    expect(narrow.pages).toHaveLength(1);
    expect(wide.pages).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a malformed CDX record as a provider error", async () => {
    fetchMock.mockResolvedValueOnce("[]");

    const result = await createArchive(createArquivo()).snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Arquivo.pt CDX returned a non-object JSON record");
  });

  it("reads the preferred exact capture through the raw replay endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      [
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20190101000000",
          status: "200",
          mime: "text/html",
          digest: "old",
          length: "128",
        }),
        JSON.stringify({
          url: "https://example.com/",
          timestamp: "20210101000000",
          status: "200",
          mime: "text/html",
          digest: "new",
          length: "256",
        }),
      ].join("\n"),
    );
    rawMock.mockResolvedValueOnce(
      rawResponse("<html><body>archived</body></html>", {
        url: "https://arquivo.pt/noFrame/replay/20190101000000id_/https://example.com/",
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const controller = new AbortController();
    const result = await createArchive(createArquivo()).content("https://example.com/", {
      timestamp: "2020-06-01",
      maxBytes: 4096,
      signal: controller.signal,
    });

    expect(result.success).toBe(true);
    expect(result.content).toMatchObject({
      url: "https://example.com/",
      timestamp: "2019-01-01T00:00:00Z",
      snapshot: "https://arquivo.pt/wayback/20190101000000/https://example.com/",
      content: "<html><body>archived</body></html>",
      mime: "text/html",
      bytes: 34,
      truncated: false,
      _meta: {
        provider: "arquivo",
        timestamp: "20190101000000",
        status: 200,
        mime: "text/html",
        digest: "old",
        length: "128",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/wayback/cdx",
      objectContaining({
        params: objectContaining({
          url: "example.com/",
          matchType: "exact",
          allowFuzzy: "false",
          to: "20200601",
          sort: "reverse",
          limit: "200",
        }),
      }),
    );
    expect(rawMock).toHaveBeenCalledWith(
      "/noFrame/replay/20190101000000id_/https://example.com/",
      objectContaining({
        baseURL: "https://arquivo.pt",
        responseType: "stream",
        signal: controller.signal,
      }),
    );
  });

  it("queries forward only when no capture exists at or before the requested time", async () => {
    fetchMock.mockResolvedValueOnce("").mockResolvedValueOnce(
      JSON.stringify({
        url: "https://example.com/",
        timestamp: "20210101000000",
        status: "200",
      }),
    );
    rawMock.mockResolvedValueOnce(
      rawResponse("later", {
        url: "https://arquivo.pt/noFrame/replay/20210101000000id_/https://example.com/",
      }),
    );

    const result = await createArchive(createArquivo()).content("https://example.com/", {
      timestamp: "2020",
    });

    expect(result.success).toBe(true);
    expect(result.content?.timestamp).toBe("2021-01-01T00:00:00Z");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/wayback/cdx",
      objectContaining({
        params: objectContaining({ to: "2020", sort: "reverse" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/wayback/cdx",
      objectContaining({
        params: objectContaining({ from: "2020" }),
      }),
    );
    const secondOptions = fetchMock.mock.calls[1]?.[1] as { params?: Record<string, string> };
    expect(secondOptions.params).not.toHaveProperty("sort");
  });

  it("uses the timestamp and original URL from an Arquivo.pt snapshot URL", async () => {
    fetchMock.mockResolvedValueOnce(
      JSON.stringify({
        url: "https://example.com/",
        timestamp: "20220203040506",
        status: "200",
      }),
    );
    rawMock.mockResolvedValueOnce(
      rawResponse("body", {
        url: "https://arquivo.pt/noFrame/replay/20220203040506id_/https://example.com/",
      }),
    );

    const result = await createArchive(createArquivo()).content(
      "https://arquivo.pt/wayback/20220203040506/https://example.com/",
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/wayback/cdx",
      objectContaining({
        params: objectContaining({
          url: "example.com/",
          to: "20220203040506",
          sort: "reverse",
        }),
      }),
    );
  });

  it("rejects wildcard content targets without making a request", async () => {
    const result = await createArchive(createArquivo()).content("example.com/*");

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Reading archived content requires one exact URL, not a wildcard pattern",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rawMock).not.toHaveBeenCalled();
  });
});
