import type { ArchivedContentSummary } from "@agntn/archives";
import type { WebMCP } from "webmcp-types";

/** Archives in the shared provider registry that this workflow can read without extra credentials or coordinates. */
export const EVIDENCE_PROVIDER_SLUGS = [
  "wayback",
  "arquivo",
  "webarchiv",
  "archiveToday",
  "commoncrawl",
  "memento",
] as const;
export type EvidenceProvider = (typeof EVIDENCE_PROVIDER_SLUGS)[number];

/** Shared bounds for tool schemas, runtime checks, and the manual form. */
export const EVIDENCE_LIMITS = {
  target: 2048,
  question: 280,
  date: 32,
  caseId: 64,
  changeId: 96,
  focus: 120,
  finding: 280,
  minCaptures: 3,
  maxCaptures: 12,
  defaultCaptures: 7,
  excerpt: 760,
  findings: 20,
} as const;

/** Names of the WebMCP tools exposed by the docs site. */
export const EVIDENCE_TOOL_NAMES = [
  "scope_archive_case",
  "find_change_windows",
  "inspect_archive_change",
  "pin_archive_finding",
] as const;

const scopeCaseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    target: {
      type: "string",
      minLength: 1,
      maxLength: EVIDENCE_LIMITS.target,
      description: "Exact page URL or domain to investigate.",
    },
    question: {
      type: "string",
      minLength: 1,
      maxLength: EVIDENCE_LIMITS.question,
      description: "Historical claim or question the evidence should test.",
    },
    from: {
      type: "string",
      maxLength: EVIDENCE_LIMITS.date,
      description: "Optional earliest year, date, or archive timestamp.",
    },
    to: {
      type: "string",
      maxLength: EVIDENCE_LIMITS.date,
      description: "Optional latest year, date, or archive timestamp.",
    },
  },
  required: ["target", "question"],
} as const;

const findChangesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    caseId: {
      type: "string",
      minLength: 1,
      maxLength: EVIDENCE_LIMITS.caseId,
      description: "Case identifier returned by scope_archive_case.",
    },
    provider: {
      type: "string",
      enum: EVIDENCE_PROVIDER_SLUGS,
      description: "Archive to inspect. Omit to use the case recommendation.",
    },
    maxCaptures: {
      type: "integer",
      minimum: EVIDENCE_LIMITS.minCaptures,
      maximum: EVIDENCE_LIMITS.maxCaptures,
      description: `Capture records to pair chronologically. Defaults to ${EVIDENCE_LIMITS.defaultCaptures}.`,
    },
  },
  required: ["caseId"],
} as const;

const inspectChangeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    caseId: {
      type: "string",
      minLength: 1,
      maxLength: EVIDENCE_LIMITS.caseId,
      description: "Case identifier returned by scope_archive_case.",
    },
    changeId: {
      type: "string",
      minLength: 1,
      maxLength: EVIDENCE_LIMITS.changeId,
      description: "Pinned change identifier returned by find_change_windows.",
    },
    focus: {
      type: "string",
      maxLength: EVIDENCE_LIMITS.focus,
      description: "Optional phrase used to select the most relevant diff lines.",
    },
  },
  required: ["caseId", "changeId"],
} as const;

const pinFindingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    caseId: {
      type: "string",
      minLength: 1,
      maxLength: EVIDENCE_LIMITS.caseId,
      description: "Case identifier returned by scope_archive_case.",
    },
    changeId: {
      type: "string",
      minLength: 1,
      maxLength: EVIDENCE_LIMITS.changeId,
      description: "Inspected change identifier returned by find_change_windows.",
    },
    relation: {
      type: "string",
      enum: ["supports", "contradicts", "context"],
      description: "How the archived change relates to the case question.",
    },
    finding: {
      type: "string",
      minLength: 1,
      maxLength: EVIDENCE_LIMITS.finding,
      description: "Interpretation to pin beside, but separate from, the evidence.",
    },
  },
  required: ["caseId", "changeId", "relation", "finding"],
} as const;

