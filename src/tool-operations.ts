/**
 * Tool executors shared by the MCP server and the Pi and OMP extensions.
 *
 * Each executor returns the text a caller reads plus the structured details the
 * agent harnesses attach to the call. An MCP client sees only the text, so every
 * fact needed for a follow-up call has to be in it.
 *
 * Providers are built through the same lazy factory the public API exposes, so a
 * surface never reaches past `providers` into a provider module.
 */

import { createArchive } from "./archive";
import { providers } from "./providers";
import type { ArchiveOptions, ArchiveResponse, ArchivedPage } from "./types";

/** One text block plus the details a harness renders next to it. */
export interface ToolResult<TDetails> {
  content: Array<{ type: "text"; text: string }>;
  details: TDetails;
  /** Set when the operation ran but produced no usable answer. */
  isError?: boolean;
}

/** Provider names accepted in tool arguments; `auto` resolves to `all`. */
export const PROVIDERS = [
  "auto",
  "all",
  "wayback",
  "archiveIt",
  "archiveToday",
  "commoncrawl",
  "webcite",
  "permacc",
] as const;

/** Kebab spellings accepted alongside the camelCase names. */
export const PROVIDER_ALIASES = {
  "archive-today": "archiveToday",
  "archive-it": "archiveIt",
} as const;

/** Every spelling a caller may pass, for surfaces that enumerate them in a schema. */
export const PROVIDER_INPUTS = [
  ...PROVIDERS,
  ...(Object.keys(PROVIDER_ALIASES) as Array<keyof typeof PROVIDER_ALIASES>),
] as const;

export type ProviderInput = (typeof PROVIDERS)[number];
export type ProviderName = Exclude<ProviderInput, "auto">;

export const PROVIDER_HINT = `Provider to use. "auto" (or omit) uses "all", which queries Wayback, Archive.today, Common Crawl, and WebCite. Archive-It requires a numeric collection id. Perma.cc requires an API key from an environment variable and searches exact URLs accessible to that account.`;

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;
export const MAX_TARGET_LENGTH = 2048;
export const MAX_PARAMETER_LENGTH = 256;
export const MAX_TTL = 30 * 24 * 60 * 60 * 1000;
export const MAX_RETRIES = 10;
export const MAX_TIMEOUT = 5 * 60 * 1000;
export const PERMACC_API_KEY_ENVS = ["PERMA_CC_API_KEY", "PERMACC_API_KEY"] as const;

// oxlint-disable-next-line no-control-regex -- Terminal control bytes are precisely what this boundary removes.
const UNSAFE_TERMINAL_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu;

/** Options passed to a provider factory, including the provider-specific extras. */
export type SnapshotOptions = ArchiveOptions & {
  apiKey?: string;
  collection?: string;
  collapse?: string;
  filter?: string;
};

/** Snapshot options as they reach a harness transcript: never carrying the key. */
export type RedactedSnapshotOptions = Omit<SnapshotOptions, "apiKey"> & {
  apiKey?: "<redacted>";
};

/** Arguments of the snapshot tool, shared by every surface's schema. */
export interface SnapshotParams {
  target: string;
  provider?: string;
  limit?: number;
  cache?: boolean;
  ttl?: number;
  concurrency?: number;
  batchSize?: number;
  timeout?: number;
  retries?: number;
  collection?: string;
  collapse?: string;
  filter?: string;
}

/** The queried window plus the response it came from. */
export interface SnapshotDetails {
  mode: "snapshots";
  target: string;
  provider: ProviderName;
  options: RedactedSnapshotOptions;
  count: number;
  response: ArchiveResponse;
}

/** One provider row, as listed by {@link listArchiveProviders}. */
export interface ProviderStatus {
  name: ProviderName;
  factory: string;
  includedInAll: boolean;
  requiresApiKey: boolean;
  configured: boolean;
  note: string;
}

/** Every built-in provider and whether it is usable on this machine. */
export interface ProvidersDetails {
  providers: ProviderStatus[];
}

interface PermaccApiKeyState {
  envName: string | undefined;
  apiKey: string | undefined;
}

/**
 * Queries one provider (or every provider in `all`) for archived snapshots.
 *
 * @param params - Tool arguments; `target` is a domain or URL
 * @returns Rendered snapshot list plus the raw response
 * @throws When the target is empty, the provider is unknown, or its prerequisites are missing
 */
