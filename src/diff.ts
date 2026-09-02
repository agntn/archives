import { formatPatch, structuredPatch } from "diff";
import type {
  ArchiveDiffFormat,
  ArchiveDiffOptions,
  ArchivedContent,
  ArchivedContentDiff,
  ArchivedContentSummary,
} from "./types";
import { htmlToText, isTextualMime } from "./utils";

const DEFAULT_CONTEXT = 3;
const DEFAULT_TIMEOUT = 1000;
const DEFAULT_MAX_EDIT_LENGTH = 10_000;
const MAX_CONTEXT = 100;
const MAX_DIFF_TIMEOUT = 5000;
const MAX_EDIT_LENGTH = 100_000;

type ArchivedContentView = Readonly<Omit<ArchivedContent, "_meta">> & {
  readonly _meta: Readonly<ArchivedContent["_meta"]>;
};

interface ResolvedDiffOptions {
  format: ArchiveDiffFormat;
  context: number;
  timeout: number;
  maxEditLength: number;
}

/**
 * Produces a bounded unified line diff from two captures of the same original URL.
 *
 * The comparison rejects mixed providers and nonchronological captures because a
 * plausible patch with broken provenance is worse evidence than no patch. The
 * default text mode removes markup, scripts and styles; raw mode retains decoded
 * source for route, comment and bundle archaeology.
 *
 * @param before - Earlier archived capture.
 * @param after - Later archived capture.
 * @param options - Rendering, context and complexity bounds.
 * @returns {ArchivedContentDiff} Patch, change counts and identities of both captures.
 * @throws {Error} When provenance, chronology, options or complexity bounds fail.
 */
export function diffArchivedContent(
  before: ArchivedContentView,
  after: ArchivedContentView,
  options: Readonly<ArchiveDiffOptions> = {},
): ArchivedContentDiff {
  const resolved = resolveDiffOptions(options);
  assertComparable(before, after);

  const patch = structuredPatch(
    "before",
    "after",
    renderCapture(before, resolved.format),
    renderCapture(after, resolved.format),
    before.timestamp,
    after.timestamp,
    {
      context: resolved.context,
      timeout: resolved.timeout,
      maxEditLength: resolved.maxEditLength,
      stripTrailingCr: true,
    },
  );
  if (!patch) {
    throw new Error(
      `Archived content diff exceeded its complexity limit (${resolved.timeout} ms or ${resolved.maxEditLength} line edits)`,
    );
  }

  const counts = countChanges(patch.hunks);
  const identical = patch.hunks.length === 0;
  return {
    before: summarizeCapture(before),
    after: summarizeCapture(after),
    patch: identical
      ? ""
      : formatPatch(patch, {
          includeIndex: false,
          includeUnderline: false,
          includeFileHeaders: true,
        }),
    additions: counts.additions,
    deletions: counts.deletions,
    identical,
    partial: before.truncated || after.truncated,
    format: resolved.format,
    context: resolved.context,
  };
}

function resolveDiffOptions(options: Readonly<ArchiveDiffOptions>): ResolvedDiffOptions {
  const format = options.format ?? "text";
  if (format !== "text" && format !== "raw") {
    throw new TypeError(`Unknown diff format "${String(format)}": use text or raw`);
  }
  return {
    format,
    context: boundedInteger("context", options.context ?? DEFAULT_CONTEXT, 0, MAX_CONTEXT),
    timeout: boundedInteger("timeout", options.timeout ?? DEFAULT_TIMEOUT, 1, MAX_DIFF_TIMEOUT),
    maxEditLength: boundedInteger(
      "maxEditLength",
      options.maxEditLength ?? DEFAULT_MAX_EDIT_LENGTH,
      0,
      MAX_EDIT_LENGTH,
    ),
  };
}

function boundedInteger(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value)) throw new TypeError(`${name} must be a whole number`);
  if (value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function assertComparable(before: ArchivedContentView, after: ArchivedContentView): void {
  assertSameSource(before, after);
  assertChronological(before.timestamp, after.timestamp);
}

function assertSameSource(before: ArchivedContentView, after: ArchivedContentView): void {
  if (canonicalUrl(before.url) !== canonicalUrl(after.url)) {
    throw new Error("Cannot diff captures of different original URLs");
  }
  if (!isTextualMime(before.mime) || !isTextualMime(after.mime)) {
    throw new TypeError("Cannot diff archived bodies that are not textual");
  }

  const beforeProvider = captureProvider(before);
  const afterProvider = captureProvider(after);
  if (!beforeProvider || !afterProvider) {
    throw new Error("Cannot diff captures without provider provenance");
  }
  if (beforeProvider !== afterProvider) {
    throw new Error("Cannot diff captures from different providers");
  }
  if (beforeProvider === "memento") assertSameMementoArchive(before, after);
}

function assertSameMementoArchive(before: ArchivedContentView, after: ArchivedContentView): void {
  const beforeArchive = captureArchive(before);
  const afterArchive = captureArchive(after);
  if (!beforeArchive || !afterArchive) {
    throw new Error("Cannot diff Memento captures without underlying archive provenance");
  }
  if (beforeArchive !== afterArchive) {
    throw new Error("Cannot diff Memento captures from different underlying archives");
  }
}

function assertChronological(before: string, after: string): void {
  const beforeTime = Date.parse(before);
  const afterTime = Date.parse(after);
  if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime)) {
    throw new TypeError("Cannot diff captures with an invalid archived timestamp");
  }
  if (beforeTime >= afterTime) {
    throw new Error("The before capture is not earlier than the after capture");
  }
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value.trim();
  }
}

function captureProvider(capture: ArchivedContentView): string | undefined {
  const provider = capture._meta.provider;
  return typeof provider === "string" && provider ? provider : undefined;
}

function captureArchive(capture: ArchivedContentView): string | undefined {
  const archive = capture._meta.archive;
  return typeof archive === "string" && archive ? archive : undefined;
}

function renderCapture(capture: ArchivedContentView, format: ArchiveDiffFormat): string {
  return format === "text" && isMarkup(capture) ? htmlToText(capture.content) : capture.content;
}

function isMarkup(capture: ArchivedContentView): boolean {
  if (capture.mime) return capture.mime.includes("html") || capture.mime.includes("xml");
  return /^\s*<(?:!doctype|html|\?xml)/i.test(capture.content.slice(0, 200));
}

function summarizeCapture(capture: ArchivedContentView): ArchivedContentSummary {
  const provider = captureProvider(capture);
  if (!provider) throw new Error("Cannot summarize a capture without provider provenance");
  const archive = captureArchive(capture);
  return {
    url: capture.url,
    timestamp: capture.timestamp,
    snapshot: capture.snapshot,
    ...(capture.mime ? { mime: capture.mime } : {}),
    bytes: capture.bytes,
    truncated: capture.truncated,
    provider,
    ...(archive ? { archive } : {}),
  };
}

function countChanges(hunks: readonly Readonly<{ lines: readonly string[] }>[]): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) additions++;
      if (line.startsWith("-")) deletions++;
    }
  }
  return { additions, deletions };
}
