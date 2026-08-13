import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Type, type Static } from "@oh-my-pi/omptype/typebox";
import type {
  ArchiveOptions,
  ArchiveProvider,
  ArchiveResponse,
  ArchivedPage,
} from "@agntn/archives";

type ArchivesModule = typeof import("@agntn/archives");

type ProviderInput = (typeof PROVIDERS)[number];
type ProviderName = Exclude<ProviderInput, "auto">;

type SnapshotOptions = ArchiveOptions & {
  apiKey?: string;
  collection?: string;
  collapse?: string;
  filter?: string;
};

interface PermaccApiKeyState {
  envName: string | undefined;
  apiKey: string | undefined;
}

type SnapshotDetails = {
  mode: "snapshots";
  target: string;
  provider: ProviderName;
  options: RedactedSnapshotOptions;
  count: number;
  response: ArchiveResponse;
};

type ProviderStatus = {
  name: ProviderName;
  factory: string;
  includedInAll: boolean;
  requiresApiKey: boolean;
  configured: boolean;
  note: string;
};

type ProvidersDetails = {
  providers: ProviderStatus[];
};

type RedactedSnapshotOptions = Omit<SnapshotOptions, "apiKey"> & {
  apiKey?: "<redacted>";
};
const sourceModulePath = fileURLToPath(new URL("../../../src/index.ts", import.meta.url));

let archivesModulePromise: Promise<ArchivesModule> | undefined;

function loadArchives(): Promise<ArchivesModule> {
  if (archivesModulePromise) return archivesModulePromise;

  archivesModulePromise = existsSync(sourceModulePath)
    ? import("../../../src/index.ts")
    : import("@agntn/archives");
  return archivesModulePromise;
}

const PROVIDERS = [
  "auto",
  "all",
  "wayback",
  "archiveIt",
  "archiveToday",
  "commoncrawl",
  "webcite",
  "permacc",
] as const;
const PROVIDER_HINT = `Provider to use. One of: ${PROVIDERS.join(", ")}. "auto" (or omit) uses "all", which queries Wayback, Archive.today, Common Crawl, and WebCite. Archive-It requires a numeric collection id. Perma.cc requires an API key from an environment variable and searches exact URLs accessible to that account.`;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const PERMACC_API_KEY_ENVS = ["PERMA_CC_API_KEY", "PERMACC_API_KEY"] as const;
// oxlint-disable-next-line no-control-regex -- Terminal control bytes are precisely what this boundary removes.
const UNSAFE_TERMINAL_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu;

function sanitizeTerminalText(text: string): string {
  return text.replace(UNSAFE_TERMINAL_CONTROLS, "");
}

const snapshotParameters = Type.Object({
  target: Type.String({ description: "Domain or URL to search for archived snapshots." }),
  provider: Type.Optional(Type.String({ description: PROVIDER_HINT })),
  limit: Type.Optional(
    Type.Integer({
      description: `Maximum snapshots to return. Defaults to ${DEFAULT_LIMIT}.`,
      minimum: 1,
      maximum: MAX_LIMIT,
    }),
  ),
  cache: Type.Optional(
    Type.Boolean({ description: "Enable or disable archives response caching." }),
  ),
  ttl: Type.Optional(Type.Integer({ description: "Cache TTL in milliseconds.", minimum: 0 })),
  concurrency: Type.Optional(
    Type.Integer({ description: "Maximum parallel provider requests.", minimum: 1, maximum: 10 }),
  ),
  batchSize: Type.Optional(
    Type.Integer({
      description: "Provider batch size for parallel work.",
      minimum: 1,
      maximum: 100,
    }),
  ),
  timeout: Type.Optional(
    Type.Integer({ description: "Request timeout in milliseconds.", minimum: 1 }),
  ),
  retries: Type.Optional(
    Type.Integer({ description: "Retry attempts for failed requests.", minimum: 0 }),
  ),
  collection: Type.Optional(
    Type.String({
      description:
        "Archive-It numeric collection id, or Common Crawl collection id such as CC-MAIN-latest.",
    }),
  ),
  collapse: Type.Optional(
    Type.String({ description: "Wayback CDX collapse parameter, e.g. timestamp:4." }),
  ),
  filter: Type.Optional(Type.String({ description: "Wayback CDX filter parameter." })),
});

const emptyParameters = Type.Object({});

type SnapshotParams = Static<typeof snapshotParameters>;
type EmptyParams = Static<typeof emptyParameters>;