export interface ScopeCaseInput {
  readonly target: string;
  readonly question: string;
  readonly from?: string;
  readonly to?: string;
}

export interface FindChangesInput {
  readonly caseId: string;
  readonly provider?: EvidenceProvider;
  readonly maxCaptures?: number;
}

export interface InspectChangeInput {
  readonly caseId: string;
  readonly changeId: string;
  readonly focus?: string;
}

export interface PinFindingInput {
  readonly caseId: string;
  readonly changeId: string;
  readonly relation: "supports" | "contradicts" | "context";
  readonly finding: string;
}

/** Operations behind the WebMCP descriptors, separated so schemas can be tested without a browser implementation. */
export interface EvidenceToolActions {
  readonly scopeCase: (input: Readonly<ScopeCaseInput>, signal: AbortSignal) => Promise<unknown>;
  readonly findChanges: (
    input: Readonly<FindChangesInput>,
    signal: AbortSignal,
  ) => Promise<unknown>;
  readonly inspectChange: (
    input: Readonly<InspectChangeInput>,
    signal: AbortSignal,
  ) => Promise<unknown>;
  readonly pinFinding: (input: Readonly<PinFindingInput>) => Promise<unknown>;
}

/**
 * Builds the complete WebMCP surface of distinct archive investigation tools.
 *
 * @param actions - Browser operations behind the tool descriptors.
 * @returns {ReadonlyArray<WebMCP.ModelContextTool>} The four tools in protocol order.
 */
export function createEvidenceTools(actions: Readonly<EvidenceToolActions>) {
  const scopeCase: WebMCP.ModelContextToolFromSchema<typeof scopeCaseSchema> = {
    name: EVIDENCE_TOOL_NAMES[0],
    title: "Scope archive case",
    description:
      "Start one historical evidence case. Checks coverage across archives, opens the shared Evidence Room, and recommends the archive most likely to support a chronological comparison.",
    inputSchema: scopeCaseSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input, { signal }) => actions.scopeCase(input, signal),
  };

  const findChanges: WebMCP.ModelContextToolFromSchema<typeof findChangesSchema> = {
    name: EVIDENCE_TOOL_NAMES[1],
    title: "Find change windows",
    description:
      "Find bounded consecutive capture windows for the active case without downloading page bodies. Returns change IDs that preserve provenance and updates the shared Evidence Room.",
    inputSchema: findChangesSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input, { signal }) => actions.findChanges(input, signal),
  };

  const inspectChange: WebMCP.ModelContextToolFromSchema<typeof inspectChangeSchema> = {
    name: EVIDENCE_TOOL_NAMES[2],
    title: "Inspect archive change",
    description:
      "Inspect one pinned change window. Returns a short untrusted diff excerpt with exact capture provenance and shows the same evidence to the user in the Evidence Room.",
    inputSchema: inspectChangeSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input, { signal }) => actions.inspectChange(input, signal),
  };

  const pinFinding: WebMCP.ModelContextToolFromSchema<typeof pinFindingSchema> = {
    name: EVIDENCE_TOOL_NAMES[3],
    title: "Pin archive finding",
    description: `Pin an interpretation of an inspected archive change as support, contradiction, or context. Keeps the agent's claim separate from the cited archived evidence for human review; one case holds at most ${EVIDENCE_LIMITS.findings} findings.`,
    inputSchema: pinFindingSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => actions.pinFinding(input),
  };

  return [scopeCase, findChanges, inspectChange, pinFinding] as const;
}

/**
 * Indents data so it cannot add Markdown structure to an exported case.
 *
 * @param value - Untrusted text or text written by an agent.
 * @returns {string} An indented Markdown data block.
 */
export function markdownData(value: string): string {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split(/[\n\u2028\u2029]/u)
    .map((line) => `    ${line}`)
    .join("\n");
}

