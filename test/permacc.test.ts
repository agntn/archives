import { $fetch } from "ofetch";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createArchive, resetConfig, storage } from "../src";
import createPermacc from "../src/providers/permacc";
import type { PermaccOptions } from "../src/_providers";

vi.mock("ofetch", () => ({
  $fetch: vi.fn(),
}));

function permaResponse({
  guid = "ABC123",
  url = "https://example.com/",
  creationTimestamp = "2023-01-01T12:00:00Z",
}: {
  guid?: string;
  url?: string;
  creationTimestamp?: string | null;
} = {}) {
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
    await storage.clear();
    resetConfig();
    vi.resetAllMocks();
    vi.mocked($fetch).mockResolvedValue(permaResponse());
  });

  it("requires an API key", async () => {
    const permacc = createPermacc({} as PermaccOptions);
    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("API key is required for Perma.cc");
    expect($fetch).not.toHaveBeenCalled();
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
        title: "Example Page",
        status: "success",
        created_by: "1",
      },
    });
    expect(result._meta?.meta).toEqual({
      limit: 100,
      offset: 0,
      total_count: 1,
      next: "/v1/archives/?limit=100&offset=100",
      previous: null,
    });
    expect($fetch).toHaveBeenCalledWith(
      "/v1/archives/",
      expect.objectContaining({
        baseURL: "https://api.perma.cc",
        headers: {
          Authorization: "ApiKey test_key",
        },
        params: {
          limit: 100,
          url: "https://example.com/",
        },
      }),
    );
  });

  it("preserves a target path and query while removing its fragment", async () => {
    vi.mocked($fetch).mockResolvedValueOnce(
      permaResponse({ url: "http://example.com/Page?version=1" }),
    );
    const permacc = createPermacc({ apiKey: "test_key" });

    await permacc.snapshots("http://Example.com/Page?version=1#section");

    expect($fetch).toHaveBeenCalledWith(
      "/v1/archives/",
      expect.objectContaining({
        params: expect.objectContaining({
          url: "http://example.com/Page?version=1",
        }),
      }),
    );
  });

  it("normalizes a bare host with a port", async () => {
    const permacc = createPermacc({ apiKey: "test_key" });

    await permacc.snapshots("localhost:8080/page");

    expect($fetch).toHaveBeenCalledWith(
      "/v1/archives/",
      expect.objectContaining({
        params: expect.objectContaining({
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
    expect($fetch).toHaveBeenCalledWith(
      "/v1/archives/",
      expect.objectContaining({
        params: expect.objectContaining({ limit: 50 }),
      }),
    );
  });

  it("does not fabricate timestamps for malformed archive records", async () => {
    vi.mocked($fetch).mockResolvedValueOnce(permaResponse({ creationTimestamp: null }));
    const permacc = createPermacc({ apiKey: "test_key" });

    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
  });

  it("returns an error response for an invalid API payload", async () => {
    vi.mocked($fetch).mockResolvedValueOnce({ objects: null });
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
    vi.mocked($fetch).mockRejectedValueOnce(requestError);
    const permacc = createPermacc({ apiKey: "test-secret-key" });

    const result = await permacc.snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Perma.cc request failed");
    expect(result._meta?.errorDetails).toBe("Perma.cc request failed");
    expect(result._meta?.errorName).toBe("Error");
    expect(JSON.stringify(result)).not.toContain("test-secret-key");
  });

  it("separates cached responses by API key without storing raw keys", async () => {
    vi.mocked($fetch)
      .mockResolvedValueOnce(permaResponse({ guid: "FIRST" }))
      .mockResolvedValueOnce(permaResponse({ guid: "SECOND" }));
    const permacc = createPermacc({ apiKey: "first-secret-key" });
    const archive = createArchive(permacc);

    const first = await archive.snapshots("example.com");
    const second = await archive.snapshots("example.com", { apiKey: "second-secret-key" });
    const cachedFirst = await archive.snapshots("example.com");

    expect(first.pages[0].snapshot).toBe("https://perma.cc/FIRST");
    expect(second.pages[0].snapshot).toBe("https://perma.cc/SECOND");
    expect(cachedFirst.pages[0].snapshot).toBe("https://perma.cc/FIRST");
    expect(cachedFirst.fromCache).toBe(true);
    expect($fetch).toHaveBeenCalledTimes(2);

    const cacheKeys = (await storage.getKeys()).join("\n");
    expect(cacheKeys).not.toContain("first-secret-key");
    expect(cacheKeys).not.toContain("second-secret-key");
  });

  it("isolates cache entries between provider instances", async () => {
    vi.mocked($fetch)
      .mockResolvedValueOnce(permaResponse({ guid: "FIRST" }))
      .mockResolvedValueOnce(permaResponse({ guid: "SECOND" }));
    const firstArchive = createArchive(createPermacc({ apiKey: "first-secret-key" }));
    const secondArchive = createArchive(createPermacc({ apiKey: "second-secret-key" }));

    const first = await firstArchive.snapshots("example.com");
    const second = await secondArchive.snapshots("example.com");
    const cachedFirst = await firstArchive.snapshots("example.com");

    expect(first.pages[0].snapshot).toBe("https://perma.cc/FIRST");
    expect(second.pages[0].snapshot).toBe("https://perma.cc/SECOND");
    expect(cachedFirst.pages[0].snapshot).toBe("https://perma.cc/FIRST");
    expect(cachedFirst.fromCache).toBe(true);
    expect($fetch).toHaveBeenCalledTimes(2);
  });

  it("separates cached responses by provider-level limits", async () => {
    vi.mocked($fetch)
      .mockResolvedValueOnce(permaResponse({ guid: "FIRST" }))
      .mockResolvedValueOnce(permaResponse({ guid: "SECOND" }));
    const firstArchive = createArchive(createPermacc({ apiKey: "test-secret-key", limit: 5 }));
    const secondArchive = createArchive(createPermacc({ apiKey: "test-secret-key", limit: 10 }));

    const first = await firstArchive.snapshots("example.com");
    const second = await secondArchive.snapshots("example.com");

    expect(first.pages[0].snapshot).toBe("https://perma.cc/FIRST");
    expect(second.pages[0].snapshot).toBe("https://perma.cc/SECOND");
    expect($fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked($fetch).mock.calls[0][1]?.params).toEqual(
      expect.objectContaining({ limit: 5 }),
    );
    expect(vi.mocked($fetch).mock.calls[1][1]?.params).toEqual(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it("does not let URL text collide with an account cache partition", async () => {
    const configuredProvider = createPermacc({ apiKey: "test-secret-key" });
    const partition = configuredProvider.cacheKey();
    if (!partition) throw new Error("Expected a Perma.cc cache partition");

    const target = "https://example.com/private";
    const configured = await createArchive(configuredProvider).snapshots(target);
    const unauthenticated = await createArchive(createPermacc()).snapshots(
      `${target}:${partition}`,
    );

    expect(configured.success).toBe(true);
    expect(unauthenticated.success).toBe(false);
    expect(unauthenticated.error).toBe("API key is required for Perma.cc");
    expect($fetch).toHaveBeenCalledTimes(1);
  });
});
