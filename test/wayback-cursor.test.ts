import { deflateSync, inflateSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createArchive, resetConfig, type ArchiveResponse } from "../src";
import createWayback from "../src/providers/wayback";
import { fetchData } from "../src/utils/_fetch";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
}));

const HEADER = ["original", "timestamp", "statuscode", "digest", "mimetype", "length", "urlkey"];

/* One CDX row of https://example.com/, told apart from its twins by the digest. */
function row(stamp: string, digest = "A"): string[] {
  return ["https://example.com/", stamp, "200", digest, "text/html", "900", "com,example)/"];
}

/* A JSON answer, with the resume key CDX prints after a blank row when it has more. */
function answer(rows: readonly (readonly string[])[], resumeKey?: string): (readonly string[])[] {
  return resumeKey === undefined ? [HEADER, ...rows] : [HEADER, ...rows, [], [resumeKey]];
}

/* Packs a key with node:zlib, the way CDX prints one. */
function pack(key: string): string {
  return deflateSync(Buffer.from(key)).toString("base64url");
}

/* The query parameters of the nth CDX call. */
function paramsOf(call: number): Record<string, string> {
  const options = vi.mocked(fetchData).mock.calls[call]?.[1] as { params: Record<string, string> };
  return options.params;
}

/* The key the nth call resumes after, unpacked with node:zlib. */
function resumedAfter(call: number): string {
  return inflateSync(Buffer.from(paramsOf(call).resumeKey ?? "", "base64url")).toString("utf8");
}

/* One page of https://example.com/, with the cursor a previous page left in `_meta`. */
function list(options: Readonly<{ limit: number; cursor?: unknown; filter?: string }>) {
  const { cursor, ...rest } = options;
  return createWayback().snapshots("https://example.com/", {
    ...rest,
    ...(typeof cursor === "string" ? { cursor } : {}),
  });
}

/* Stamps and digests of a listing's pages, in order. */
function listed(response: ArchiveResponse): string[] {
  return response.pages.map((page) => `${page._meta.timestamp}/${String(page._meta["digest"])}`);
}