export interface EvidenceArchivePage {
  readonly url: string;
  readonly timestamp: string;
  readonly snapshot: string;
  readonly _meta: Readonly<Record<string, unknown>>;
}

/**
 * Rebuilds a page citation from the capture the diff actually resolved.
 *
 * @param capture - Authoritative capture summary returned by the diff executor.
 * @returns {EvidenceArchivePage} A page record without stale listing metadata.
 */
export function resolvedArchivePage(
  capture: Readonly<ArchivedContentSummary>,
): EvidenceArchivePage {
  if (!parsedHttpUrl(capture.url) || !parsedHttpUrl(capture.snapshot)) {
    throw new Error("Resolved archive provenance must use HTTP(S) URLs without credentials.");
  }
  return {
    url: capture.url,
    timestamp: capture.timestamp,
    snapshot: capture.snapshot,
    _meta: {
      provider: capture.provider,
      source: capture.provider,
      ...(capture.archive ? { archive: capture.archive } : {}),
      ...(capture.mime ? { mime: capture.mime } : {}),
      bytes: capture.bytes,
      truncated: capture.truncated,
    },
  };
}

export interface CandidateCapturePair {
  readonly before: EvidenceArchivePage;
  readonly after: EvidenceArchivePage;
  readonly spanDays: number;
  readonly digestChanged?: boolean;
  readonly byteDelta?: number;
}

function parsedHttpUrl(value: string, addDefaultScheme = false): URL | undefined {
  try {
    const url = new URL(addDefaultScheme && !value.includes("://") ? `https://${value}` : value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return undefined;
    }
    url.hash = "";
    return url;
  } catch {
    return undefined;
  }
}

function comparableUrl(value: string): string | undefined {
  return parsedHttpUrl(value)?.href;
}

interface ResourceScope {
  readonly host: string;
  readonly pathQuery: string;
}

function resourceScope(value: string, addDefaultScheme = false): ResourceScope | undefined {
  const url = parsedHttpUrl(value, addDefaultScheme);
  if (!url) return undefined;
  const hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
  const port = url.port === "80" || url.port === "443" ? "" : url.port;
  return { host: `${hostname}:${port}`, pathQuery: `${url.pathname}${url.search}` };
}

function matchesTarget(page: EvidenceArchivePage, target: ResourceScope): boolean {
  const pageScope = resourceScope(page.url);
  if (!pageScope || pageScope.host !== target.host) return false;
  return target.pathQuery === "/" || pageScope.pathQuery === target.pathQuery;
}

function elapsedDays(before: string, after: string): number {
  return Math.max(0, Math.round((Date.parse(after) - Date.parse(before)) / 86_400_000));
}