export async function snapshotArchives(
  params: SnapshotParams,
): Promise<ToolResult<SnapshotDetails>> {
  const target = params.target.trim();
  if (!target) {
    throw new Error("Target cannot be empty");
  }
  if (target.length > MAX_TARGET_LENGTH) {
    throw new Error(`Target must be at most ${MAX_TARGET_LENGTH} characters`);
  }

  const provider = normalizeProvider(params.provider);
  const options = buildSnapshotOptions(params, provider);
  const archiveProvider = await createProvider(provider, options);
  const archive = createArchive(archiveProvider, options);
  const response = await archive.snapshots(target, options);

  return {
    content: [
      {
        type: "text",
        text: withHeader(
          buildSnapshotHeader(provider, target, response),
          formatSnapshots(response),
        ),
      },
    ],
    // A query that reached no provider successfully is a failed call, not an
    // empty archive: a client branching on `isError` must not read it as
    // "no snapshots exist".
    ...(response.success ? {} : { isError: true }),
    details: {
      mode: "snapshots",
      target,
      provider,
      options: redactOptions(options),
      count: response.pages.length,
      response: sanitizeResponse(response),
    },
  };
}

/** Lists the built-in providers, their `provider=all` membership, and Perma.cc key state. */
export function listArchiveProviders(): ToolResult<ProvidersDetails> {
  const statuses = getProviderStatuses();
  return {
    content: [
      { type: "text", text: statuses.map((status) => formatProviderStatus(status)).join("\n") },
    ],
    details: { providers: statuses },
  };
}

