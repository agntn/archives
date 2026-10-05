import { objectContaining } from "./_matchers";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchData, fetchResponse } from "../src/utils/_fetch";
import { rawResponse } from "./_responses";
import { OszkProvider, createArchive, providers, resetConfig, storage } from "../src";
import createOszk from "../src/providers/oszk";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
}));

const fetchMock = vi.mocked(fetchData);
const rawMock = vi.mocked(fetchResponse);

/* Rows as https://webadmin.oszk.hu/pywb/cdx?url=oszk.hu/*&fl=url,timestamp,status,mime,digest,length&output=json answered on 2026-10-06. */
const OSZK_REDIRECT = `{"url": "http://oszk.hu/", "timestamp": "20190208102327", "status": "301", "mime": "text/html", "digest": "DL5NT6VGWN4UMNGVYNKQK7HCELSROMS2", "length": "520"}`;
const OSZK_FEBRUARY = `{"url": "http://www.oszk.hu/", "timestamp": "20190208102332", "status": "200", "mime": "text/html", "digest": "IVREAH65R3YCAL6DKXNB4V3RBABP4FYT", "length": "13657"}`;

/* Rows as the same index answered with matchType=exact&sort=reverse&to=20200101. */
const OSZK_OCTOBER = `{"url": "http://www.oszk.hu/", "timestamp": "20191022145707", "status": "200", "mime": "text/html", "digest": "BBEC6NCMPYX7TKM6Z37K7NPBDS3PBNNA", "length": "13163"}`;
const OSZK_REVISIT = `{"url": "http://www.oszk.hu/", "timestamp": "20190218140048", "status": "0", "mime": "warc/revisit", "digest": "BA54CFE46A76DBCAE726BD32CFB7E54C", "length": "646"}`;

beforeEach(async () => {
  await storage.clear();
  resetConfig();
  vi.resetAllMocks();
});

