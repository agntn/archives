import { objectContaining } from "./_matchers";
import { fetchData } from "../src/utils/_fetch";
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createArchive, resetConfig } from "../src";
import createPermacc from "../src/providers/permacc";
import type { PermaccOptions } from "../src/_providers";

vi.mock("../src/utils/_fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/_fetch")>()),
  fetchData: vi.fn(),
  fetchResponse: vi.fn(),
}));

function permaResponse({
  guid = "ABC123",
  url = "https://example.com/",
  creationTimestamp = "2023-01-01T12:00:00Z",
}: Readonly<{
  guid?: string;
  url?: string;
  creationTimestamp?: string | null;
}> = {}) {
  return {
    objects: [
      {
        guid,
        url,
        title: "Example Page",
        creation_timestamp: creationTimestamp,
        status: "success",
        created_by: { id: 1 },
      },
    ],
    meta: {
      limit: 100,
      offset: 0,
      total_count: 1,
      next: "/v1/archives/?limit=100&offset=100",
      previous: null,
    },
  };
}

describe("Perma.cc Platform", () => {
  beforeEach(async () => {
    resetConfig();
    vi.resetAllMocks();
    vi.mocked(fetchData).mockResolvedValue(permaResponse());
  });

  it("requires an API key", async () => {
    const permacc = createPermacc({} as PermaccOptions);
    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("API key is required for Perma.cc");
    expect(fetchData).not.toHaveBeenCalled();
  });

  it("queries the authenticated archive endpoint for an exact URL", async () => {
    const permacc = createPermacc({ apiKey: "test_key" });
    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toEqual({
      url: "https://example.com/",
      timestamp: "2023-01-01T12:00:00.000Z",
      snapshot: "https://perma.cc/ABC123",
      _meta: {
        guid: "ABC123",
        timestamp: "2023-01-01T12:00:00Z",
        title: "Example Page",
        status: "success",
        created_by: "1",
        provider: "permacc",
      },
    });
    expect(result._meta?.meta).toEqual({
      limit: 100,
      offset: 0,
      total_count: 1,
      next: "/v1/archives/?limit=100&offset=100",
      previous: null,
    });
    expect(fetchData).toHaveBeenCalledWith(
      "/v1/archives/",
      objectContaining({
        baseURL: "https://api.perma.cc",
        headers: objectContaining({
          Authorization: "ApiKey test_key",
        }),
        params: {
          limit: 100,
          url: "https://example.com/",
        },
      }),
    );
  });

  it("preserves a target path and query while removing its fragment", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce(
      permaResponse({ url: "http://example.com/Page?version=1" }),
    );
    const permacc = createPermacc({ apiKey: "test_key" });

    await permacc.snapshots("http://Example.com/Page?version=1#section");

    expect(fetchData).toHaveBeenCalledWith(
      "/v1/archives/",
      objectContaining({
        params: objectContaining({
          url: "http://example.com/Page?version=1",
        }),
      }),
    );
  });

  it("normalizes a bare host with a port", async () => {
    const permacc = createPermacc({ apiKey: "test_key" });

    await permacc.snapshots("localhost:8080/page");

    expect(fetchData).toHaveBeenCalledWith(
      "/v1/archives/",
      objectContaining({
        params: objectContaining({
          url: "https://localhost:8080/page",
        }),
      }),
    );
  });

  it("passes the requested result limit to Perma.cc", async () => {
    const permacc = createPermacc({
      apiKey: "test_key",
      limit: 50,
    });

    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(fetchData).toHaveBeenCalledWith(
      "/v1/archives/",
      objectContaining({
        params: objectContaining({ limit: 50 }),
      }),
    );
  });

  it("does not fabricate timestamps for malformed archive records", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce(permaResponse({ creationTimestamp: null }));
    const permacc = createPermacc({ apiKey: "test_key" });

    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("rejects impossible calendar timestamps", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce(
      permaResponse({ creationTimestamp: "2023-02-29T12:00:00Z" }),
    );
    const permacc = createPermacc({ apiKey: "test_key" });

    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("accepts leap-day timestamps in leap years", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce(
      permaResponse({ creationTimestamp: "2024-02-29T12:00:00Z" }),
    );
    const permacc = createPermacc({ apiKey: "test_key" });

    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages[0]?.timestamp).toBe("2024-02-29T12:00:00.000Z");
  });

  it("returns an error response for an invalid API payload", async () => {
    vi.mocked(fetchData).mockResolvedValueOnce({ objects: null });
    const permacc = createPermacc({ apiKey: "test_key" });

    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid Perma.cc API response");
  });

  it("does not expose an API key through request error metadata", async () => {
    const requestError = Object.assign(new Error("Perma.cc request failed"), {
      options: {
        headers: {
          Authorization: "ApiKey test-secret-key",
        },
      },
    });
    vi.mocked(fetchData).mockRejectedValueOnce(requestError);
    const permacc = createPermacc({ apiKey: "test-secret-key" });

    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Perma.cc request failed");
    expect(result._meta?.errorDetails).toBe("Perma.cc request failed");
    expect(result._meta?.errorName).toBe("Error");
    expect(JSON.stringify(result)).not.toContain("test-secret-key");
  });

  it("sends each provider-level limit to the API", async () => {
    vi.mocked(fetchData)
      .mockResolvedValueOnce(permaResponse({ guid: "FIRST" }))
      .mockResolvedValueOnce(permaResponse({ guid: "SECOND" }));
    const firstArchive = createArchive(createPermacc({ apiKey: "test-secret-key", limit: 5 }));
    const secondArchive = createArchive(createPermacc({ apiKey: "test-secret-key", limit: 10 }));

    const first = await firstArchive.snapshots("example.com");
    const second = await secondArchive.snapshots("example.com");

    expect(first.pages[0].snapshot).toBe("https://perma.cc/FIRST");
    expect(second.pages[0].snapshot).toBe("https://perma.cc/SECOND");
    expect(fetchData).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchData).mock.calls[0][1]?.params).toEqual(objectContaining({ limit: 5 }));
    expect(vi.mocked(fetchData).mock.calls[1][1]?.params).toEqual(objectContaining({ limit: 10 }));
  });
});
