import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArchivedPage } from "../src/types";
import {
  buildCandidatePairs,
  createEvidenceTools,
  EVIDENCE_PROVIDER_SLUGS,
  EVIDENCE_TOOL_NAMES,
  markdownData,
  resolvedArchivePage,
  selectDiffExcerpt,
} from "../docs/app/utils/webmcp";
import { providerInfo } from "../docs/app/utils/providers";
import { useEvidenceRoom } from "../docs/app/composables/useEvidenceRoom";
import { archiveRequestAbort } from "../docs/server/utils/query";
import { coverage } from "../docs/server/utils/coverage";

const { snapshotArchivesMock } = vi.hoisted(() => ({ snapshotArchivesMock: vi.fn() }));
vi.mock("@agntn/archives/tool-operations", () => ({ snapshotArchives: snapshotArchivesMock }));

declare global {
  function useState<T>(key: string, init: () => T): { value: T };
  function useRoute(): { readonly path: string };
  function navigateTo(path: string): Promise<unknown>;
  function $fetch<T>(path: string, options?: Readonly<Record<string, unknown>>): Promise<T>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  snapshotArchivesMock.mockReset();
});

function installEvidenceRoom() {
  const values = new Map<string, { value: unknown }>();
  const fetchMock = vi.fn();
  vi.stubGlobal("useState", <T>(key: string, init: () => T): { value: T } => {
    const existing = values.get(key);
    if (existing) return existing as { value: T };
    const created = { value: init() };
    values.set(key, created);
    return created;
  });
  vi.stubGlobal("useRoute", () => ({ path: "/evidence" }));
  vi.stubGlobal("navigateTo", vi.fn().mockResolvedValue(undefined));
  vi.stubGlobal("$fetch", fetchMock);
  return { room: useEvidenceRoom(), fetchMock };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function failureMessage(result: unknown): string {
  if (!result || typeof result !== "object") throw new TypeError("Expected a tool result object");
  const record = result as Readonly<Record<string, unknown>>;
  if (record["ok"] !== false || typeof record["error"] !== "string") {
    throw new TypeError("Expected a failed tool result");
  }
  return record["error"];
}

function capture(
  url: string,
  timestamp: string,
  metadata: Readonly<Record<string, unknown>> = {},
): ArchivedPage {
  return {
    url,
    timestamp,
    snapshot: `https://archive.example/${timestamp}`,
    _meta: { provider: "wayback", ...metadata },
  };
}

describe("docs WebMCP tools", () => {
  it("derives evidence provider labels and capabilities from the shared registry", () => {
    for (const slug of EVIDENCE_PROVIDER_SLUGS) {
      expect(providerInfo(slug)).toMatchObject({ slug, content: true });
      expect(providerInfo(slug)?.needs).toBeUndefined();
    }
  });

  it("registers one bounded tool for each investigation step", () => {
    const actions = {
      scopeCase: async () => ({ ok: true }),
      findChanges: async () => ({ ok: true }),
      inspectChange: async () => ({ ok: true }),
      pinFinding: async () => ({ ok: true }),
    };

    const tools = createEvidenceTools(actions);

    expect(tools.map((tool) => tool.name)).toEqual(EVIDENCE_TOOL_NAMES);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.name.length).toBeLessThanOrEqual(30);
      expect(tool.description.length).toBeLessThanOrEqual(500);
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      expect(tool.annotations?.untrustedContentHint).toBe(true);
    }
    expect(tools.map((tool) => tool.annotations?.readOnlyHint)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("links a browser request abort to archive work on the server", () => {
    const controller = new AbortController();
    const request = new Request("https://archives.example/api", { signal: controller.signal });
    const event = { web: { request } };
    const linked = archiveRequestAbort(event as never);

    controller.abort();

    expect(linked.signal.aborted).toBe(true);
    linked.dispose();
  });

  it("keeps cancellation isolated between concurrent coverage cache misses", async () => {
    interface PendingCall {
      readonly signal: AbortSignal;
      readonly resolve: (value: unknown) => void;
      readonly reject: (reason: unknown) => void;
    }

    const pending: PendingCall[] = [];
    snapshotArchivesMock.mockImplementation(
      (_options: Readonly<{ target: string; provider: string }>, signal: AbortSignal) =>
        new Promise((resolve, reject) => {
          pending.push({ signal, resolve, reject });
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    const storage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("useStorage", () => storage);
    const firstController = new AbortController();
    const secondController = new AbortController();

    try {
      const first = coverage("example.com", firstController.signal).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );
      const second = coverage("example.com", secondController.signal);
      await vi.waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(14));
      await vi.waitFor(() => expect(snapshotArchivesMock).toHaveBeenCalledTimes(16));
      await vi.waitFor(() => expect(pending).toHaveLength(16));

      firstController.abort(new DOMException("first caller left", "AbortError"));
      for (const call of pending.filter(({ signal }) => signal === secondController.signal)) {
        call.resolve({
          details: {
            response: {
              success: true,
              pages: [
                capture("https://example.com/", "2024-01-01T00:00:00Z", { provider: "wayback" }),
              ],
            },
          },
        });
      }

      const firstResult = await first;
      expect(firstResult).toMatchObject({ status: "rejected", error: { name: "AbortError" } });
      expect((await second).providers.every(({ state }) => state === "ok")).toBe(true);
      expect(new Set(pending.map(({ signal }) => signal)).size).toBe(2);
      expect(storage.getItem).toHaveBeenCalledTimes(14);
      expect(storage.setItem).toHaveBeenCalledTimes(7);
    } finally {
      vi.unstubAllGlobals();
      snapshotArchivesMock.mockReset();
    }
  });

  it("passes the browser cancellation signal to archive reads", async () => {
    const calls: Array<{ name: string; signal?: AbortSignal }> = [];
    const actions = {
      scopeCase: async (_input: object, signal: AbortSignal) => {
        calls.push({ name: "scope", signal });
        return { ok: true };
      },
      findChanges: async (_input: object, signal: AbortSignal) => {
        calls.push({ name: "find", signal });
        return { ok: true };
      },
      inspectChange: async (_input: object, signal: AbortSignal) => {
        calls.push({ name: "inspect", signal });
        return { ok: true };
      },
      pinFinding: async () => ({ ok: true }),
    };
    const signal = new AbortController().signal;
    const tools = createEvidenceTools(actions);

    await tools[0]!.execute({ target: "example.com", question: "What changed?" }, { signal });
    await tools[1]!.execute({ caseId: "case_1" }, { signal });
    await tools[2]!.execute({ caseId: "case_1", changeId: "chg_1" }, { signal });

    expect(calls).toEqual([
      { name: "scope", signal },
      { name: "find", signal },
      { name: "inspect", signal },
    ]);
  });

  it("does not resurrect a scope request after the user resets the case", async () => {
    const { room, fetchMock } = installEvidenceRoom();
    const response = deferred<{ providers: [] }>();
    fetchMock.mockReturnValueOnce(response.promise);

    const operation = room.scopeCase(
      { target: "example.com", question: "What changed?" },
      new AbortController().signal,
    );
    room.reset();
    response.resolve({ providers: [] });

    expect(failureMessage(await operation)).toContain("superseded");
    expect(room.state.value.archiveCase).toBeUndefined();
  });

  it("returns every bounded window and invalidates its old change IDs on a rescan", async () => {
    const { room, fetchMock } = installEvidenceRoom();
    fetchMock.mockResolvedValueOnce({
      providers: [{ provider: "arquivo", state: "ok", count: 7 }],
    });
    await room.scopeCase(
      { target: "example.com", question: "What changed?" },
      new AbortController().signal,
    );
    const archiveCase = room.state.value.archiveCase!;
    const pages = Array.from({ length: 7 }, (_, index) =>
      capture("https://example.com/", `2024-${String(index + 1).padStart(2, "0")}-01T00:00:00Z`, {
        provider: "arquivo",
      }),
    );
    fetchMock.mockResolvedValue({ details: { response: { pages } } });

    const first = (await room.findChanges(
      { caseId: archiveCase.id, provider: "arquivo", maxCaptures: 7 },
      new AbortController().signal,
    )) as { readonly changes: ReadonlyArray<{ readonly changeId: string }> };
    const second = (await room.findChanges(
      { caseId: archiveCase.id, provider: "arquivo", maxCaptures: 7 },
      new AbortController().signal,
    )) as { readonly changes: ReadonlyArray<{ readonly changeId: string }> };

    expect(first.changes).toHaveLength(6);
    expect(second.changes).toHaveLength(6);
    expect(second.changes.map(({ changeId }) => changeId)).not.toEqual(
      first.changes.map(({ changeId }) => changeId),
    );
    const staleResult = await room.inspectChange(
      { caseId: archiveCase.id, changeId: first.changes[0]!.changeId },
      new AbortController().signal,
    );
    expect(failureMessage(staleResult)).toContain("not pinned");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not let an older concurrent scan overwrite a newer one", async () => {
    const { room, fetchMock } = installEvidenceRoom();
    fetchMock.mockResolvedValueOnce({
      providers: [{ provider: "arquivo", state: "ok", count: 3 }],
    });
    await room.scopeCase(
      { target: "example.com", question: "What changed?" },
      new AbortController().signal,
    );
    const archiveCase = room.state.value.archiveCase!;
    const older = deferred<{ details: { response: { pages: ArchivedPage[] } } }>();
    const newer = deferred<{ details: { response: { pages: ArchivedPage[] } } }>();
    fetchMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const first = room.findChanges(
      { caseId: archiveCase.id, provider: "arquivo", maxCaptures: 3 },
      new AbortController().signal,
    );
    const second = room.findChanges(
      { caseId: archiveCase.id, provider: "arquivo", maxCaptures: 3 },
      new AbortController().signal,
    );
    newer.resolve({
      details: {
        response: {
          pages: [
            capture("https://example.com/", "2025-01-01T00:00:00Z"),
            capture("https://example.com/", "2025-02-01T00:00:00Z"),
            capture("https://example.com/", "2025-03-01T00:00:00Z"),
          ],
        },
      },
    });
    await second;
    older.resolve({
      details: {
        response: {
          pages: [
            capture("https://example.com/", "2024-01-01T00:00:00Z"),
            capture("https://example.com/", "2024-02-01T00:00:00Z"),
            capture("https://example.com/", "2024-03-01T00:00:00Z"),
          ],
        },
      },
    });

    expect(failureMessage(await first)).toContain("superseded");
    expect(room.state.value.windows).toHaveLength(2);
    expect(
      room.state.value.windows.every((window) => window.before.timestamp.startsWith("2025")),
    ).toBe(true);
  });

  it("does not replace cited provenance when a resolved diff has no inspectable excerpt", async () => {
    const { room, fetchMock } = installEvidenceRoom();
    fetchMock.mockResolvedValueOnce({
      providers: [{ provider: "wayback", state: "ok", count: 3 }],
    });
    await room.scopeCase(
      { target: "example.com", question: "What changed?" },
      new AbortController().signal,
    );
    const archiveCase = room.state.value.archiveCase!;
    const pages = [
      capture("https://example.com/", "2024-01-01T00:00:00Z"),
      capture("https://example.com/", "2024-02-01T00:00:00Z"),
      capture("https://example.com/", "2024-03-01T00:00:00Z"),
    ];
    fetchMock.mockResolvedValueOnce({ details: { response: { pages } } });
    await room.findChanges(
      { caseId: archiveCase.id, provider: "wayback", maxCaptures: 3 },
      new AbortController().signal,
    );
    const window = room.state.value.windows[0]!;
    const priorInspection = {
      changeId: window.id,
      excerpt: "+previous evidence",
      inspectedAt: "2024-04-01T00:00:00Z",
    };
    room.state.value.inspection = priorInspection;
    fetchMock.mockResolvedValueOnce({
      text: "a response without the archived-data fence",
      details: {
        success: true,
        attempts: [],
        digest: "new-digest",
        result: {
          before: {
            url: window.before.url,
            timestamp: window.before.timestamp,
            snapshot: "https://archive.example/new-before",
            bytes: 10,
            truncated: false,
            provider: "wayback",
          },
          after: {
            url: window.after.url,
            timestamp: window.after.timestamp,
            snapshot: "https://archive.example/new-after",
            bytes: 12,
            truncated: false,
            provider: "wayback",
          },
          additions: 1,
          deletions: 1,
          identical: false,
          partial: false,
        },
      },
    });

    const failedInspection = await room.inspectChange(
      { caseId: archiveCase.id, changeId: window.id },
      new AbortController().signal,
    );
    expect(failureMessage(failedInspection)).toContain("no inspectable");
    expect(room.state.value.windows[0]).toBe(window);
    expect(room.state.value.inspection).toBe(priorInspection);
  });

  it("keeps exported data from injecting Markdown structure", () => {
    expect(markdownData("Claim\r\n# forged heading\u2028<script>alert(1)</script>")).toBe(
      "    Claim\n    # forged heading\n    <script>alert(1)</script>",
    );
  });

  it("rebuilds citations from resolved diff provenance instead of stale listing metadata", () => {
    const page = resolvedArchivePage({
      url: "https://example.com/",
      timestamp: "2024-02-01T00:00:00Z",
      snapshot: "https://archive.example/resolved",
      mime: "text/html",
      bytes: 42,
      truncated: false,
      provider: "memento",
      archive: "arquivo.pt",
    });

    expect(page).toEqual({
      url: "https://example.com/",
      timestamp: "2024-02-01T00:00:00Z",
      snapshot: "https://archive.example/resolved",
      _meta: {
        provider: "memento",
        source: "memento",
        archive: "arquivo.pt",
        mime: "text/html",
        bytes: 42,
        truncated: false,
      },
    });
    expect(page._meta).not.toHaveProperty("digest");
  });

  it("rejects active links from invalid resolved provenance", () => {
    expect(() =>
      resolvedArchivePage({
        url: "https://example.com/",
        timestamp: "2024-02-01T00:00:00Z",
        snapshot: "javascript:alert(1)",
        bytes: 42,
        truncated: false,
        provider: "wayback",
      }),
    ).toThrow("HTTP(S)");
  });

  it("never proposes a diff across different original URLs", () => {
    const windows = buildCandidatePairs(
      [
        capture("http://nuxt.com:80/", "2004-01-01T00:00:00Z"),
        capture("http://nuxt.com/", "2004-01-01T00:00:00Z"),
        capture("http://nuxt.com/", "2005-01-01T00:00:00Z"),
        capture("http://www.nuxt.com:80/", "2006-01-01T00:00:00Z"),
        capture("http://www.nuxt.com/", "2007-01-01T00:00:00Z"),
        capture("http://user:pass@nuxt.com/", "2008-01-01T00:00:00Z"),
        capture("http://user:pass@nuxt.com/", "2009-01-01T00:00:00Z"),
      ],
      "nuxt.com",
    );

    expect(windows).toHaveLength(2);
    expect(windows.map((window) => [window.before.url, window.after.url])).toEqual(
      expect.arrayContaining([
        ["http://nuxt.com:80/", "http://nuxt.com/"],
        ["http://www.nuxt.com:80/", "http://www.nuxt.com/"],
      ]),
    );
  });

  it("never pairs captures from different providers", () => {
    const pages = [
      capture("https://example.com/", "2024-01-01T00:00:00Z", { provider: "wayback" }),
      capture("https://example.com/", "2024-02-01T00:00:00Z", { provider: "arquivo" }),
    ];

    expect(buildCandidatePairs(pages, "example.com")).toEqual([]);
  });

  it("searches every path in a domain scope without pairing different resources", () => {
    const pages = [
      capture("https://example.com/about", "2024-01-01T00:00:00Z"),
      capture("https://example.com/contact", "2024-01-15T00:00:00Z"),
      capture("https://example.com/about", "2024-02-01T00:00:00Z"),
      capture("https://example.com/contact", "2024-02-15T00:00:00Z"),
    ];

    const windows = buildCandidatePairs(pages, "example.com");

    expect(windows).toHaveLength(2);
    expect(windows.every((window) => window.before.url === window.after.url)).toBe(true);
    expect(windows.map((window) => window.before.url)).toEqual(
      expect.arrayContaining(["https://example.com/about", "https://example.com/contact"]),
    );
  });

  it("does not fold case-sensitive paths or query strings into the scoped resource", () => {
    const pages = [
      capture("https://example.com/About?view=A", "2024-01-01T00:00:00Z"),
      capture("https://example.com/About?view=A", "2024-02-01T00:00:00Z"),
    ];

    expect(buildCandidatePairs(pages, "example.com/about?view=A")).toEqual([]);
    expect(buildCandidatePairs(pages, "example.com/About?view=a")).toEqual([]);
    expect(buildCandidatePairs(pages, "example.com/About?view=A")).toHaveLength(1);
  });

  it("keeps Memento capture pairs inside one underlying archive", () => {
    const windows = buildCandidatePairs(
      [
        capture("https://example.com/", "2024-01-01T00:00:00Z", {
          provider: "memento",
          archive: "arquivo.pt",
        }),
        capture("https://example.com/", "2024-01-01T00:00:00Z", {
          provider: "memento",
          archive: "web.archive.org",
        }),
        capture("https://example.com/", "2024-02-01T00:00:00Z", {
          provider: "memento",
          archive: "web.archive.org",
        }),
        capture("https://example.com/", "2024-03-01T00:00:00Z", {
          provider: "memento",
          archive: "arquivo.pt",
        }),
      ],
      "example.com",
    );

    expect(windows).toHaveLength(2);
    for (const window of windows) {
      expect(window.before._meta.archive).toBe(window.after._meta.archive);
    }
  });

  it("uses archive index digests to omit capture pairs that are identical at byte level", () => {
    const windows = buildCandidatePairs(
      [
        capture("https://example.com/", "2024-01-01T00:00:00Z", { digest: "A", length: "100" }),
        capture("https://example.com/", "2024-02-01T00:00:00Z", { digest: "A", length: "100" }),
        capture("https://example.com/", "2024-03-01T00:00:00Z", { digest: "B", length: "125" }),
      ],
      "example.com",
    );

    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({
      digestChanged: true,
      byteDelta: 25,
      before: { timestamp: "2024-02-01T00:00:00Z" },
      after: { timestamp: "2024-03-01T00:00:00Z" },
    });
  });

  it("treats source lines beginning with three signs inside a hunk as evidence, not diff headers", () => {
    const patch = [
      "--- before",
      "+++ after",
      "@@ -1 +1 @@",
      "-old heading",
      "+new heading",
      " context one",
      " context two",
      " context three",
      "@@ -20 +20 @@",
      "---legacy-counter",
      "+++replacement-counter",
    ].join("\n");

    const excerpt = selectDiffExcerpt(patch, "replacement-counter");

    expect(excerpt).toContain("+++replacement-counter");
  });

  it("selects focused changed lines and enforces the output budget", () => {
    const patch = [
      "--- before",
      "+++ after",
      "@@ -1,5 +1,5 @@",
      " unchanged heading",
      "-General sustainability statement",
      "+We will reach net zero by 2030",
      " unchanged footer",
      "@@ -20,2 +20,2 @@",
      "-old contact",
      "+new contact",
    ].join("\n");

    const excerpt = selectDiffExcerpt(patch, "net zero", 90);

    expect(excerpt).toContain("net zero by 2030");
    expect(excerpt).not.toContain("old contact");
    expect(excerpt.length).toBeLessThanOrEqual(90);
  });
});
