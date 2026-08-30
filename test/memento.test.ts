import { anyValue, objectContaining } from "./_matchers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { $fetch, type FetchResponse } from "ofetch";
import {
  createArchive,
  MementoProvider,
  providers,
  resetConfig,
  storage,
  type ArchiveContentResponse,
} from "../src";
import createMemento from "../src/providers/memento";

vi.mock("ofetch", () => {
  const raw = vi.fn();
  return { $fetch: Object.assign(vi.fn(), { raw }) };
});

const fetchMock = vi.mocked($fetch);
/* oxlint-disable-next-line typescript/unbound-method -- ofetch.raw is a standalone callable and the mock has no receiver state. */
const rawMock = fetchMock.raw;

/* Builds only the response fields consumed by the provider's body reader. */
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

function expectProxiedCapture(response: ArchiveContentResponse): void {
  expect(response.success).toBe(true);
  expect(response.content?.content).toBe("proxied capture");
  expect(response.content?.timestamp).toBe("2020-04-02T20:09:40Z");
  expect(response.content?.snapshot).toContain("memgator.cs.odu.edu/memento/proxy/");
  expect(response.content?._meta).not.toHaveProperty("archive");
  expect(response.content?._meta).not.toHaveProperty("datetime");
  expect(response.content?._meta.proxyFallback).toBe(true);
}

beforeEach(async () => {
  await storage.clear();
  resetConfig();
  vi.resetAllMocks();
});

