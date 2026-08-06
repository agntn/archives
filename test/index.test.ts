import { describe, it, expect, vi, beforeEach } from "vitest";
import { Archive, createArchive, UnsupportedOperationError, storage, resetConfig } from "../src";
import createWayback from "../src/providers/wayback";
import createWebCite from "../src/providers/webcite";
import type { ArchiveProvider, ArchivedPage } from "../src/types";

// The storage layer is module-level shared state. Without explicit cleanup
// success responses cached in earlier tests would leak into later tests that
// reuse the same provider slug+domain pair.
beforeEach(async () => {
  await storage.clear();
  resetConfig();
});

// --- helpers ---

function successProvider(slug: string, pages: ArchivedPage[]): ArchiveProvider {
  return {
    name: slug,
    slug,
    snapshots: vi.fn().mockResolvedValue({
      success: true,
      pages,
      _meta: { source: slug, provider: slug },
    }),
  };
}

function unsupportedProvider(slug: string, reason: string): ArchiveProvider {
  return {
    name: slug,
    slug,
    snapshots: vi.fn().mockResolvedValue({
      success: false,
      pages: [],
      unsupported: true,
      unsupportedReason: reason,
      _meta: { source: slug, provider: slug },
    }),
  };
}

function errorProvider(slug: string, error: string): ArchiveProvider {
  return {
    name: slug,
    slug,
    snapshots: vi.fn().mockResolvedValue({
      success: false,
      pages: [],
      error,
      _meta: { source: slug, provider: slug },
    }),
  };
}

const samplePage = (slug: string): ArchivedPage => ({
  url: "https://example.com",
  timestamp: "2023-01-01T00:00:00Z",
  snapshot: `https://archive.example/${slug}`,
  _meta: { provider: slug },
});

async function captureThrow(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected promise to reject");
}

// --- factory ---

describe("createArchive", () => {
  it("accepts a provider instance", () => {
    const waybackInstance = createWayback();
    expect(() => createArchive(waybackInstance)).not.toThrow();
  });

  it("returns provider api", () => {
    const waybackInstance = createWayback();
    const archive = createArchive(waybackInstance);

    expect(archive).toHaveProperty("snapshots");
    expect(typeof archive.snapshots).toBe("function");
  });

  it("merges global and request options", async () => {
    const mockProvider: ArchiveProvider = {
      name: "Mock Provider",
      snapshots: vi.fn().mockResolvedValue({ success: true, pages: [] }),
    };

    const archive = createArchive(mockProvider, { timeout: 5_000 });
    await archive.snapshots("example.com", { timeout: 10_000, limit: 100 });

    expect(mockProvider.snapshots).toHaveBeenCalledWith(
      "example.com",
      expect.objectContaining({ timeout: 10_000, limit: 100 }),
    );
  });

  it("keeps snapshots callable when passed as a callback", async () => {
    const archive = createArchive(successProvider("callback", []), { cache: false });
    const snapshots = archive.snapshots;

    await expect(snapshots("example.com")).resolves.toMatchObject({
      success: true,
      pages: [],
    });
  });
});

describe("Archive.resolveProviders", () => {
  it("isolates provider state from caller-owned arrays", async () => {
    const input = [successProvider("a", []), successProvider("b", [])];
    const archive = new Archive(input);

    input.pop();
    const resolved = await archive.resolveProviders();
    expect(resolved).toHaveLength(2);

    resolved.pop();
    await expect(archive.resolveProviders()).resolves.toHaveLength(2);
  });
});

// --- combineResults: unsupported propagation ---

describe("combineResults / unsupported propagation", () => {
  it("surfaces unsupported providers in combined response when others succeed", async () => {
    const archive = createArchive([
      successProvider("supporting", [samplePage("supporting")]),
      unsupportedProvider("unsupporting", "no list-by-domain"),
    ]);
    const response = await archive.snapshots("example.com");

    expect(response.success).toBe(true);
    expect(response.pages).toHaveLength(1);
    expect(response.unsupported).toBeUndefined();
    expect(response._meta?.unsupportedProviders).toEqual([
      { provider: "unsupporting", reason: "no list-by-domain" },
    ]);
  });

  it("marks combined response as unsupported when every provider is unsupported", async () => {
    const archive = createArchive([
      unsupportedProvider("a", "reason a"),
      unsupportedProvider("b", "reason b"),
    ]);
    const response = await archive.snapshots("example.com");

    expect(response.success).toBe(false);
    expect(response.unsupported).toBe(true);
    expect(response.unsupportedReason).toContain("a: reason a");
    expect(response.unsupportedReason).toContain("b: reason b");
    expect(response.error).toBeUndefined();
    expect(response._meta?.unsupportedProviders).toHaveLength(2);
  });

  it("keeps error and unsupported separate when providers fail in different ways", async () => {
    const archive = createArchive([
      errorProvider("broken", "network down"),
      unsupportedProvider("unsupporting", "no list-by-domain"),
    ]);
    const response = await archive.snapshots("example.com");

    expect(response.success).toBe(false);
    // Top-level `unsupported` is reserved for "every provider was unsupported".
    expect(response.unsupported).toBeUndefined();
    expect(response.unsupportedReason).toBeUndefined();
    expect(response.error).toBe("network down");
    expect(response._meta?.unsupportedProviders).toEqual([
      { provider: "unsupporting", reason: "no list-by-domain" },
    ]);
  });
});

