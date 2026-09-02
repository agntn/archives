import { describe, expect, it } from "vitest";
import { diffArchivedContent } from "../src";
import type { ArchivedContent } from "../src/types";

type ContentOverrides = Readonly<Omit<Partial<ArchivedContent>, "_meta">> & {
  readonly _meta?: Readonly<ArchivedContent["_meta"]>;
};

function capture(
  timestamp: string,
  content: string,
  overrides: ContentOverrides = {},
): ArchivedContent {
  return {
    url: "https://example.com/puzzle",
    timestamp,
    snapshot: `https://web.archive.org/web/${timestamp.replaceAll(/\D/g, "")}/https://example.com/puzzle`,
    content,
    mime: "text/html",
    bytes: content.length,
    truncated: false,
    _meta: { provider: "wayback" },
    ...overrides,
  };
}

describe("archived content diff", () => {
  it("compares visible lines while preserving capture provenance", () => {
    const before = capture(
      "2020-01-01T00:00:00Z",
      "<html><body><p>old clue</p><script>const hidden = 'before'</script></body></html>",
    );
    const after = capture(
      "2021-01-01T00:00:00Z",
      "<html><body><p>new clue</p><script>const hidden = 'after'</script></body></html>",
    );

    const result = diffArchivedContent(before, after, { context: 1 });

    expect(result).toMatchObject({
      additions: 1,
      deletions: 1,
      identical: false,
      format: "text",
      context: 1,
      before: {
        timestamp: "2020-01-01T00:00:00Z",
        snapshot: before.snapshot,
      },
      after: {
        timestamp: "2021-01-01T00:00:00Z",
        snapshot: after.snapshot,
      },
    });
    expect(result.patch).toContain("-old clue");
    expect(result.patch).toContain("+new clue");
    expect(result.patch).not.toContain("const hidden");
  });

  it("keeps markup and scripts in a raw comparison", () => {
    const before = capture("2020-01-01T00:00:00Z", "<script>oldRoute()</script>");
    const after = capture("2021-01-01T00:00:00Z", "<script>newRoute()</script>");

    const result = diffArchivedContent(before, after, { format: "raw" });

    expect(result.patch).toContain("-<script>oldRoute()</script>");
    expect(result.patch).toContain("+<script>newRoute()</script>");
  });

  it("refuses to compare captures with mismatched provenance or chronology", () => {
    const before = capture("2020-01-01T00:00:00Z", "before");
    const after = capture("2021-01-01T00:00:00Z", "after");

    expect(() =>
      diffArchivedContent(
        before,
        capture("2021-01-01T00:00:00Z", "after", {
          url: "https://other.example/puzzle",
        }),
      ),
    ).toThrow("different original URLs");
    expect(() =>
      diffArchivedContent(
        before,
        capture("2021-01-01T00:00:00Z", "after", {
          _meta: { provider: "arquivo" },
        }),
      ),
    ).toThrow("different providers");
    expect(() => diffArchivedContent(after, before)).toThrow("not earlier");
    expect(() =>
      diffArchivedContent(before, capture("2021-01-01T00:00:00Z", "after", { _meta: {} })),
    ).toThrow("without provider provenance");
  });

  it("requires one underlying archive for Memento comparisons", () => {
    const before = capture("2020-01-01T00:00:00Z", "before", {
      _meta: { provider: "memento", archive: "web.archive.org" },
    });
    const after = capture("2021-01-01T00:00:00Z", "after", {
      _meta: { provider: "memento", archive: "arquivo.pt" },
    });

    expect(() => diffArchivedContent(before, after)).toThrow("different underlying archives");
    expect(() =>
      diffArchivedContent(
        before,
        capture("2021-01-01T00:00:00Z", "after", {
          _meta: { provider: "memento" },
        }),
      ),
    ).toThrow("without underlying archive provenance");

    const result = diffArchivedContent(
      before,
      capture("2021-01-01T00:00:00Z", "after", {
        _meta: { provider: "memento", archive: "web.archive.org" },
      }),
    );
    expect(result.before.archive).toBe("web.archive.org");
    expect(result.after.archive).toBe("web.archive.org");
  });

  it("counts source lines that begin with unified diff header prefixes", () => {
    const before = capture("2020-01-01T00:00:00Z", "---counter", { mime: "text/plain" });
    const after = capture("2021-01-01T00:00:00Z", "+++counter", { mime: "text/plain" });

    const result = diffArchivedContent(before, after);

    expect(result).toMatchObject({ additions: 1, deletions: 1 });
    expect(result.patch).toContain("----counter");
    expect(result.patch).toContain("++++counter");
  });

  it("rejects binary captures instead of diffing their lossy decoded text", () => {
    const before = capture("2020-01-01T00:00:00Z", "%PDF old", {
      mime: "application/pdf",
    });
    const after = capture("2021-01-01T00:00:00Z", "%PDF new", {
      mime: "application/pdf",
    });

    expect(() => diffArchivedContent(before, after)).toThrow("not textual");
  });

  it("aborts a comparison beyond the configured edit distance bound", () => {
    const before = capture("2020-01-01T00:00:00Z", "one\ntwo\nthree");
    const after = capture("2021-01-01T00:00:00Z", "four\nfive\nsix");

    expect(() => diffArchivedContent(before, after, { maxEditLength: 1 })).toThrow(
      "complexity limit",
    );
  });
});
