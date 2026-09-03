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