describe("wayback listing continuation", () => {
  beforeEach(() => {
    resetConfig();
    vi.resetAllMocks();
  });

  it("asks for one row past the page and ends when CDX prints no resume key", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce(answer([row("20200101000000")]));

    const result = await list({ limit: 2 });

    expect(paramsOf(0)).toMatchObject({ limit: "3", showResumeKey: "true" });
    expect(paramsOf(0)).not.toHaveProperty("resumeKey");
    expect(result._meta).toMatchObject({ exhausted: true });
    expect(result._meta).not.toHaveProperty("cursor");
  });

  it("resumes one second before the last row and drops the row it already listed", async () => {
    vi.mocked(fetchData)
      .mockResolvedValueOnce(
        answer([row("20200101000000"), row("20210101000000"), row("20220101000000")], "next"),
      )
      .mockResolvedValueOnce(answer([row("20210101000000"), row("20220101000000")]));

    const first = await list({ limit: 2 });
    const second = await list({ limit: 2, cursor: first._meta?.cursor });

    expect(listed(first)).toEqual(["20200101000000/A", "20210101000000/A"]);
    expect(first._meta).toMatchObject({ exhausted: false });
    expect(resumedAfter(1)).toBe("com,example)/ 20210100999999");
    expect(paramsOf(1).limit).toBe("4");
    expect(listed(second)).toEqual(["20220101000000/A"]);
    expect(second._meta).toMatchObject({ exhausted: true });
  });

  it("splits captures that share a stamp across pages without losing or repeating one", async () => {
    const tied = [
      row("20150102021455", "A"),
      row("20150102021455", "B"),
      row("20150102021455", "B"),
    ];
    vi.mocked(fetchData)
      .mockResolvedValueOnce(answer([row("20150102015808"), ...tied.slice(0, 2)], "next"))
      .mockResolvedValueOnce(answer([...tied, row("20150102023429")], "next"))
      .mockResolvedValueOnce(answer([...tied, row("20150102023429")]));

    const first = await list({ limit: 2 });
    const second = await list({ limit: 1, cursor: first._meta?.cursor });
    const third = await list({ limit: 5, cursor: second._meta?.cursor });

    expect(listed(first)).toEqual(["20150102015808/A", "20150102021455/A"]);
    expect(listed(second)).toEqual(["20150102021455/B"]);
    expect(paramsOf(2).limit).toBe("8");
    expect(listed(third)).toEqual(["20150102021455/B", "20150102023429/A"]);
    expect(third._meta).toMatchObject({ exhausted: true });
  });

  it("goes on from the key CDX printed when its scan stopped before a match", async () => {
    vi.mocked(fetchData)
      .mockResolvedValueOnce(answer([], pack("com,example)/ 20190101000000")))
      .mockResolvedValueOnce(answer([row("20200101000000")]));

    const empty = await list({ limit: 2, filter: "statuscode:404" });
    const next = await list({ limit: 2, filter: "statuscode:404", cursor: empty._meta?.cursor });

    expect(empty.pages).toEqual([]);
    expect(empty._meta).toMatchObject({ exhausted: false });
    expect(resumedAfter(1)).toBe("com,example)/ 20190100999999");
    expect(listed(next)).toEqual(["20200101000000/A"]);
  });

  it("refuses a cursor from a listing with another filter", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce(
      answer([row("20200101000000"), row("20210101000000")], "next"),
    );
    const first = await list({ limit: 1 });

    const other = await list({ limit: 1, filter: "statuscode:200", cursor: first._meta?.cursor });

    expect(other.success).toBe(false);
    expect(other.error).toContain("belongs to another listing");
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it("refuses a cursor once a capture it listed is gone", async () => {
    vi.mocked(fetchData)
      .mockResolvedValueOnce(answer([row("20200101000000", "A"), row("20200101000000", "B")], "n"))
      .mockResolvedValueOnce(answer([row("20200101000000", "B"), row("20210101000000")]));
    const first = await list({ limit: 1 });

    const stale = await list({ limit: 1, cursor: first._meta?.cursor });

    expect(stale.success).toBe(false);
    expect(stale.error).toContain("stale");
  });

  it.each(["not a cursor", Buffer.from('{"v":2}').toString("base64url"), "e30"])(
    "refuses the malformed cursor %j before asking CDX",
    async (cursor) => {
      const result = await list({ limit: 1, cursor });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid Wayback cursor");
      expect(fetchData).not.toHaveBeenCalled();
    },
  );

  it("refuses a forged cursor that counts more ties than any page could", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce(
      answer([row("20200101000000"), row("20210101000000")], "next"),
    );
    const first = await list({ limit: 1 });
    const position: unknown = JSON.parse(
      Buffer.from(String(first._meta?.cursor), "base64url").toString(),
    );
    const forged = Buffer.from(JSON.stringify({ ...(position as object), s: 1e9 })).toString(
      "base64url",
    );

    const result = await list({ limit: 1, cursor: forged });

    expect(result.error).toContain("Invalid Wayback cursor");
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it("keeps a cursor short however many distinct captures share one second", async () => {
    const tied = Array.from({ length: 300 }, (_, index) => row("20150102021455", `D${index}`));
    vi.mocked(fetchData)
      .mockResolvedValueOnce(answer([...tied, row("20150102021455", "Z")], "next"))
      .mockResolvedValueOnce(answer([...tied, row("20150102021455", "Z")]));

    const first = await list({ limit: 300 });
    const second = await list({ limit: 300, cursor: first._meta?.cursor });

    expect(String(first._meta?.cursor).length).toBeLessThan(400);
    expect(paramsOf(1).limit).toBe("601");
    expect(listed(second)).toEqual(["20150102021455/Z"]);
  });

  it("refuses a cursor on a listing newest first", async () => {
    const result = await createWayback().snapshots("https://example.com/", {
      order: "newest",
      cursor: "e30",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("oldest first with a positive limit");
    expect(fetchData).not.toHaveBeenCalled();
  });

  it("refuses a cursor on a merged listing before asking any archive", async () => {
    const merged = createArchive([createWayback(), createWayback()]);

    await expect(merged.snapshots("https://example.com/", { cursor: "e30" })).rejects.toThrow(
      "merged listing has none",
    );
    expect(fetchData).not.toHaveBeenCalled();
  });

  it("keeps the page size on a windowed listing, since CDX applies the window", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce(
      answer([row("20190101000000"), row("20190601000000"), row("20191201000000")], "next"),
    );

    const result = await createArchive(createWayback()).snapshots("https://example.com/", {
      from: "2019",
      to: "2019",
      limit: 2,
    });

    expect(paramsOf(0)).toMatchObject({ from: "2019", to: "2019", limit: "3" });
    expect(result.pages).toHaveLength(2);
    expect(typeof result._meta?.cursor).toBe("string");
  });
});