describe("OSZK Webarchívum", () => {
  it("is available through the public registry and provider=all", async () => {
    const provider = await providers.oszk();
    const all = await providers.all();

    expect(provider).toBeInstanceOf(OszkProvider);
    expect(provider.slug).toBe("oszk");
    expect(all.map((entry) => entry.slug)).toContain("oszk");
  });

  it("lists a domain as a prefix with normalized metadata and request bounds", async () => {
    fetchMock.mockResolvedValueOnce(`${OSZK_REDIRECT}\n${OSZK_FEBRUARY}\n`);

    const controller = new AbortController();
    const result = await createArchive(createOszk({ limit: 5 })).snapshots("oszk.hu", {
      from: "2019",
      to: "2019-12-31",
      signal: controller.signal,
    });

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([
      {
        url: "http://oszk.hu/",
        timestamp: "2019-02-08T10:23:27Z",
        snapshot: "https://webadmin.oszk.hu/pywb/20190208102327/http://oszk.hu/",
        _meta: {
          provider: "oszk",
          timestamp: "20190208102327",
          status: 301,
          mime: "text/html",
          digest: "DL5NT6VGWN4UMNGVYNKQK7HCELSROMS2",
          length: "520",
        },
      },
      {
        url: "http://www.oszk.hu/",
        timestamp: "2019-02-08T10:23:32Z",
        snapshot: "https://webadmin.oszk.hu/pywb/20190208102332/http://www.oszk.hu/",
        _meta: {
          provider: "oszk",
          timestamp: "20190208102332",
          status: 200,
          mime: "text/html",
          digest: "IVREAH65R3YCAL6DKXNB4V3RBABP4FYT",
          length: "13657",
        },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/pywb/cdx",
      objectContaining({
        baseURL: "https://webadmin.oszk.hu",
        responseType: "text",
        signal: controller.signal,
        params: objectContaining({
          url: "oszk.hu/*",
          output: "json",
          fl: "url,timestamp,status,mime,digest,length",
          limit: "1000",
          from: "2019",
          to: "20191231",
        }),
      }),
    );
  });

  it("drops the fields pywb spells as a dash", async () => {
    fetchMock.mockResolvedValueOnce(
      JSON.stringify({
        url: "http://www.oszk.hu/",
        timestamp: "20190218140048",
        status: "-",
        mime: "warc/revisit",
        digest: "-",
        length: "-",
      }),
    );

    const result = await createArchive(createOszk()).snapshots("http://www.oszk.hu/");

    expect(result.pages?.[0]?._meta).toEqual({
      provider: "oszk",
      timestamp: "20190218140048",
      mime: "warc/revisit",
    });
  });

  it("returns an empty success for an empty CDX response", async () => {
    fetchMock.mockResolvedValueOnce("");

    const result = await createArchive(createOszk()).snapshots("missing.example.hu");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("never sends limit=0, which pywb reads as no limit at all", async () => {
    const result = await createArchive(createOszk({ limit: 0 })).snapshots("oszk.hu");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("separates cached listings created with different provider limits", async () => {
    fetchMock
      .mockResolvedValueOnce(OSZK_REDIRECT)
      .mockResolvedValueOnce(`${OSZK_REDIRECT}\n${OSZK_FEBRUARY}`);

    const narrow = await createArchive(createOszk({ limit: 1 })).snapshots("oszk.hu");
    const wide = await createArchive(createOszk({ limit: 2 })).snapshots("oszk.hu");

    expect(narrow.pages).toHaveLength(1);
    expect(wide.pages).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports an HTML page in place of the index as a provider error", async () => {
    fetchMock.mockResolvedValueOnce("<!DOCTYPE html><title>pywb</title>");

    const result = await createArchive(createOszk()).snapshots("oszk.hu");

    expect(result.success).toBe(false);
    expect(result.error).toBe("OSZK Webarchívum returned a malformed CDX record");
  });

  it("reads the newest 2xx capture at or before the requested time through raw replay", async () => {
    fetchMock.mockResolvedValueOnce(`${OSZK_OCTOBER}\n${OSZK_REVISIT}`);
    rawMock.mockResolvedValueOnce(
      rawResponse("<html><body>Országos Széchényi Könyvtár</body></html>", {
        url: "https://webadmin.oszk.hu/pywb/20191022145707id_/http://www.oszk.hu/",
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const controller = new AbortController();
    const result = await createArchive(createOszk()).content("https://oszk.hu/", {
      timestamp: "2020-01-01",
      maxBytes: 4096,
      signal: controller.signal,
    });

    expect(result.success).toBe(true);
    expect(result.content).toMatchObject({
      url: "http://www.oszk.hu/",
      timestamp: "2019-10-22T14:57:07Z",
      snapshot: "https://webadmin.oszk.hu/pywb/20191022145707/http://www.oszk.hu/",
      content: "<html><body>Országos Széchényi Könyvtár</body></html>",
      mime: "text/html",
      truncated: false,
      _meta: {
        provider: "oszk",
        timestamp: "20191022145707",
        status: 200,
        digest: "BBEC6NCMPYX7TKM6Z37K7NPBDS3PBNNA",
        length: "13163",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/pywb/cdx",
      objectContaining({
        params: objectContaining({
          url: "oszk.hu/",
          matchType: "exact",
          to: "20200101",
          sort: "reverse",
          limit: "200",
        }),
      }),
    );
    expect(rawMock).toHaveBeenCalledWith(
      "/pywb/20191022145707id_/http://www.oszk.hu/",
      objectContaining({ baseURL: "https://webadmin.oszk.hu", signal: controller.signal }),
    );
  });

  it("reports the capture pywb serves in place of a redirect to its own URL key", async () => {
    fetchMock.mockResolvedValueOnce(`${OSZK_REDIRECT}\n${OSZK_FEBRUARY}`);
    /* Headers as https://webadmin.oszk.hu/pywb/20190208102327id_/http://oszk.hu/ answered on 2026-10-06. */
    rawMock.mockResolvedValueOnce(
      rawResponse("<html>www</html>", {
        url: "https://webadmin.oszk.hu/pywb/20190208102327id_/http://oszk.hu/",
        headers: {
          "content-type": "text/html; charset=utf-8",
          "memento-datetime": "Fri, 08 Feb 2019 10:23:32 GMT",
        },
      }),
    );

    const result = await createArchive(createOszk()).content("http://oszk.hu/", {
      timestamp: "20190208102327",
    });

    expect(result.success).toBe(true);
    expect(result.content?.timestamp).toBe("2019-02-08T10:23:32Z");
    expect(result.content?.snapshot).toBe(
      "https://webadmin.oszk.hu/pywb/20190208102332/http://oszk.hu/",
    );
    expect(result.content?._meta).toMatchObject({ timestamp: "20190208102332", status: 200 });
    expect(result.content?._meta).not.toHaveProperty("digest");
  });

  it("queries forward only when no capture exists at or before the requested time", async () => {
    fetchMock.mockResolvedValueOnce("").mockResolvedValueOnce(OSZK_FEBRUARY);
    rawMock.mockResolvedValueOnce(
      rawResponse("later", {
        url: "https://webadmin.oszk.hu/pywb/20190208102332id_/http://www.oszk.hu/",
      }),
    );

    const result = await createArchive(createOszk()).content("http://www.oszk.hu/", {
      timestamp: "2018",
    });

    expect(result.success).toBe(true);
    expect(result.content?.timestamp).toBe("2019-02-08T10:23:32Z");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/pywb/cdx",
      objectContaining({ params: objectContaining({ to: "2018", sort: "reverse" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/pywb/cdx",
      objectContaining({ params: objectContaining({ from: "2018" }) }),
    );
    const secondOptions = fetchMock.mock.calls[1]?.[1] as { params?: Record<string, string> };
    expect(secondOptions.params).not.toHaveProperty("sort");
  });

  it("uses the timestamp and original URL from an OSZK snapshot URL", async () => {
    fetchMock.mockResolvedValueOnce(OSZK_FEBRUARY);
    rawMock.mockResolvedValueOnce(
      rawResponse("body", {
        url: "https://webadmin.oszk.hu/pywb/20190208102332id_/http://www.oszk.hu/",
      }),
    );

    const result = await createArchive(createOszk()).content(
      "https://webadmin.oszk.hu/pywb/20190208102332/http://www.oszk.hu/",
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/pywb/cdx",
      objectContaining({
        params: objectContaining({
          url: "www.oszk.hu/",
          to: "20190208102332",
          sort: "reverse",
        }),
      }),
    );
  });

  it("rejects wildcard content targets without making a request", async () => {
    const result = await createArchive(createOszk()).content("oszk.hu/*");

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Reading archived content requires one exact URL, not a wildcard pattern",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rawMock).not.toHaveBeenCalled();
  });
});
