import { objectContaining } from "./_matchers";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchData, fetchResponse } from "../src/utils/_fetch";
import { rawResponse } from "./_responses";
import { VefsafnProvider, createArchive, providers, resetConfig, storage } from "../src";
import createVefsafn from "../src/providers/vefsafn";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
}));

const fetchMock = vi.mocked(fetchData);
const rawMock = vi.mocked(fetchResponse);

/* Rows as https://vefsafn.is/cdx?url=http://www.ruv.is/&output=json answered on 2026-10-01. */
const RUV_1996 = `{"urlkey": "is,ruv)/", "timestamp": "19961223022706", "url": "http://www.ruv.is:80/", "mime": "text/html", "status": "200", "digest": "6BLGLBKSMICOQJPJRRGUMNRRNHCVZYSH", "redirect": "-", "robotflags": "-", "length": "-", "offset": "4333064", "filename": "ICELAND-HISTORICAL-1995-2004-XAG-000004.arc.gz", "load_url": "", "source": "$root", "source-coll": "$root", "access": "allow"}`;
const RUV_1997 = `{"urlkey": "is,ruv)/", "timestamp": "19970121104734", "url": "http://www.ruv.is:80/", "mime": "text/html", "status": "200", "digest": "64KKWA5CCZCVXQ7R5TZC57P5QDECPFYX", "redirect": "-", "robotflags": "-", "length": "-", "offset": "47644814", "filename": "ICELAND-HISTORICAL-1995-2004-XCM-000018.arc.gz", "load_url": "", "source": "$root", "source-coll": "$root", "access": "allow"}`;
const RUV_2021_REDIRECT = `{"urlkey": "is,ruv)/", "timestamp": "20211231233924", "url": "http://www.ruv.is/", "mime": "application/http", "status": "301", "digest": "3I42H3S6NNFQ2MSVX7XZKYAYSCX5QBYJ", "redirect": "-", "robotflags": "-", "length": "-", "offset": "917890567", "filename": "LBS-20211230101248168-00004-6572~crawler02.landsbokasafn.is~10443.warc.gz", "load_url": "", "source": "$root", "source-coll": "$root", "access": "allow"}`;

function row(timestamp: string, url = "http://www.ruv.is/", status = "200") {
  return JSON.stringify({ urlkey: "is,ruv)/", timestamp, url, mime: "text/html", status });
}

/* The index streams NDJSON. Chunks split rows mid-line, the way a socket does. */
function ndjson(text: string, chunkSize = 37): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

beforeEach(async () => {
  await storage.clear();
  resetConfig();
  vi.resetAllMocks();
});