// --- getPages: full 8-path matrix ---

describe("archive.getPages", () => {
  // Path 1: single success → returns pages
  it("single-provider success: returns pages", async () => {
    const archive = createArchive(successProvider("ok", [samplePage("ok")]));
    const pages = await archive.getPages("example.com");
    expect(pages).toHaveLength(1);
    expect(pages[0].snapshot).toBe("https://archive.example/ok");
  });

  // Path 2: single runtime error → throw generic Error("X")
  it("single-provider error: throws generic Error with provider message", async () => {
    const archive = createArchive(errorProvider("broken", "network down"));
    const error = await captureThrow(archive.getPages("example.com"));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnsupportedOperationError);
    expect((error as Error).message).toBe("network down");
  });

  // Path 3: single unsupported → UnsupportedOperationError with synthesized .providers
  it("single-provider unsupported: throws UnsupportedOperationError with .providers populated", async () => {
    const archive = createArchive(createWebCite());
    const error = await captureThrow(archive.getPages("example.com"));
    expect(error).toBeInstanceOf(UnsupportedOperationError);
    expect(error).toBeInstanceOf(Error);

    const op = error as UnsupportedOperationError;
    expect(op.message).toMatch(/list-by-domain/i);
    expect(op.providers).toHaveLength(1);
    expect(op.providers[0].provider).toBe("webcite");
    expect(op.providers[0].reason).toMatch(/list-by-domain/i);
  });

  // Path 4: multi all success → returns merged pages (covered indirectly elsewhere)
  it("multi-provider all success: returns merged sorted pages", async () => {
    const a = successProvider("a", [
      { ...samplePage("a"), timestamp: "2023-01-02T00:00:00Z" },
    ]);
    const b = successProvider("b", [
      { ...samplePage("b"), timestamp: "2023-01-01T00:00:00Z" },
    ]);
    const archive = createArchive([a, b]);
    const pages = await archive.getPages("example.com");
    expect(pages).toHaveLength(2);
    // newest first
    expect(pages[0]._meta.provider).toBe("a");
    expect(pages[1]._meta.provider).toBe("b");
  });

  // Path 5: multi all error → throw generic Error with joined messages
  it("multi-provider all error: throws generic Error with joined messages", async () => {
    const archive = createArchive([
      errorProvider("a", "down a"),
      errorProvider("b", "down b"),
    ]);
    const error = await captureThrow(archive.getPages("example.com"));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnsupportedOperationError);
    expect((error as Error).message).toContain("down a");
    expect((error as Error).message).toContain("down b");
  });

  // Path 6: multi all unsupported → UnsupportedOperationError with full .providers list
  it("multi-provider all unsupported: throws UnsupportedOperationError with full .providers list", async () => {
    const archive = createArchive([
      unsupportedProvider("a", "reason a"),
      unsupportedProvider("b", "reason b"),
    ]);
    const error = await captureThrow(archive.getPages("example.com"));
    expect(error).toBeInstanceOf(UnsupportedOperationError);

    const op = error as UnsupportedOperationError;
    expect(op.providers).toEqual([
      { provider: "a", reason: "reason a" },
      { provider: "b", reason: "reason b" },
    ]);
    expect(op.message).toContain("a: reason a");
    expect(op.message).toContain("b: reason b");
  });

  // Path 7: multi success + unsupported → returns pages (no throw)
  it("multi-provider mixed success+unsupported: returns pages without throwing", async () => {
    const archive = createArchive([
      successProvider("ok", [samplePage("ok")]),
      unsupportedProvider("nope", "skip"),
    ]);
    const pages = await archive.getPages("example.com");
    expect(pages).toHaveLength(1);
  });

  // Path 8: multi error + unsupported (no success) → generic Error with both layers in message
  it("multi-provider mixed error+unsupported: throws generic Error with both layers in message", async () => {
    const archive = createArchive([
      errorProvider("broken", "network down"),
      unsupportedProvider("unsupporting", "no list-by-domain"),
    ]);
    const error = await captureThrow(archive.getPages("example.com"));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnsupportedOperationError);
    expect((error as Error).message).toContain("network down");
    expect((error as Error).message).toContain("unsupporting");
    expect((error as Error).message).toContain("no list-by-domain");
  });
});