export default function archivesOmpExtension(pi: ExtensionAPI) {
  const { Text } = pi.pi;
  pi.setLabel("Archives");
  pi.registerTool<typeof snapshotParameters, SnapshotDetails>({
    name: "archives",
    label: "Archives Snapshots",
    description:
      "Read-only/open-world network fetch: query web archive providers for archived snapshots of a domain or URL. Returns normalized pages with {url, timestamp, snapshot, _meta}. provider=all fans out to Wayback Machine, Archive.today, Common Crawl, and WebCite; provider=permacc reads its API key from PERMA_CC_API_KEY or PERMACC_API_KEY and searches one exact URL.",
    approval: "read",
    parameters: snapshotParameters,
    renderCall(args, _options, theme) {
      return new Text(renderSnapshotCall(args, theme), 0, 0);
    },
    async execute(_toolCallId, params) {
      const target = params.target.trim();
      if (!target) {
        throw new Error("Target cannot be empty");
      }

      const provider = normalizeProvider(params.provider);
      const options = buildSnapshotOptions(params, provider);
      const archives = await loadArchives();
      const archiveProvider = await createProvider(archives, provider, options);
      const archive = archives.createArchive(archiveProvider, options);
      const response = await archive.snapshots(target, options);
      const header = buildSnapshotHeader(provider, target, response);

      return {
        content: [{ type: "text", text: withHeader(header, formatSnapshotResponse(response)) }],
        details: {
          mode: "snapshots",
          target,
          provider,
          options: redactOptions(options),
          count: response.pages.length,
          response: sanitizeResponse(response),
        },
      };
    },
  });

  pi.registerTool<typeof emptyParameters, ProvidersDetails>({
    name: "archives_providers",
    label: "Archives Providers",
    description:
      "Read-only/idempotent local/env status: list built-in archives providers, whether they are included in provider=all, and whether Perma.cc has an API key environment variable configured.",
    approval: "read",
    parameters: emptyParameters,
    renderCall(_args, _options, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("archives_providers")), 0, 0);
    },
    async execute(_toolCallId: string, _params: EmptyParams) {
      const statuses = getProviderStatuses();
      return {
        content: [
          { type: "text", text: statuses.map((status) => formatProviderStatus(status)).join("\n") },
        ],
        details: { providers: statuses },
      };
    },
  });

  pi.registerCommand("archive", {
    description: "Search web archives with archives: /archive [domain-or-url]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const initial = args.trim();
      const target =
        initial || (await ctx.ui.input("Search web archives", "Enter a domain or URL"));
      if (!target?.trim()) return;

      const trimmed = target.trim();
      let response: ArchiveResponse;
      try {
        const archives = await loadArchives();
        const options: SnapshotOptions = { limit: DEFAULT_LIMIT };
        const archive = archives.createArchive(await archives.providers.wayback(options), options);
        response = await archive.snapshots(trimmed, options);
      } catch (error) {
        ctx.ui.notify(`archives failed: ${errorMessage(error)}`, "error");
        return;
      }

      if (!response.success) {
        ctx.ui.notify(`archives failed: ${responseFailureMessage(response)}`, "error");
        return;
      }

      if (response.pages.length === 0) {
        ctx.ui.notify(
          `No archived snapshots for "${sanitizeTerminalText(trimmed)}" via Wayback.`,
          "warning",
        );
        return;
      }

      const labels = response.pages.map((page) => formatPage(page));
      const selected = await ctx.ui.select(`archives — ${sanitizeTerminalText(trimmed)}`, labels);
      if (!selected) return;

      const picked = response.pages[labels.indexOf(selected)];
      if (!picked) return;

      const safeSnapshot = sanitizeTerminalText(picked.snapshot);
      ctx.ui.pasteToEditor(safeSnapshot);
      ctx.ui.notify(`Pasted ${safeSnapshot}`, "info");
    },
  });

  pi.registerCommand("archive-providers", {
    description: "List archives providers",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(
        getProviderStatuses()
          .map((status) => formatProviderStatus(status))
          .join("\n"),
        "info",
      );
    },
  });
}

async function createProvider(
  archives: ArchivesModule,
  provider: ProviderName,
  options: SnapshotOptions,
): Promise<ArchiveProvider | ArchiveProvider[]> {
  if (provider === "all") return archives.providers.all(options);
  if (provider === "wayback") return archives.providers.wayback(options);
  if (provider === "archiveIt") {
    const collection = options.collection?.trim();
    if (collection === undefined || !/^\d+$/.test(collection)) {
      throw new Error("provider=archiveIt requires a numeric collection id.");
    }
    return archives.providers.archiveIt({
      ...options,
      collection,
    });
  }
  if (provider === "archiveToday") return archives.providers.archiveToday(options);
  if (provider === "commoncrawl") return archives.providers.commoncrawl(options);
  if (provider === "webcite") return archives.providers.webcite(options);
  return archives.providers.permacc(options as SnapshotOptions & { apiKey: string });
}

