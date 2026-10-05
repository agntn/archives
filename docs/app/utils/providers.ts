/** One row of the provider table, shared by the landing grid, the sidebar icons, the explorer and the facts strip. */
export interface ProviderInfo {
  /** Name accepted by the `provider` tool argument. */
  readonly slug: string;
  /** Value of `_meta.provider` on pages and unsupported records. */
  readonly meta: string;
  readonly label: string;
  readonly icon: string;
  readonly factory: string;
  /** Host the listing is asked on, as in the provider's source. */
  readonly host: string;
  /** Endpoint family the listing comes from. */
  readonly index: string;
  /** Whether `content()` can read capture bodies. */
  readonly content: boolean;
  /** The body is the archive's own rendering of the page, not the bytes the site sent. */
  readonly rendered?: boolean;
  readonly inAll: boolean;
  /** Extra option the factory needs before it can answer. */
  readonly needs?: string;
  /** The archive's playback pages allow being framed by another site. */
  readonly frame: boolean;
  /** One sentence on what the provider talks to, for the roster. */
  readonly about: string;
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
    host: "web.archive.org",
    index: "CDX",
    content: true,
    inAll: true,
    frame: true,
    about: "CDX API with collapse and filter. Bodies replayed under id_, the original bytes.",
    to: "/providers/wayback",
  },
  {
    slug: "arquivo",
    meta: "arquivo",
    label: "Arquivo.pt",
    icon: "i-lucide-landmark",
    factory: "providers.arquivo()",
    host: "arquivo.pt",
    index: "CDX",
    content: true,
    inAll: true,
    frame: true,
    about: "Public CDX index of the Portuguese web archive. Raw replay through noFrame/replay.",
    to: "/providers/arquivo",
  },
  {
    slug: "webarchiv",
    meta: "webarchiv",
    label: "Webarchiv Österreich",
    icon: "i-lucide-library",
    factory: "providers.webarchiv()",
    host: "webarchiv.onb.ac.at",
    index: "CDXJ",
    content: true,
    inAll: true,
    frame: false,
    caveat: "This archive does not allow framing; Source and Text read the raw replay instead.",
    about: "Austrian National Library CDXJ index. One exact URL per query, id_ replay for bodies.",
    to: "/providers/webarchiv",
  },
  {
    slug: "vefsafn",
    meta: "vefsafn",
    label: "Vefsafn",
    icon: "i-lucide-mountain-snow",
    factory: "providers.vefsafn()",
    host: "vefsafn.is",
    index: "CDX",
    content: true,
    inAll: true,
    frame: true,
    about: "Icelandic web archive at the National Library. One exact URL per query, id_ replay for bodies.",
    to: "/providers/vefsafn",
  },
  {
    slug: "oszk",
    meta: "oszk",
    label: "OSZK Webarchívum",
    icon: "i-lucide-castle",
    factory: "providers.oszk()",
    host: "webadmin.oszk.hu",
    index: "CDX",
    content: true,
    inAll: true,
    frame: true,
    about: "Hungarian web archive at the National Széchényi Library. Lists a whole domain, id_ replay for bodies.",
    to: "/providers/oszk",
  },
  {
    slug: "archiveToday",
    meta: "archive-today",
    label: "Archive.today",
    icon: "i-lucide-history",
    factory: "providers.archiveToday()",
    host: "archive.is",
    index: "Memento TimeMap",
    content: true,
    rendered: true,
    inAll: true,
    frame: false,
    caveat:
      "Archive.today doesn't answer connections from Cloudflare Workers, so this site can't list or read it. Run providers.archiveToday() from your own machine.",
    about: "Memento TimeMap on archive.is. Bodies are the rendered wrapper page, not the original bytes.",
    to: "/providers/archive-today",
  },
  {
    slug: "commoncrawl",
    meta: "commoncrawl",
    label: "Common Crawl",
    icon: "i-lucide-archive",
    factory: "providers.commoncrawl()",
    host: "index.commoncrawl.org",
    index: "CDX + WARC",
    content: true,
    inAll: true,
    frame: false,
    about: "CDX index per crawl, bodies read from the WARC byte range on data.commoncrawl.org.",
    to: "/providers/commoncrawl",
  },
  {
    slug: "webcite",
    meta: "webcite",
    label: "WebCite",
    icon: "i-lucide-file-text",
    factory: "providers.webcite()",
    host: "webcitation.org",
    index: "none",
    content: false,
    inAll: true,
    frame: false,
    about: "No API to list a domain. Answers unsupported with the reason; no new archives since about 2019.",
    to: "/providers/webcite",
  },
  {
    slug: "memento",
    meta: "memento",
    label: "Memento",
    icon: "i-lucide-globe",
    factory: "providers.memento()",
    host: "memgator.cs.odu.edu",
    index: "MemGator TimeMap",
    content: true,
    inAll: false,
    frame: false,
    about: "ODU MemGator JSON TimeMap across several archives. Outside all to avoid duplicate requests.",
    to: "/providers/memento",
  },
  {
    slug: "archiveIt",
    meta: "archive-it",
    label: "Archive-It",
    icon: "i-lucide-layers",
    factory: "providers.archiveIt({ collection })",
    host: "wayback.archive-it.org",
    index: "CDX/C",
    content: true,
    inAll: false,
    needs: "collection",
    frame: true,
    about: "CDX/C index of one numbered collection. Needs a collection; reads bodies inside it.",
    to: "/providers/archive-it",
  },
  {
    slug: "conifer",
    meta: "conifer",
    label: "Conifer",
    icon: "i-lucide-database",
    factory: "providers.conifer({ user, collection })",
    host: "conifer.rhizome.org",
    index: "CDX",
    content: false,
    inAll: false,
    needs: "user, collection",
    frame: false,
    about: "Search inside an existing public collection. Needs a user and a collection; no bodies.",
    to: "/providers/conifer",
  },
  {
    slug: "permacc",
    meta: "permacc",
    label: "Perma.cc",
    icon: "i-lucide-lock",
    factory: "providers.permacc({ apiKey })",
    host: "api.perma.cc",
    index: "REST",
    content: false,
    inAll: false,
    needs: "apiKey",
    frame: false,
    about: "REST API behind an API key. Exact URL lookup, metadata only, what the key can see.",
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