/** Wayback-only lookup backing the interactive `/archive` command. */
export async function waybackSnapshots(
  target: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ArchiveResponse> {
  const options: SnapshotOptions = { limit };
  const archive = createArchive(await providers.wayback(options), options);
  return archive.snapshots(target, options);
}

async function createProvider(
  provider: ProviderName,
  options: SnapshotOptions,
): Promise<ArchiveProviderOrList> {
  if (provider === "all") return providers.all(options);
  if (provider === "wayback") return providers.wayback(options);
  if (provider === "archiveIt") {
    const collection = options.collection?.trim();
    if (collection === undefined || !/^\d+$/.test(collection)) {
      throw new Error("provider=archiveIt requires a numeric collection id.");
    }
    return providers.archiveIt({ ...options, collection });
  }
  if (provider === "archiveToday") return providers.archiveToday(options);
  if (provider === "commoncrawl") return providers.commoncrawl(options);
  if (provider === "webcite") return providers.webcite(options);
  if (provider === "permacc") {
    return providers.permacc(options as SnapshotOptions & { apiKey: string });
  }
  // A new entry in PROVIDERS reaches here instead of silently querying Perma.cc.
  const unhandled: never = provider;
  throw new Error(`Provider "${String(unhandled)}" has no factory.`);
}

type ArchiveProviderOrList = Awaited<
  ReturnType<typeof providers.wayback> | ReturnType<typeof providers.all>
>;

/** Resolves a user-supplied provider name, accepting the kebab-case spellings. */
export function normalizeProvider(provider: string | undefined): ProviderName {
  const raw = (provider ?? "auto").trim() || "auto";
  const alias = PROVIDER_ALIASES[raw as keyof typeof PROVIDER_ALIASES];
  if (alias) return alias;
  if (!isKnownProvider(raw)) {
    throw new Error(`Unknown provider "${raw}". Available: ${PROVIDERS.join(", ")}.`);
  }
  return raw === "auto" ? "all" : raw;
}

function isKnownProvider(name: string): name is ProviderInput {
  return (PROVIDERS as readonly string[]).includes(name);
}

/** Numeric bounds every surface's schema restates, enforced once where it matters. */
const NUMERIC_BOUNDS = {
  limit: { minimum: 1, maximum: MAX_LIMIT },
  ttl: { minimum: 0, maximum: MAX_TTL },
  concurrency: { minimum: 1, maximum: 10 },
  batchSize: { minimum: 1, maximum: 100 },
  timeout: { minimum: 1, maximum: MAX_TIMEOUT },
  retries: { minimum: 0, maximum: MAX_RETRIES },
} as const satisfies Record<string, { minimum: number; maximum: number }>;

const TEXT_BOUNDS = {
  collection: MAX_PARAMETER_LENGTH,
  collapse: MAX_PARAMETER_LENGTH,
  filter: MAX_PARAMETER_LENGTH,
} as const satisfies Record<string, number>;

/**
 * Rejects an out-of-range argument the same way on every surface.
 *
 * A schema is the first line, not the only one: a fractional `limit` that slips
 * past one reaches the CDX query as `&limit=10.5`, which Wayback answers by
 * never returning.
 */
function checkNumber(name: keyof typeof NUMERIC_BOUNDS, value: number | undefined): void {
  if (value === undefined) return;
  const { minimum, maximum } = NUMERIC_BOUNDS[name];
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be a whole number`);
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
}

function checkText(name: keyof typeof TEXT_BOUNDS, value: string | undefined): void {
  if (value === undefined) return;
  if (value.length > TEXT_BOUNDS[name]) {
    throw new Error(`${name} must be at most ${TEXT_BOUNDS[name]} characters`);
  }
}

function buildSnapshotOptions(params: SnapshotParams, provider: ProviderName): SnapshotOptions {
  for (const name of Object.keys(NUMERIC_BOUNDS) as Array<keyof typeof NUMERIC_BOUNDS>) {
    checkNumber(name, params[name]);
  }
  for (const name of Object.keys(TEXT_BOUNDS) as Array<keyof typeof TEXT_BOUNDS>) {
    checkText(name, params[name]);
  }

  const limit = params.limit ?? DEFAULT_LIMIT;
  const options: SnapshotOptions = { limit };
  if (params.cache !== undefined) options.cache = params.cache;
  if (params.ttl !== undefined) options.ttl = params.ttl;
  if (params.concurrency !== undefined) options.concurrency = params.concurrency;
  if (params.batchSize !== undefined) options.batchSize = params.batchSize;
  if (params.timeout !== undefined) options.timeout = params.timeout;
  if (params.retries !== undefined) options.retries = params.retries;
  if (params.collection !== undefined) options.collection = params.collection;
  if (params.collapse !== undefined) options.collapse = params.collapse;
  if (params.filter !== undefined) options.filter = params.filter;

  if (provider === "permacc") {
    const { apiKey } = getPermaccApiKeyState();
    if (!apiKey) {
      throw new Error(
        `Perma.cc provider requires an API key in ${PERMACC_API_KEY_ENVS.join(" or ")}.`,
      );
    }
    options.apiKey = apiKey;
  }

  return options;
}

/** Strips the Perma.cc key before options reach a transcript or a tool result. */
export function redactOptions(options: SnapshotOptions): RedactedSnapshotOptions {
  const { apiKey: _apiKey, ...rest } = options;
  return options.apiKey ? { ...rest, apiKey: "<redacted>" } : rest;
}

function getPermaccApiKeyState(): PermaccApiKeyState {
  for (const envName of PERMACC_API_KEY_ENVS) {
    const apiKey = process.env[envName];
    if (apiKey) {
      return { envName, apiKey };
    }
  }
  return { envName: undefined, apiKey: undefined };
}

function getProviderStatuses(): ProviderStatus[] {
  const { envName } = getPermaccApiKeyState();
  const permaccConfigured = envName !== undefined;
  return [
    {
      name: "all",
      factory: "providers.all()",
      includedInAll: false,
      requiresApiKey: false,
      configured: true,
      note: "Queries Wayback, Archive.today, Common Crawl, and WebCite; excludes Perma.cc.",
    },
    {
      name: "wayback",
      factory: "providers.wayback()",
      includedInAll: true,
      requiresApiKey: false,
      configured: true,
      note: "Internet Archive CDX API.",
    },
    {
      name: "archiveIt",
      factory: "providers.archiveIt({ collection })",
      includedInAll: false,
      requiresApiKey: false,
      configured: true,
      note: "Archive-It collection CDX/C API; requires a numeric collection.",
    },
    {
      name: "archiveToday",
      factory: "providers.archiveToday()",
      includedInAll: true,
      requiresApiKey: false,
      configured: true,
      note: "Archive.today Memento timemap.",
    },
    {
      name: "commoncrawl",
      factory: "providers.commoncrawl()",
      includedInAll: true,
      requiresApiKey: false,
      configured: true,
      note: "Common Crawl CDX API; accepts collection.",
    },
    {
      name: "webcite",
      factory: "providers.webcite()",
      includedInAll: true,
      requiresApiKey: false,
      configured: true,
      note: "Returns unsupported for list-by-domain snapshots.",
    },
    {
      name: "permacc",
      factory: "providers.permacc()",
      includedInAll: false,
      requiresApiKey: true,
      configured: permaccConfigured,
      note: permaccConfigured
        ? `${envName} is set; provider=permacc searches this account for one exact URL.`
        : `${PERMACC_API_KEY_ENVS.join("/")} is not set; provider=permacc needs one of them and an exact URL.`,
    },
  ];
}

function buildSnapshotHeader(
  provider: ProviderName,
  target: string,
  response: ArchiveResponse,
): string {
  const unsupported = response._meta?.unsupportedProviders;
  const unsupportedNote =
    Array.isArray(unsupported) && unsupported.length > 0
      ? `; unsupported=${unsupported.length}`
      : "";
  const failed = providerErrors(response);
  const failedNote = failed.length > 0 ? `; failed=${failed.length}` : "";
  const errorNote = response.error ? `; error=${truncateSingleLine(response.error, 80)}` : "";
  // The tool is annotated open-world, so a replay from the 7-day cache has to say
  // so rather than pass for a fresh read of the archive.
  const cacheNote = response.fromCache ? "; cached" : "";
  // The target is caller-supplied and lands one line above the records, so a
  // newline in it forges a snapshot row exactly like a provider field would.
  return `[provider=${provider}] ${response.pages.length} snapshot(s) for "${sanitizeField(target)}"${unsupportedNote}${failedNote}${errorNote}${cacheNote}`;
}

function sanitizeResponse(response: ArchiveResponse): ArchiveResponse {
  const meta = response._meta;
  if (!meta || !("errorDetails" in meta)) return response;
  const { errorDetails: _errorDetails, ...safeMeta } = meta;
  return { ...response, _meta: { ...safeMeta, errorDetails: "<redacted>" } };
}

/** Removes terminal control bytes that provider-supplied text could smuggle into a TUI. */
export function sanitizeTerminalText(text: string): string {
  return text.replace(UNSAFE_TERMINAL_CONTROLS, "");
}

/** Reduces an error of unknown shape to one safe line. */
export function errorMessage(error: unknown): string {
  return sanitizeTerminalText(error instanceof Error ? error.message : String(error));
}

/** Names why a response carries no usable pages. */
export function responseFailureMessage(response: ArchiveResponse): string {
  return sanitizeTerminalText(
    response.error ?? response.unsupportedReason ?? "Failed to fetch archive snapshots",
  );
}

function withHeader(header: string, body: string[]): string {
  const joined = body.join("\n");
  return sanitizeTerminalText(joined ? `${header}\n\n${joined}` : `${header}\nNo snapshots.`);
}

function formatSnapshots(response: ArchiveResponse): string[] {
  const lines = response.pages.map((page, index) => formatPage(page, index));
  const unsupported = response._meta?.unsupportedProviders;
  if (Array.isArray(unsupported) && unsupported.length > 0) {
    lines.push("", "Unsupported providers:");
    for (const item of unsupported) {
      if (isUnsupportedRecord(item)) {
        lines.push(`  ${sanitizeField(item.provider)}: ${sanitizeField(item.reason)}`);
      }
    }
  }
  // combineResults clears `error` as soon as one provider answered and parks the
  // rest in `_meta.errors`; without this block a partial outage reads as a
  // complete answer.
  const failed = providerErrors(response);
  if (failed.length > 0) {
    lines.push("", "Failed providers:");
    for (const failure of failed) lines.push(`  ${sanitizeField(failure)}`);
  }
  if (response.unsupportedReason) {
    lines.push("", `Unsupported: ${sanitizeField(response.unsupportedReason)}`);
  }
  if (response.error) {
    lines.push("", `Error: ${sanitizeField(response.error)}`);
  }
  return lines;
}

/** Per-provider failures, which a partially successful fan-out hides in `_meta`. */
function providerErrors(response: ArchiveResponse): string[] {
  const errors = response._meta?.errors;
  return Array.isArray(errors) ? errors.filter((entry) => typeof entry === "string") : [];
}

/**
 * Renders one archived page as the three lines every surface shows.
 *
 * Every interpolated field is provider-supplied and goes through
 * {@link sanitizeField}: a newline inside a URL would otherwise close the record
 * and forge a second entry that reads exactly like a real snapshot.
 */
export function formatPage(page: ArchivedPage, index?: number): string {
  const head = index === undefined ? "" : `${index + 1}. `;
  const provider =
    typeof page._meta.provider === "string" ? ` [${sanitizeField(page._meta.provider)}]` : "";
  return `${head}${sanitizeField(page.timestamp)}${provider}\n   ${sanitizeField(page.snapshot)}\n   original: ${sanitizeField(page.url)}`;
}

/** Reduces one untrusted field to a single line with no terminal control bytes. */
export function sanitizeField(value: string): string {
  return sanitizeTerminalText(value).replace(/[\n\r\t]/g, " ");
}

/** Renders one provider row of {@link listArchiveProviders}. */
export function formatProviderStatus(status: ProviderStatus): string {
  const symbol = status.requiresApiKey && !status.configured ? "⚠" : "✓";
  const inAll = status.includedInAll ? " in provider=all" : "";
  const api = status.requiresApiKey ? " requires API key" : "";
  return `${symbol} ${status.name} — ${status.factory}${inAll}${api}. ${status.note}`;
}

function isUnsupportedRecord(value: unknown): value is { provider: string; reason: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "provider" in value &&
    "reason" in value &&
    typeof value.provider === "string" &&
    typeof value.reason === "string"
  );
}

/** Collapses whitespace and clips text to `maxLength`, for one-line call previews. */
export function truncateSingleLine(text: string, maxLength: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length <= maxLength ? singleLine : `${singleLine.slice(0, maxLength - 1)}…`;
}
