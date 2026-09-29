import { describe, it, expect } from "vite-plus/test";
import { createArchive } from "../src";
import createWebCite from "../src/providers/webcite";

describe("WebCite Provider", () => {
  it("creates a WebCite provider", () => {
    const provider = createWebCite();
    expect(provider.name).toBe("WebCite");
    expect(provider.slug).toBe("webcite");
    expect(typeof provider.snapshots).toBe("function");
  });

  it("returns unsupported for snapshots(domain) — WebCite has no list-by-domain API", async () => {
    const archive = createArchive(createWebCite());
    const response = await archive.snapshots("example.com");

    expect(response.success).toBe(false);
    expect(response.unsupported).toBe(true);
    expect(response.unsupportedReason).toMatch(/list-by-domain/i);
    expect(response.pages).toEqual([]);
    expect(response._meta?.provider).toBe("webcite");
  });
});