function metadataText(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function metadataNumber(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const raw = metadata[key];
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  if (typeof raw === "string" && !raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function candidateGroupKey(page: EvidenceArchivePage, target: ResourceScope): string | undefined {
  if (!matchesTarget(page, target)) return undefined;
  const urlKey = comparableUrl(page.url);
  if (!urlKey) return undefined;
  const provider = metadataText(page._meta, "provider");
  if (!provider) return undefined;
  if (provider !== "memento") return `${provider}\u0000${urlKey}`;
  const archive = metadataText(page._meta, "archive");
  return archive ? `${provider}\u0000${urlKey}\u0000${archive}` : undefined;
}

function groupCandidatePages(
  pages: readonly EvidenceArchivePage[],
  target: ResourceScope,
): Map<string, EvidenceArchivePage[]> {
  const groups = new Map<string, EvidenceArchivePage[]>();
  const seen = new Set<string>();
  for (const page of pages) {
    const key = candidateGroupKey(page, target);
    if (!key) continue;
    const identity = `${page.timestamp}|${key}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const group = groups.get(key) ?? [];
    group.push(page);
    groups.set(key, group);
  }
  return groups;
}

function digestChange(
  before: EvidenceArchivePage,
  after: EvidenceArchivePage,
): boolean | undefined {
  const beforeDigest = metadataText(before._meta, "digest");
  const afterDigest = metadataText(after._meta, "digest");
  return beforeDigest && afterDigest ? beforeDigest !== afterDigest : undefined;
}

function candidatePair(
  before: EvidenceArchivePage,
  after: EvidenceArchivePage,
): CandidateCapturePair | undefined {
  const beforeTime = Date.parse(before.timestamp);
  const afterTime = Date.parse(after.timestamp);
  if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime) || beforeTime >= afterTime) {
    return undefined;
  }
  const digestChanged = digestChange(before, after);
  if (digestChanged === false) return undefined;
  const beforeLength = metadataNumber(before._meta, "length");
  const afterLength = metadataNumber(after._meta, "length");
  const byteDelta =
    beforeLength === undefined || afterLength === undefined
      ? undefined
      : afterLength - beforeLength;
  return {
    before,
    after,
    spanDays: elapsedDays(before.timestamp, after.timestamp),
    ...(digestChanged === undefined ? {} : { digestChanged }),
    ...(byteDelta === undefined ? {} : { byteDelta }),
  };
}

function pairCandidateGroup(group: readonly EvidenceArchivePage[]): CandidateCapturePair[] {
  const sorted = group.toSorted((a, b) => a.timestamp.localeCompare(b.timestamp));
  const pairs: CandidateCapturePair[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const pair = candidatePair(sorted[index - 1]!, sorted[index]!);
    if (pair) pairs.push(pair);
  }
  return pairs;
}

/**
 * Pairs only consecutive captures of the same exact original URL.
 *
 * @param pages - Bounded archive index rows.
 * @param target - Exact scoped URL or domain.
 * @returns {CandidateCapturePair[]} Ranked pairs with provider and Memento provenance intact.
 */
export function buildCandidatePairs(
  pages: readonly EvidenceArchivePage[],
  target: string,
): CandidateCapturePair[] {
  const targetScope = resourceScope(target, true);
  if (!targetScope) return [];
  const pairs = [...groupCandidatePages(pages, targetScope).values()].flatMap(pairCandidateGroup);
  return pairs.toSorted(
    (a, b) =>
      Number(b.digestChanged === true) - Number(a.digestChanged === true) ||
      b.after.timestamp.localeCompare(a.after.timestamp),
  );
}

/**
 * Selects a compact diff window, preferring focused changed lines.
 *
 * @param patch - Unified diff text.
 * @param focus - Optional terms used to rank changed lines.
 * @param maxCharacters - Maximum returned excerpt length.
 * @returns {string} A bounded excerpt, or an empty string for an empty patch.
 */
export function selectDiffExcerpt(
  patch: string,
  focus = "",
  maxCharacters = EVIDENCE_LIMITS.excerpt,
): string {
  if (!patch || maxCharacters < 1) {
    return "";
  }
  const lines = patch.split("\n");
  let insideHunk = false;
  const changed = lines
    .map((line, index) => {
      if (line.startsWith("@@")) {
        insideHunk = true;
      }
      return { line, index, insideHunk };
    })
    .filter(
      ({ line, insideHunk: isInsideHunk }) =>
        isInsideHunk && (line.startsWith("+") || line.startsWith("-")),
    );
  if (!changed.length) {
    return patch.slice(0, maxCharacters);
  }

  const terms = focus
    .toLowerCase()
    .split(/\s+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  const ranked = changed
    .map((candidate) => ({
      ...candidate,
      score: terms.reduce(
        (score, term) => score + (candidate.line.toLowerCase().includes(term) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const center = ranked[0]!.index;
  const excerpt = lines
    .slice(Math.max(0, center - 2), Math.min(lines.length, center + 3))
    .join("\n");
  if (excerpt.length <= maxCharacters) {
    return excerpt;
  }
  return `${excerpt.slice(0, Math.max(0, maxCharacters - 1))}…`;
}
