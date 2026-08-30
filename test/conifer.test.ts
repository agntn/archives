import { objectContaining } from "./_matchers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { $fetch } from "ofetch";
import { createArchive, resetConfig, storage } from "../src";
import createConifer from "../src/providers/conifer";

vi.mock("ofetch", () => ({
  $fetch: vi.fn(),
}));

describe("Conifer", () => {
  beforeEach(async () => {
    await storage.clear();
    resetConfig();
    vi.resetAllMocks();
  });

  it("includes the collection identity in its cache key", () => {
    expect(createConifer({ user: " imamuseum ", collection: " imamuseumorg " }).cacheKey()).toBe(
      "user=imamuseum:collection=imamuseumorg",
    );
  });

  it("lists matching pages from a public collection", async () => {
    vi.mocked($fetch).mockResolvedValueOnce({
      results: [
        {
          id: "page-id",
          rec: "recording-id",
          timestamp: "20171011134320",
          title: "Current Volunteers",
          url: "http://www.imamuseum.org/page/current-volunteers",
        },
      ],
    });

    const result = await createArchive(
      createConifer({ user: "imamuseum", collection: "imamuseumorg" }),
    ).snapshots("https://imamuseum.org", { limit: 1 });

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([
      {
        url: "http://www.imamuseum.org/page/current-volunteers",
        timestamp: "2017-10-11T13:43:20Z",
        snapshot:
          "https://conifer.rhizome.org/imamuseum/imamuseumorg/20171011134320/http://www.imamuseum.org/page/current-volunteers",
        _meta: {
          provider: "conifer",
          timestamp: "20171011134320",
          id: "page-id",
          recording: "recording-id",
          title: "Current Volunteers",
        },
      },
    ]);
    expect(result._meta).toMatchObject({
      source: "conifer",
      user: "imamuseum",
      collection: "imamuseumorg",
    });
    expect($fetch).toHaveBeenCalledWith(
      "/api/v1/url_search",
      objectContaining({
        baseURL: "https://conifer.rhizome.org",
        params: {
          user: "imamuseum",
          coll: "imamuseumorg",
          url: "imamuseum.org",
        },
      }),
    );
  });

  it("forwards the caller's cancellation signal to the search request", async () => {
    vi.mocked($fetch).mockResolvedValueOnce({ results: [] });

    const controller = new AbortController();
    await createArchive(createConifer({ user: "user", collection: "collection" })).snapshots(
      "example.com",
      { signal: controller.signal },
    );

    expect($fetch).toHaveBeenCalledWith(
      "/api/v1/url_search",
      objectContaining({ signal: controller.signal }),
    );
  });

  it.each([1, 1.5])("applies a requested limit of %s to Conifer results", async (limit) => {
    vi.mocked($fetch).mockResolvedValueOnce({
      results: [
        { url: "https://example.com/one", timestamp: "20200101000000" },
        { url: "https://example.com/two", timestamp: "20200102000000" },
      ],
    });

    const result = await createArchive(
      createConifer({ user: "user", collection: "collection" }),
    ).snapshots("example.com", { limit });

    expect(result.pages).toHaveLength(1);
  });

  it.each([0, -1])("returns no pages for a non-positive limit of %i", async (limit) => {
    const result = await createArchive(
      createConifer({ user: "user", collection: "collection" }),
    ).snapshots("example.com", { limit });

    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
    expect($fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty collection identity without making a request", async () => {
    const result = await createArchive(
      createConifer({ user: " ", collection: "collection" }),
    ).snapshots("example.com");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Conifer user and collection are required");
    expect($fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty target instead of requesting every collection page", async () => {
    const result = await createArchive(
      createConifer({ user: "user", collection: "collection" }),
    ).snapshots(" ");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Conifer target must not be empty");
    expect($fetch).not.toHaveBeenCalled();
  });
});