describe("Memento aggregator", () => {
  it("is available through the public lazy provider registry", async () => {
    const provider = await providers.memento();

    expect(provider).toBeInstanceOf(MementoProvider);
    expect(provider.slug).toBe("memento");
  });

  it("normalizes a JSON TimeMap and drops malformed or duplicate mementos", async () => {
    fetchMock.mockResolvedValueOnce({
      original_uri: "https://example.com/",
      mementos: {
        list: [
          {
            datetime: "2019-03-01T12:00:00Z",
            uri: "https://web.archive.org/web/20190301120000/https://example.com/",
          },
          {
            datetime: "2020-04-02T13:30:00Z",
            uri: "https://arquivo.pt/wayback/20200402133000/https://example.com/",
          },
          {
            datetime: "2020-04-02T13:30:00Z",
            uri: "https://arquivo.pt/wayback/20200402133000/https://example.com/",
          },
          { datetime: "not-a-date", uri: "https://archive.example/invalid-date" },
          { datetime: "2021-01-01T00:00:00Z", uri: "javascript:alert(1)" },
          {
            datetime: "2021-02-01T00:00:00Z",
            uri: "http://169.254.169.254/latest/meta-data/",
          },
          {
            datetime: "2099-01-01T00:00:00Z",
            uri: "https://archive.example/20990101000000/https://example.com/",
          },
        ],
      },
    });

    const controller = new AbortController();
    const response = await createArchive(createMemento()).snapshots("https://example.com/", {
      signal: controller.signal,
      cache: false,
    });

    expect(response.success).toBe(true);
    expect(response.pages).toEqual([
      {
        url: "https://example.com/",
        timestamp: "2019-03-01T12:00:00Z",
        snapshot: "https://web.archive.org/web/20190301120000/https://example.com/",
        _meta: {
          provider: "memento",
          archive: "web.archive.org",
          datetime: "2019-03-01T12:00:00Z",
        },
      },
      {
        url: "https://example.com/",
        timestamp: "2020-04-02T13:30:00Z",
        snapshot: "https://arquivo.pt/wayback/20200402133000/https://example.com/",
        _meta: {
          provider: "memento",
          archive: "arquivo.pt",
          datetime: "2020-04-02T13:30:00Z",
        },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/timemap/json/https%3A%2F%2Fexample.com%2F",
      objectContaining({
        baseURL: "https://memgator.cs.odu.edu",
        signal: controller.signal,
        retry: 1,
        timeout: 10000,
      }),
    );
  });

  it("uses the exact original URL reported by the TimeMap and applies the limit", async () => {
    fetchMock.mockResolvedValueOnce({
      original_uri: "http://www.example.com/",
      mementos: {
        list: [
          { datetime: "2018-01-01T00:00:00Z", uri: "https://archive.example/2018" },
          { datetime: "2019-01-01T00:00:00Z", uri: "https://archive.example/2019" },
        ],
      },
    });

    const response = await createArchive(createMemento()).snapshots("example.com", {
      limit: 1,
      cache: false,
    });

    expect(response.pages).toHaveLength(1);
    expect(response.pages[0]?.url).toBe("http://www.example.com/");
    expect(fetchMock).toHaveBeenCalledWith(
      "/timemap/json/http%3A%2F%2Fexample.com",
      anyValue(Object),
    );
  });

  it("keeps constructor limits in separate cache partitions", async () => {
    fetchMock
      .mockResolvedValueOnce({
        original_uri: "https://example.com/",
        mementos: {
          list: [
            { datetime: "2018-01-01T00:00:00Z", uri: "https://archive.example/2018" },
            { datetime: "2019-01-01T00:00:00Z", uri: "https://archive.example/2019" },
          ],
        },
      })
      .mockResolvedValueOnce({
        original_uri: "https://example.com/",
        mementos: {
          list: [
            { datetime: "2018-01-01T00:00:00Z", uri: "https://archive.example/2018" },
            { datetime: "2019-01-01T00:00:00Z", uri: "https://archive.example/2019" },
          ],
        },
      });

    const limited = await createArchive(createMemento({ limit: 1 })).snapshots(
      "https://example.com/",
    );
    const complete = await createArchive(createMemento()).snapshots("https://example.com/");

    expect(limited.pages).toHaveLength(1);
    expect(complete.pages).toHaveLength(2);
    expect(complete.fromCache).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns an empty success when MemGator reports no mementos as 404", async () => {
    fetchMock.mockRejectedValueOnce({ status: 404, data: "404 page not found" });

    const response = await createArchive(createMemento()).snapshots("never-captured.example", {
      cache: false,
    });

    expect(response.success).toBe(true);
    expect(response.pages).toEqual([]);
  });

  it("normalizes an invalid custom aggregator URL as a provider error", async () => {
    const response = await createArchive(createMemento({ baseUrl: "memgator.example" })).snapshots(
      "example.com",
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain("Invalid Memento aggregator base URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a private custom aggregator before making a request", async () => {
    const response = await createArchive(
      createMemento({ baseUrl: "https://169.254.169.254/latest/meta-data" }),
    ).snapshots("example.com");

    expect(response.success).toBe(false);
    expect(response.error).toContain("public host");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not copy target credentials into an error response", async () => {
    const response = await createArchive(createMemento()).snapshots(
      "https://user:secret@example.com/",
      { cache: false },
    );

    expect(response.success).toBe(false);
    expect(JSON.stringify(response)).not.toContain("secret");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a provider error for a malformed JSON TimeMap", async () => {
    fetchMock.mockResolvedValueOnce({ original_uri: "https://example.com/" });

    const response = await createArchive(createMemento()).snapshots("example.com", {
      cache: false,
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("valid mementos.list");
    expect(response._meta?.provider).toBe("memento");
  });

  it("falls back to MemGator's proxy when the TimeMap Memento cannot be read directly", async () => {
    fetchMock.mockResolvedValueOnce({
      original_uri: "https://example.com/",
      mementos: {
        list: [
          {
            datetime: "2020-04-02T19:54:11Z",
            uri: "https://vefsafn.is/20200402195411mp_/https://www.example.com/",
          },
        ],
      },
    });
    rawMock
      .mockResolvedValueOnce(
        rawResponse("archive wrapper", {
          url: "https://vefsafn.is/20200402195411id_/https://www.example.com/",
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      )
      .mockResolvedValueOnce(
        rawResponse("proxied capture", {
          url: "https://memgator.cs.odu.edu/memento/proxy/20200402195411/https%3A%2F%2Fexample.com%2F",
          headers: {
            "content-type": "text/html; charset=utf-8",
            "memento-datetime": "Thu, 02 Apr 2020 20:09:40 GMT",
          },
        }),
      );

    const response = await createArchive(createMemento()).content("https://example.com/", {
      timestamp: "20200402195411",
      cache: false,
    });

    expectProxiedCapture(response);
    expect(rawMock.mock.calls[0]?.[0]).toBe("/20200402195411id_/https://www.example.com/");
    expect(rawMock.mock.calls[0]?.[1]).toMatchObject({ baseURL: "https://vefsafn.is" });
    expect(rawMock.mock.calls[1]?.[0]).toBe(
      "/memento/proxy/20200402195411/https%3A%2F%2Fexample.com%2F",
    );
  });

  it("refuses a direct playback redirect to a private host", async () => {
    fetchMock.mockResolvedValueOnce({
      original_uri: "https://example.com/",
      mementos: {
        list: [
          {
            datetime: "2020-04-02T13:30:00Z",
            uri: "https://archive.example/wayback/20200402133000/https://example.com/",
          },
        ],
      },
    });
    rawMock
      .mockImplementationOnce((_request, options) =>
        Promise.resolve(
          options?.redirect === "manual"
            ? rawResponse("", {
                url: "https://archive.example/wayback/20200402133000id_/https://example.com/",
                status: 302,
                headers: { location: "http://169.254.169.254/latest/meta-data/" },
              })
            : rawResponse("instance credentials", {
                url: "http://169.254.169.254/latest/meta-data/",
                headers: { "memento-datetime": "Thu, 02 Apr 2020 13:30:00 GMT" },
              }),
        ),
      )
      .mockResolvedValueOnce(
        rawResponse("proxied capture", {
          url: "https://memgator.cs.odu.edu/memento/proxy/20200402133000/https%3A%2F%2Fexample.com%2F",
          headers: { "memento-datetime": "Thu, 02 Apr 2020 13:30:00 GMT" },
        }),
      );

    const response = await createArchive(createMemento()).content("https://example.com/", {
      cache: false,
    });

    expect(response.success).toBe(true);
    expect(response.content?.content).toBe("proxied capture");
    expect(response.content?._meta.proxyFallback).toBe(true);
    expect(rawMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(rawMock.mock.calls[1]?.[0]).toContain("/memento/proxy/");
  });

  it("follows a direct playback redirect when every host stays public", async () => {
    fetchMock.mockResolvedValueOnce({
      original_uri: "https://example.com/",
      mementos: {
        list: [
          {
            datetime: "2020-04-02T13:30:00Z",
            uri: "https://archive.example/wayback/20200402133000/https://example.com/",
          },
        ],
      },
    });
    rawMock
      .mockResolvedValueOnce(
        rawResponse("", {
          url: "https://archive.example/wayback/20200402133000id_/https://example.com/",
          status: 302,
          headers: { location: "https://cdn.archive.example/capture" },
        }),
      )
      .mockResolvedValueOnce(
        rawResponse("redirected capture", {
          url: "https://cdn.archive.example/capture",
          headers: { "memento-datetime": "Thu, 02 Apr 2020 13:30:00 GMT" },
        }),
      );

    const response = await createArchive(createMemento()).content("https://example.com/", {
      cache: false,
    });

    expect(response.success).toBe(true);
    expect(response.content?.content).toBe("redirected capture");
    expect(response.content?._meta.proxyFallback).toBeUndefined();
    expect(rawMock.mock.calls[1]?.[0]).toBe("/capture");
    expect(rawMock.mock.calls[1]?.[1]).toMatchObject({
      baseURL: "https://cdn.archive.example",
      redirect: "manual",
    });
  });

  it("reads a snapshot URL returned by the Memento listing", async () => {
    fetchMock.mockResolvedValueOnce({
      original_uri: "https://example.com/",
      mementos: {
        list: [
          {
            datetime: "2020-04-02T13:30:00Z",
            uri: "https://arquivo.pt/wayback/20200402133000/https://example.com/",
          },
        ],
      },
    });
    rawMock.mockResolvedValueOnce(
      rawResponse("capture", {
        url: "https://arquivo.pt/wayback/20200402133000id_/https://example.com/",
        headers: { "memento-datetime": "Thu, 02 Apr 2020 13:30:00 GMT" },
      }),
    );

    const response = await createArchive(createMemento()).content(
      "https://arquivo.pt/wayback/20200402133000/https://example.com/",
      { cache: false },
    );

    expect(response.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/timemap/json/https%3A%2F%2Fexample.com%2F",
      anyValue(Object),
    );
    expect(rawMock.mock.calls[0]?.[0]).toBe("/wayback/20200402133000id_/https://example.com/");
  });

  it("reads the exact selected Memento through its raw replay endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      original_uri: "https://example.com/",
      mementos: {
        list: [
          {
            datetime: "2019-03-01T12:00:00Z",
            uri: "https://web.archive.org/web/20190301120000/https://example.com/",
          },
          {
            datetime: "2020-04-02T13:30:00Z",
            uri: "https://arquivo.pt/wayback/20200402133000/https://example.com/",
          },
        ],
      },
    });
    rawMock.mockResolvedValueOnce(
      rawResponse("<html><body>archived</body></html>", {
        url: "https://arquivo.pt/wayback/20200402133000id_/https://example.com/",
        headers: {
          "content-type": "text/html; charset=utf-8",
          "memento-datetime": "Thu, 02 Apr 2020 13:30:00 GMT",
        },
      }),
    );

    const response = await createArchive(createMemento()).content("https://example.com/", {
      cache: false,
    });

    expect(response.success).toBe(true);
    expect(response.content).toMatchObject({
      url: "https://example.com/",
      timestamp: "2020-04-02T13:30:00Z",
      snapshot: "https://arquivo.pt/wayback/20200402133000/https://example.com/",
      content: "<html><body>archived</body></html>",
      mime: "text/html",
      truncated: false,
      _meta: {
        provider: "memento",
        archive: "arquivo.pt",
        rawSnapshot: "https://arquivo.pt/wayback/20200402133000id_/https://example.com/",
      },
    });
    expect(rawMock.mock.calls[0]?.[0]).toBe("/wayback/20200402133000id_/https://example.com/");
    expect(rawMock.mock.calls[0]?.[1]).toMatchObject({ baseURL: "https://arquivo.pt" });
  });
});
