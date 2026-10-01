/** Provider spellings, hints and bounds the tools declare. No imports, so tools.ts stays light. */

/** Provider names accepted in tool arguments; `auto` resolves to `all`. */
export const PROVIDERS = [
  "auto",
  "all",
  "wayback",
  "arquivo",
  "webarchiv",
  "archiveIt",
  "conifer",
  "archiveToday",
  "memento",
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

export const PROVIDER_HINT = `Provider to use. "auto" (or omit) uses "all", which queries Wayback, Arquivo.pt, Webarchiv Österreich, Archive.today, Common Crawl, and WebCite. Webarchiv Österreich searches one exact URL through a public CDXJ endpoint. Memento uses the public MemGator service to query several archives and stays outside "all" to avoid duplicate requests. Archive-It requires a numeric collection id. Conifer requires user and collection slugs. Perma.cc requires an API key from an environment variable and searches exact URLs accessible to that account.`;

export const CONTENT_PROVIDER_HINT = `Provider to read from. "auto" (or omit) uses "all", which tries Wayback, Arquivo.pt, Webarchiv Österreich, Archive.today, and Common Crawl. Memento reads the selected TimeMap URI directly and uses MemGator's proxy as fallback. Wayback, Arquivo.pt and Webarchiv Österreich use raw replay endpoints; Archive.today serves its rendered wrapper page rather than the original bytes. Archive-It reads bodies too, with a numeric collection id. Conifer, WebCite and Perma.cc serve no readable capture bodies and answer as unsupported.`;

/** Rendering of the archived body: readable text, or decoded text with markup intact. */
export const CONTENT_FORMATS = ["text", "raw"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CONTENT_FORMAT_HINT = `How to return the body. "text" (default) strips markup from an HTML capture and returns what a reader would see; "raw" returns the decoded capture body without stripping markup.`;

/** Most targets one snapshot call looks up, the batch cap agntn/web uses too. */
export const MAX_SNAPSHOT_TARGETS = 10;

export const SNAPSHOT_TARGET_HINT = `Domain or URL to search for archived snapshots, or a list of up to ${MAX_SNAPSHOT_TARGETS} of them looked up with the same options.`;

export const SNAPSHOT_FROM_HINT = `Earliest capture to list, as archive digits (YYYY through YYYYMMDDhhmmss) or an ISO 8601 date. Inclusive; a partial stamp starts the window at the beginning of the period it names.`;

export const SNAPSHOT_TO_HINT = `Latest capture to list, in the same formats as "from". Inclusive; a partial stamp stretches the window to the end of the period it names, so from=2019 with to=2019 covers the whole year.`;

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;
export const DEFAULT_MAX_CHARS = 20_000;
export const MAX_CONTENT_CHARS = 200_000;
export const DEFAULT_DIFF_CONTEXT = 3;
export const MAX_DIFF_CONTEXT = 100;
/** Ceiling on what one content call may pull over the network. */
export const MAX_CONTENT_FETCH_BYTES = 2_000_000;
/** Largest UTF-16 position accepted within the fixed fetched prefix. */
export const MAX_CONTENT_OFFSET = MAX_CONTENT_FETCH_BYTES;
/** Largest position in a derived patch, which can contain both complete bodies. */
export const MAX_DIFF_OFFSET = MAX_CONTENT_FETCH_BYTES * 4 + 4096;
export const MAX_TIMESTAMP_LENGTH = 32;
/** Timeout one content call asks for when the caller names none. */
export const DEFAULT_CONTENT_TIMEOUT = 30_000;
export const MAX_TARGET_LENGTH = 2048;
export const MAX_PARAMETER_LENGTH = 256;
export const MAX_TTL = 30 * 24 * 60 * 60 * 1000;
export const MAX_RETRIES = 10;
export const MAX_TIMEOUT = 5 * 60 * 1000;
export const PERMACC_API_KEY_ENVS = ["PERMA_CC_API_KEY", "PERMACC_API_KEY"] as const;