function normalizeProvider(provider: string | undefined): ProviderName {
  const raw = (provider ?? "auto").trim() || "auto";
  if (raw === "archive-today") return "archiveToday";
  if (raw === "archive-it") return "archiveIt";
  if (!isKnownProvider(raw)) {
    throw new Error(`Unknown provider "${raw}". Available: ${PROVIDERS.join(", ")}.`);
  }
  return raw === "auto" ? "all" : raw;
}

function isKnownProvider(name: string): name is ProviderInput {
  return (PROVIDERS as readonly string[]).includes(name);
}

function buildSnapshotOptions(params: SnapshotParams, provider: ProviderName): SnapshotOptions {
  const limit = params.limit ?? DEFAULT_LIMIT;
  if (limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be between 1 and ${MAX_LIMIT}`);
  }

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

function redactOptions(options: SnapshotOptions): RedactedSnapshotOptions {
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
  const errorNote = response.error ? `; error=${truncateSingleLine(response.error, 80)}` : "";
  return `[provider=${provider}] ${response.pages.length} snapshot(s) for "${target}"${unsupportedNote}${errorNote}`;
}

function sanitizeResponse(response: ArchiveResponse): ArchiveResponse {
  const meta = response._meta;
  if (!meta || !("errorDetails" in meta)) return response;
  const { errorDetails: _errorDetails, ...safeMeta } = meta;
  return { ...response, _meta: { ...safeMeta, errorDetails: "<redacted>" } };
}

function errorMessage(error: unknown): string {
  return sanitizeTerminalText(error instanceof Error ? error.message : String(error));
}

function responseFailureMessage(response: ArchiveResponse): string {
  return sanitizeTerminalText(
    response.error ?? response.unsupportedReason ?? "Failed to fetch archive snapshots",
  );
}

function withHeader(header: string, body: string[]): string {
  const joined = body.join("\n");
  return sanitizeTerminalText(joined ? `${header}\n\n${joined}` : `${header}\nNo snapshots.`);
}

function formatSnapshotResponse(response: ArchiveResponse): string[] {
  const lines = response.pages.map((page, index) => formatPage(page, index));
  const unsupported = response._meta?.unsupportedProviders;
  if (Array.isArray(unsupported) && unsupported.length > 0) {
    lines.push("", "Unsupported providers:");
    for (const item of unsupported) {
      if (isUnsupportedRecord(item)) {
        lines.push(`  ${item.provider}: ${item.reason}`);
      }
    }
  }
  if (response.unsupportedReason) {
    lines.push("", `Unsupported: ${response.unsupportedReason}`);
  }
  if (response.error) {
    lines.push("", `Error: ${response.error}`);
  }
  return lines;
}

function formatPage(page: ArchivedPage, index?: number): string {
  const head = index === undefined ? "" : `${index + 1}. `;
  const provider = typeof page._meta.provider === "string" ? ` [${page._meta.provider}]` : "";
  return sanitizeTerminalText(
    `${head}${page.timestamp}${provider}\n   ${page.snapshot}\n   original: ${page.url}`,
  );
}

function formatProviderStatus(status: ProviderStatus): string {
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

function renderSnapshotCall(params: SnapshotParams, theme: RenderTheme): string {
  const parts = [theme.fg("toolTitle", theme.bold("archives"))];
  parts.push(theme.fg("dim", truncateSingleLine(sanitizeTerminalText(params.target), 120)));
  if (params.provider)
    parts.push(theme.fg("muted", `provider=${sanitizeTerminalText(params.provider)}`));
  if (params.limit !== undefined) parts.push(theme.fg("muted", `limit=${params.limit}`));
  if (params.collection)
    parts.push(theme.fg("muted", `collection=${sanitizeTerminalText(params.collection)}`));
  if (params.timeout !== undefined) parts.push(theme.fg("muted", `timeout=${params.timeout}`));
  return parts.join(" ");
}

function truncateSingleLine(text: string, maxLength: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length <= maxLength ? singleLine : `${singleLine.slice(0, maxLength - 1)}…`;
}

type RenderTheme = {
  bold(text: string): string;
  fg(color: string, text: string): string;
};