describe("Vefsafn", () => {
  it("is available through the public registry and provider=all", async () => {
    const provider = await providers.vefsafn();
    const all = await providers.all();

    expect(provider).toBeInstanceOf(VefsafnProvider);
    expect(provider.slug).toBe("vefsafn");
    expect(all.map((entry) => entry.slug)).toContain("vefsafn");
  });

  it("lists captures from the NDJSON index with normalized metadata and request bounds", async () => {
    fetchMock.mockResolvedValueOnce(ndjson(`${RUV_1996}\n${RUV_1997}\n`));

    const controller = new AbortController();
    const result = await createArchive(createVefsafn({ limit: 5 })).snapshots("ruv.is", {
      from: "1996",
      to: "1997-12-31",
      signal: controller.signal,
    });

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([
      {
        url: "http://www.ruv.is:80/",
        timestamp: "1996-12-23T02:27:06Z",
        snapshot: "https://vefsafn.is/19961223022706/http://www.ruv.is:80/",
        _meta: {
          provider: "vefsafn",
          timestamp: "19961223022706",
          status: 200,
          mime: "text/html",
          digest: "6BLGLBKSMICOQJPJRRGUMNRRNHCVZYSH",
        },
      },
      objectContaining({ timestamp: "1997-01-21T10:47:34Z" }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/cdx",
      objectContaining({
        baseURL: "https://vefsafn.is",
        responseType: "stream",
        signal: controller.signal,
        params: {
          url: "http://ruv.is/",
          from: "1996",
          to: "19971231",
          output: "json",
          limit: "1000",
        },
      }),
    );
  });

  it("stops reading at the limit and cancels a stream the index would not end", async () => {
    let served = 0;
    const cancel = vi.fn();
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        served += 1;
        controller.enqueue(new TextEncoder().encode(`${row(String(19970101000000 + served))}\n`));
      },
      cancel,
    });
    fetchMock.mockResolvedValueOnce(endless);

    const result = await createArchive(createVefsafn({ limit: 3 })).snapshots("http://www.ruv.is/");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(3);
    expect(served).toBeLessThan(10);
    expect(cancel).toHaveBeenCalled();
  });

  it("keeps reading past rows it drops until the limit is met", async () => {
    fetchMock.mockResolvedValueOnce(
      ndjson(`${row("not-a-date")}\n\n${RUV_1996}\n${RUV_1997}\n${row("19980101000000")}\n`, 4096),
    );

    const result = await createArchive(createVefsafn({ limit: 2 })).snapshots("ruv.is");

    expect(result.pages.map((page) => page.timestamp)).toEqual([
      "1996-12-23T02:27:06Z",
      "1997-01-21T10:47:34Z",
    ]);
  });

  it("reads a last row that has no trailing newline", async () => {
    fetchMock.mockResolvedValueOnce(ndjson(`${RUV_1996}\n${RUV_1997}`));

    const result = await createArchive(createVefsafn()).snapshots("ruv.is");

    expect(result.pages.map((page) => page.timestamp)).toEqual([
      "1996-12-23T02:27:06Z",
      "1997-01-21T10:47:34Z",
    ]);
  });

  it("returns an empty success for an empty answer and for a 404", async () => {
    fetchMock.mockResolvedValueOnce(ndjson(""));
    const empty = await createArchive(createVefsafn()).snapshots("nonexistent.is");
    expect(empty).toMatchObject({ success: true, pages: [] });

    const { FetchError } =
      await vi.importActual<typeof import("../src/utils/_fetch")>("../src/utils/_fetch");
    fetchMock.mockRejectedValueOnce(
      new FetchError("GET", "https://vefsafn.is/cdx", {
        response: new Response("", { status: 404 }),
        data: "",
      }),
    );
    const missing = await createArchive(createVefsafn()).snapshots("missing.is");
    expect(missing).toMatchObject({ success: true, pages: [] });
  });

  it("reports an HTML page in place of the index as a provider error", async () => {
    fetchMock.mockResolvedValueOnce(ndjson("<!DOCTYPE html><title>Human Verification</title>"));

    const result = await createArchive(createVefsafn()).snapshots("ruv.is");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Vefsafn returned a malformed CDX record");
  });

  it("gives up on a row that never ends instead of buffering it", async () => {
    const cancel = vi.fn();
    const unbroken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(4096)));
      },
      cancel,
    });
    fetchMock.mockResolvedValueOnce(unbroken);

    const result = await createArchive(createVefsafn()).snapshots("ruv.is");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Vefsafn returned a malformed CDX record");
    expect(cancel).toHaveBeenCalled();
  });

  it("separates cached listings created with different provider limits", async () => {
    fetchMock
      .mockResolvedValueOnce(ndjson(`${RUV_1996}\n`))
      .mockResolvedValueOnce(ndjson(`${RUV_1996}\n${RUV_1997}\n`));

    await createArchive(createVefsafn({ limit: 1 })).snapshots("ruv.is");
    const wider = await createArchive(createVefsafn({ limit: 2 })).snapshots("ruv.is");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wider.pages).toHaveLength(2);
  });

  it("rejects a wildcard listing without making a request", async () => {
    const result = await createArchive(createVefsafn()).snapshots("ruv.is/*");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Vefsafn listings require one exact URL, not a wildcard pattern");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the newest 2xx capture at or before the requested time through raw replay", async () => {
    fetchMock.mockResolvedValueOnce(
      ndjson(`${RUV_2021_REDIRECT}\n${row("19970121104734")}\n${row("19961223022706")}\n`),
    );
    rawMock.mockResolvedValueOnce(
      rawResponse("<html><body>RÚV</body></html>", {
        url: "https://vefsafn.is/19970121104734id_/http://www.ruv.is/",
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const controller = new AbortController();
    const result = await createArchive(createVefsafn()).content("http://www.ruv.is/", {
      timestamp: "2022-01-01",
      maxBytes: 4096,
      signal: controller.signal,
    });

    expect(result.success).toBe(true);
    expect(result.content).toMatchObject({
      url: "http://www.ruv.is/",
      timestamp: "1997-01-21T10:47:34Z",
      snapshot: "https://vefsafn.is/19970121104734/http://www.ruv.is/",
      content: "<html><body>RÚV</body></html>",
      truncated: false,
      _meta: {
        provider: "vefsafn",
        timestamp: "19970121104734",
        status: 200,
        mime: "text/html",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/cdx",
      objectContaining({
        params: {
          url: "http://www.ruv.is/",
          reverse: "true",
          to: "20220101",
          output: "json",
          limit: "200",
        },
      }),
    );
    expect(rawMock).toHaveBeenCalledWith(
      "/19970121104734id_/http://www.ruv.is/",
      objectContaining({ baseURL: "https://vefsafn.is", signal: controller.signal }),
    );
  });

  it("queries forward only when no capture exists at or before the requested time", async () => {
    fetchMock
      .mockResolvedValueOnce(ndjson(""))
      .mockResolvedValueOnce(ndjson(`${row("20210101000000")}\n`));
    rawMock.mockResolvedValueOnce(
      rawResponse("later", {
        url: "https://vefsafn.is/20210101000000id_/http://www.ruv.is/",
      }),
    );

    const result = await createArchive(createVefsafn()).content("http://www.ruv.is/", {
      timestamp: "2020",
    });

    expect(result.success).toBe(true);
    expect(result.content?.timestamp).toBe("2021-01-01T00:00:00Z");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/cdx",
      objectContaining({ params: objectContaining({ to: "2020", reverse: "true" }) }),
    );
    const secondOptions = fetchMock.mock.calls[1]?.[1] as { params?: Record<string, string> };
    expect(secondOptions.params).toMatchObject({ from: "2020" });
    expect(secondOptions.params).not.toHaveProperty("reverse");
  });

  it("returns a recorded redirect without following it", async () => {
    fetchMock.mockResolvedValueOnce(ndjson(`${RUV_2021_REDIRECT}\n`));
    rawMock.mockResolvedValueOnce(
      rawResponse("", {
        status: 301,
        url: "https://vefsafn.is/20211231233924id_/http://www.ruv.is/",
        headers: { location: "http://127.0.0.1/private" },
      }),
    );

    const result = await createArchive(createVefsafn()).content("http://www.ruv.is/", {
      timestamp: "20211231233924",
    });

    expect(result.success).toBe(true);
    expect(result.content?._meta.status).toBe(301);
    expect(rawMock).toHaveBeenCalledTimes(1);
  });

  it("uses the timestamp and original URL from a Vefsafn snapshot URL", async () => {
    fetchMock.mockResolvedValueOnce(ndjson(`${RUV_1996}\n`));
    rawMock.mockResolvedValueOnce(
      rawResponse("body", { url: "https://vefsafn.is/19961223022706id_/http://www.ruv.is:80/" }),
    );

    const result = await createArchive(createVefsafn()).content(
      "https://vefsafn.is/19961223022706/http://www.ruv.is:80/",
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/cdx",
      objectContaining({
        params: objectContaining({
          url: "http://www.ruv.is/",
          to: "19961223022706",
          reverse: "true",
        }),
      }),
    );
  });

  it("rejects wildcard content targets without making a request", async () => {
    const result = await createArchive(createVefsafn()).content("ruv.is/*");

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Reading archived content requires one exact URL, not a wildcard pattern",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rawMock).not.toHaveBeenCalled();
  });
});
