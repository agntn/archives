/** One row of the provider table, shared by the landing grid, the sidebar icons, the explorer and the facts strip. */
export interface ProviderInfo {
  /** Name accepted by the `provider` tool argument. */
  readonly slug: string;
  /** Value of `_meta.provider` on pages and unsupported records. */
  readonly meta: string;
  readonly label: string;
  readonly icon: string;
  readonly factory: string;
  /** Endpoint family the listing comes from. */
  readonly index: string;
  /** Whether `content()` can read capture bodies. */
  readonly content: boolean;
  readonly inAll: boolean;
  /** Extra option the factory needs before it can answer. */
  readonly needs?: string;
  /** The archive's playback pages allow being framed by another site. */
  readonly frame: boolean;
  /** What the viewer should say before a read is even tried. */
  readonly caveat?: string;
  readonly to: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    slug: "wayback",
    meta: "wayback",
    label: "Wayback Machine",
    icon: "i-simple-icons-internetarchive",
    factory: "providers.wayback()",
    index: "CDX",
    content: true,
    inAll: true,
    frame: true,
    to: "/providers/wayback",
  },
  {
    slug: "arquivo",
    meta: "arquivo",
    label: "Arquivo.pt",
    icon: "i-lucide-landmark",
    factory: "providers.arquivo()",
    index: "CDX",
    content: true,
    inAll: true,
    frame: true,
    to: "/providers/arquivo",
  },
  {
    slug: "webarchiv",
    meta: "webarchiv",
    label: "Webarchiv Österreich",
    icon: "i-lucide-library",
    factory: "providers.webarchiv()",
    index: "CDXJ",
    content: true,
    inAll: true,
    frame: false,
    caveat: "This archive does not allow framing; Source and Text read the raw replay instead.",
    to: "/providers/webarchiv",
  },
  {
    slug: "archiveToday",
    meta: "archive-today",
    label: "Archive.today",
    icon: "i-lucide-history",
    factory: "providers.archiveToday()",
    index: "Memento TimeMap",
    content: true,
    inAll: true,
    frame: false,
    caveat:
      "Archive.today throttles automated readers and often answers 429. Reads from here can fail; the capture always opens in a new tab.",
    to: "/providers/archive-today",
  },
  {
    slug: "commoncrawl",
    meta: "commoncrawl",
    label: "Common Crawl",
    icon: "i-lucide-archive",
    factory: "providers.commoncrawl()",
    index: "CDX + WARC",
    content: true,
    inAll: true,
    frame: false,
    to: "/providers/commoncrawl",
  },
  {
    slug: "webcite",
    meta: "webcite",
    label: "WebCite",
    icon: "i-lucide-file-text",
    factory: "providers.webcite()",
    index: "none",
    content: false,
    inAll: true,
    frame: false,
    to: "/providers/webcite",
  },
  {
    slug: "memento",
    meta: "memento",
    label: "Memento",
    icon: "i-lucide-globe",
    factory: "providers.memento()",
    index: "MemGator TimeMap",
    content: true,
    inAll: false,
    frame: false,
    to: "/providers/memento",
  },
  {
    slug: "archiveIt",
    meta: "archive-it",
    label: "Archive-It",
    icon: "i-lucide-layers",
    factory: "providers.archiveIt({ collection })",
    index: "CDX/C",
    content: true,
    inAll: false,
    needs: "collection",
    frame: true,
    to: "/providers/archive-it",
  },
  {
    slug: "conifer",
    meta: "conifer",
    label: "Conifer",
    icon: "i-lucide-database",
    factory: "providers.conifer({ user, collection })",
    index: "CDX",
    content: false,
    inAll: false,
    needs: "user, collection",
    frame: false,
    to: "/providers/conifer",
  },
  {
    slug: "permacc",
    meta: "permacc",
    label: "Perma.cc",
    icon: "i-lucide-lock",
    factory: "providers.permacc({ apiKey })",
    index: "REST",
    content: false,
    inAll: false,
    needs: "apiKey",
    frame: false,
    to: "/providers/permacc",
  },
];

export const PROVIDERS_IN_ALL = PROVIDERS.filter((provider) => provider.inAll);

const BY_META = new Map(PROVIDERS.map((provider) => [provider.meta, provider]));
const BY_SLUG = new Map(PROVIDERS.map((provider) => [provider.slug, provider]));

/** Resolves either spelling of a provider name; unknown names come back as a bare label. */
export function providerInfo(name: string): ProviderInfo | undefined {
  return BY_META.get(name) ?? BY_SLUG.get(name);
}

export function providerLabel(name: string): string {
  return providerInfo(name)?.label ?? name;
}

/** Playback hosts known to allow framing; Memento snapshots point at one of them or at an archive that does not. */
const FRAMEABLE_HOSTS = new Set(["web.archive.org", "arquivo.pt", "wayback.archive-it.org"]);

/** Whether a listed page's snapshot can be shown inside an iframe. */
export function canFrame(page: { readonly snapshot: string; readonly _meta: { readonly provider?: unknown } }): boolean {
  const provider = typeof page._meta.provider === "string" ? providerInfo(page._meta.provider) : undefined;
  if (provider && provider.slug !== "memento") {
    return provider.frame;
  }
  try {
    return FRAMEABLE_HOSTS.has(new URL(page.snapshot).hostname);
  } catch {
    return false;
  }
}
