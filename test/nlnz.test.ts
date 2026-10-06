import { objectContaining } from "./_matchers";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchData, fetchResponse } from "../src/utils/_fetch";
import { NlnzProvider, createArchive, providers, resetConfig, storage } from "../src";
import createNlnz from "../src/providers/nlnz";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
}));

const fetchMock = vi.mocked(fetchData);
const rawMock = vi.mocked(fetchResponse);

/* Rows as https://ndhadeliver.natlib.govt.nz/webarchive/cdx?url=natlib.govt.nz/*&fl=url,timestamp,status,mime,digest&output=json&from=2015&to=2015 answered on 2026-10-06. */
const NLNZ_JANUARY = `{"url": "http://natlib.govt.nz/", "timestamp": "20150130060051", "status": "200", "mime": "text/html", "digest": "3WBPDQE6B3TY4EPYHHPV4LCTX6ZEAXA6"}`;
const NLNZ_JULY = `{"url": "http://natlib.govt.nz/", "timestamp": "20150730070106", "status": "200", "mime": "text/html", "digest": "5L22GEPQJRCAPRVSTQDFDAF2LRY5TMCL"}`;

/* The start of what the replay answered a script on the same day, with status 200. */
const IMPERVA_CHALLENGE = `<html style="height:100%"><head><META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW"><meta name="format-detection" content="telephone=no">`;

beforeEach(async () => {
  await storage.clear();
  resetConfig();
  vi.resetAllMocks();
});

describe("New Zealand Web Archive", () => {
  it("is available through the public registry and provider=all", async () => {
    const provider = await providers.nlnz();
    const all = await providers.all();

    expect(provider).toBeInstanceOf(NlnzProvider);
    expect(provider.slug).toBe("nlnz");
    expect(all.map((entry) => entry.slug)).toContain("nlnz");
  });

  it("lists a domain as a prefix with normalized metadata and request bounds", async () => {
    fetchMock.mockResolvedValueOnce(`${NLNZ_JANUARY}\n${NLNZ_JULY}\n`);

    const controller = new AbortController();
    const result = await createArchive(createNlnz({ limit: 5 })).snapshots("natlib.govt.nz", {
      from: "2015",
      to: "2015-12-31",
      signal: controller.signal,
    });

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([
      {
        url: "http://natlib.govt.nz/",
        timestamp: "2015-01-30T06:00:51Z",
        snapshot:
          "https://ndhadeliver.natlib.govt.nz/webarchive/20150130060051/http://natlib.govt.nz/",
        _meta: {
          provider: "nlnz",
          timestamp: "20150130060051",
          status: 200,
          mime: "text/html",
          digest: "3WBPDQE6B3TY4EPYHHPV4LCTX6ZEAXA6",
        },
      },
      {
        url: "http://natlib.govt.nz/",
        timestamp: "2015-07-30T07:01:06Z",
        snapshot:
          "https://ndhadeliver.natlib.govt.nz/webarchive/20150730070106/http://natlib.govt.nz/",
        _meta: {
          provider: "nlnz",
          timestamp: "20150730070106",
          status: 200,
          mime: "text/html",
          digest: "5L22GEPQJRCAPRVSTQDFDAF2LRY5TMCL",
        },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/webarchive/cdx",
      objectContaining({
        baseURL: "https://ndhadeliver.natlib.govt.nz",
        responseType: "text",
        signal: controller.signal,
        params: objectContaining({
          url: "natlib.govt.nz/*",
          output: "json",
          fl: "url,timestamp,status,mime,digest",
          limit: "1000",
          from: "2015",
          to: "20151231",
        }),
      }),
    );
  });

  it("drops the fields pywb spells as a dash", async () => {
    fetchMock.mockResolvedValueOnce(
      JSON.stringify({
        url: "http://www.nzherald.co.nz/",
        timestamp: "20230108121217",
        status: "-",
        mime: "warc/revisit",
        digest: "-",
      }),
    );

    const result = await createArchive(createNlnz()).snapshots("http://www.nzherald.co.nz/");

    expect(result.pages?.[0]?._meta).toEqual({
      provider: "nlnz",
      timestamp: "20230108121217",
      mime: "warc/revisit",
    });
  });

  it("returns an empty success for an empty CDX response", async () => {
    fetchMock.mockResolvedValueOnce("");

    const result = await createArchive(createNlnz()).snapshots("missing.example.nz");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("never sends limit=0, which pywb reads as no limit at all", async () => {
    const result = await createArchive(createNlnz({ limit: 0 })).snapshots("natlib.govt.nz");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("separates cached listings created with different provider limits", async () => {
    fetchMock
      .mockResolvedValueOnce(NLNZ_JANUARY)
      .mockResolvedValueOnce(`${NLNZ_JANUARY}\n${NLNZ_JULY}`);

    const narrow = await createArchive(createNlnz({ limit: 1 })).snapshots("natlib.govt.nz");
    const wide = await createArchive(createNlnz({ limit: 2 })).snapshots("natlib.govt.nz");

    expect(narrow.pages).toHaveLength(1);
    expect(wide.pages).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a challenge page in place of the index as a provider error", async () => {
    fetchMock.mockResolvedValueOnce(IMPERVA_CHALLENGE);

    const result = await createArchive(createNlnz()).snapshots("natlib.govt.nz");

    expect(result.success).toBe(false);
    expect(result.error).toBe("New Zealand Web Archive returned a malformed CDX record");
  });

  it("answers a read as unsupported instead of passing the challenge page off as the capture", async () => {
    const result = await createArchive(createNlnz()).content("https://natlib.govt.nz/", {
      timestamp: "2015-07-30",
    });

    expect(result.success).toBe(false);
    expect(result.unsupported).toBe(true);
    expect(result.unsupportedReason).toContain("browser check");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rawMock).not.toHaveBeenCalled();
  });
});
