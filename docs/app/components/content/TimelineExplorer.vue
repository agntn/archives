<script setup lang="ts">
import type { ArchivedPage } from "@agntn/archives";
import type { ContentDetails, DiffDetails, SnapshotDetails } from "@agntn/archives/tool-operations";
import type { ApiResult } from "../../composables/useLandingArchive";
import { dateOnly, formatBytes, shortStamp, shortUrl } from "../../utils/format";
import { PROVIDERS, canFrame, providerInfo, providerLabel } from "../../utils/providers";
import { fencedBody, groupByProvider, yearBuckets } from "../../utils/timeline";

const route = useRoute();
const router = useRouter();

const LIMITS = [10, 25, 50] as const;
const SOURCE_CHARS = 200_000;
const TEXT_CHARS = 6000;

type ViewMode = "replay" | "source" | "text";

function queryString(key: string, fallback = ""): string {
  const value = route.query[key];
  return typeof value === "string" ? value : fallback;
}

const form = reactive({
  target: queryString("target", "example.com"),
  provider: queryString("provider", "all"),
  limit: Number(queryString("limit", "25")) || 25,
  from: queryString("from"),
  to: queryString("to"),
  collection: queryString("collection"),
  user: queryString("user"),
});

const needsCollection = computed(() => form.provider === "archiveIt" || form.provider === "conifer");
const needsUser = computed(() => form.provider === "conifer");

const listing = reactive<{
  loading: boolean;
  error?: string;
  result?: ApiResult<SnapshotDetails>;
}>({ loading: false });

const pages = computed(() => listing.result?.details.response.pages ?? []);
const chronological = computed(() => [...pages.value].sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
const buckets = computed(() => (listing.result ? groupByProvider(listing.result.details.response) : []));
const years = computed(() => yearBuckets(pages.value));
const peak = computed(() => Math.max(1, ...years.value.map((year) => year.count)));
const headline = computed(() => listing.result?.text.split("\n")[0] ?? "");

function pageKey(page: ArchivedPage): string {
  return `${page._meta.provider}:${page.snapshot}`;
}

/** The provider argument that reads a page: the tool spelling of its `_meta.provider`. */
function providerArgument(page: ArchivedPage): string {
  const meta = typeof page._meta.provider === "string" ? page._meta.provider : "";
  return providerInfo(meta)?.slug ?? meta;
}

/** The archive's own stamp when it kept one, so the read lands on this exact capture. */
function captureStamp(page: ArchivedPage): string {
  const raw = page._meta.timestamp;
  return typeof raw === "string" && /^\d{4,14}$/u.test(raw) ? raw : page.timestamp;
}

function servesBodies(page: ArchivedPage): boolean {
  return providerInfo(providerArgument(page))?.content ?? false;
}

function extraQuery(): Record<string, string> {
  const extra: Record<string, string> = {};
  if (needsCollection.value && form.collection) {
    extra.collection = form.collection;
  }
  if (needsUser.value && form.user) {
    extra.user = form.user;
  }
  return extra;
}

/** The failure text the executor wrote when there is one, otherwise the HTTP error. */
function errorText(error: unknown): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: { data?: { text?: string }; statusMessage?: string; message?: string } }).data;
    const message = data?.data?.text ?? data?.statusMessage ?? data?.message;
    if (message) {
      return message;
    }
  }
  return error instanceof Error ? error.message : "Request failed";
}

function replaceQuery(patch: Record<string, string | undefined>) {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...route.query, ...patch })) {
    if (typeof value === "string" && value) {
      query[key] = value;
    }
  }
  void router.replace({ query });
}

async function search(deepLink: { at?: string; mode?: string } = {}) {
  const target = form.target.trim();
  if (!target) {
    return;
  }
  listing.loading = true;
  listing.error = undefined;
  selected.value = [];
  closeViewer(false);
  comparison.result = undefined;
  comparison.error = undefined;
  const query: Record<string, string> = {
    target,
    provider: form.provider,
    limit: String(form.limit),
    ...extraQuery(),
  };
  if (form.from.trim()) {
    query.from = form.from.trim();
  }
  if (form.to.trim()) {
    query.to = form.to.trim();
  }
  const wanted = deepLink.at;
  const requested = deepLink.mode;
  replaceQuery({ ...query, from: query.from, to: query.to, at: undefined, mode: undefined });
  try {
    listing.result = await $fetch<ApiResult<SnapshotDetails>>("/api/snapshots", { query });
    const deepLinked = wanted ? pages.value.find((page) => page.timestamp === wanted) : undefined;
    if (deepLinked) {
      const mode = requested === "source" || requested === "text" || requested === "replay" ? requested : undefined;
      void view(deepLinked, mode ?? defaultMode(deepLinked));
    }
  } catch (error) {
    listing.result = undefined;
    listing.error = errorText(error);
  } finally {
    listing.loading = false;
  }
}

/* Viewer */

const viewer = reactive<{
  page?: ArchivedPage;
  mode: ViewMode;
  loading: boolean;
  error?: string;
  result?: ApiResult<ContentDetails>;
}>({ mode: "replay", loading: false });

const viewerKey = computed(() => (viewer.page ? pageKey(viewer.page) : undefined));
const viewerIndex = computed(() => chronological.value.findIndex((page) => pageKey(page) === viewerKey.value));
const previousPage = computed(() => (viewerIndex.value > 0 ? chronological.value[viewerIndex.value - 1] : undefined));
const nextPage = computed(() =>
  viewerIndex.value >= 0 && viewerIndex.value < chronological.value.length - 1
    ? chronological.value[viewerIndex.value + 1]
    : undefined,
);

const modes = computed(() => {
  const page = viewer.page;
  if (!page) {
    return [];
  }
  const bodies = servesBodies(page);
  return [
    { id: "replay" as const, label: "Replay", icon: "i-lucide-play", enabled: canFrame(page), why: "This archive does not allow its playback to be framed" },
    { id: "source" as const, label: "Source", icon: "i-lucide-code", enabled: bodies, why: "This archive serves no capture bodies" },
    { id: "text" as const, label: "Text", icon: "i-lucide-file-text", enabled: bodies, why: "This archive serves no capture bodies" },
  ];
});

function defaultMode(page: ArchivedPage): ViewMode {
  if (canFrame(page)) {
    return "replay";
  }
  return servesBodies(page) ? "source" : "text";
}

const capture = computed(() => viewer.result?.details.response.content);
const caveat = computed(() => (viewer.page ? providerInfo(providerArgument(viewer.page))?.caveat : undefined));
/** A 429 is the archive refusing automated readers, not a broken capture; say so instead of showing the raw error. */
const throttled = computed(() => Boolean(viewer.error && /\b429\b/u.test(viewer.error)));
const body = computed(() => (viewer.result ? fencedBody(viewer.result.text) : ""));

/**
 * The archived markup as a document the browser can draw without running it.
 *
 * The frame is sandboxed with no scripts and no origin, the policy admits only
 * images, styles, fonts and media from the archive's own host, and `<base>` makes
 * relative assets resolve inside the capture instead of on the live web.
 */
const sourceDocument = computed(() => {
  if (viewer.mode !== "source" || !body.value || !capture.value) {
    return "";
  }
  const base = capture.value.snapshot;
  let origin = "";
  try {
    origin = new URL(base).origin;
  } catch {
    origin = "";
  }
  const policy = `default-src 'none'; img-src ${origin} data:; style-src 'unsafe-inline' ${origin}; font-src ${origin} data:; media-src ${origin}`;
  const head = `<meta http-equiv="Content-Security-Policy" content="${policy}"><base href="${base.replace(/"/gu, "%22")}" target="_blank">`;
  const cleaned = body.value
    .replace(/<script[\s\S]*?<\/script\s*>/giu, "")
    .replace(/<meta[^>]+http-equiv=["']?refresh[^>]*>/giu, "")
    .replace(/<base[^>]*>/giu, "");
  return /<head[^>]*>/iu.test(cleaned) ? cleaned.replace(/<head[^>]*>/iu, (match) => `${match}${head}`) : `${head}${cleaned}`;
});

async function loadBody(page: ArchivedPage, mode: "source" | "text", offset = 0) {
  viewer.loading = true;
  viewer.error = undefined;
  try {
    viewer.result = await $fetch<ApiResult<ContentDetails>>("/api/content", {
      retry: 0,
      query: {
        target: page.url,
        timestamp: captureStamp(page),
        provider: providerArgument(page),
        format: mode === "source" ? "raw" : "text",
        maxChars: mode === "source" ? SOURCE_CHARS : TEXT_CHARS,
        offset,
        ...extraQuery(),
      },
    });
  } catch (error) {
    viewer.result = undefined;
    viewer.error = errorText(error);
  } finally {
    viewer.loading = false;
  }
}

async function view(page: ArchivedPage, mode: ViewMode = defaultMode(page)) {
  const changed = viewerKey.value !== pageKey(page) || viewer.mode !== mode;
  viewer.page = page;
  viewer.mode = mode;
  comparison.result = undefined;
  replaceQuery({ at: page.timestamp, mode });
  if (mode === "replay") {
    viewer.result = undefined;
    viewer.error = undefined;
    return;
  }
  if (changed || !viewer.result || viewer.error) {
    await loadBody(page, mode);
  }
}

function step(delta: -1 | 1) {
  const target = delta < 0 ? previousPage.value : nextPage.value;
  if (!target) {
    return;
  }
  const keep = modes.value.find((mode) => mode.id === viewer.mode);
  const stillAvailable = keep && (viewer.mode === "replay" ? canFrame(target) : servesBodies(target));
  void view(target, stillAvailable ? viewer.mode : defaultMode(target));
}

function closeViewer(updateQuery = true) {
  viewer.page = undefined;
  viewer.result = undefined;
  viewer.error = undefined;
  if (updateQuery) {
    replaceQuery({ at: undefined, mode: undefined });
  }
}

function onKey(event: KeyboardEvent) {
  if (!viewer.page) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|SELECT|TEXTAREA)$/u.test(target.tagName)) {
    return;
  }
  if (event.key === "ArrowLeft") {
    step(-1);
  } else if (event.key === "ArrowRight") {
    step(1);
  } else if (event.key === "Escape") {
    closeViewer();
  }
}

/* Compare */

const selected = ref<ArchivedPage[]>([]);

function isSelected(page: ArchivedPage): boolean {
  return selected.value.some((item) => pageKey(item) === pageKey(page));
}

function toggle(page: ArchivedPage) {
  if (isSelected(page)) {
    selected.value = selected.value.filter((item) => pageKey(item) !== pageKey(page));
    return;
  }
  selected.value = [...selected.value.slice(-1), page];
}

const comparison = reactive<{
  loading: boolean;
  format: "text" | "raw";
  error?: string;
  result?: ApiResult<DiffDetails>;
}>({ loading: false, format: "text" });

const pair = computed(() => {
  if (selected.value.length !== 2) {
    return undefined;
  }
  const [first, second] = [...selected.value].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { before: first!, after: second! };
});

const pairProblem = computed(() => {
  if (!pair.value) {
    return undefined;
  }
  if (providerArgument(pair.value.before) !== providerArgument(pair.value.after)) {
    return "Pick two captures from the same provider. A diff never mixes archives.";
  }
  if (!servesBodies(pair.value.before)) {
    return `${providerLabel(providerArgument(pair.value.before))} serves no capture bodies, so there is nothing to compare.`;
  }
  return undefined;
});

const patch = computed(() => (comparison.result ? fencedBody(comparison.result.text) : ""));

async function compare(format: "text" | "raw" = comparison.format) {
  if (!pair.value || pairProblem.value) {
    return;
  }
  comparison.format = format;
  comparison.loading = true;
  comparison.error = undefined;
  try {
    comparison.result = await $fetch<ApiResult<DiffDetails>>("/api/diff", {
      retry: 0,
      query: {
        target: pair.value.before.url,
        provider: providerArgument(pair.value.before),
        before: pair.value.before.timestamp,
        after: pair.value.after.timestamp,
        format,
        maxChars: 12_000,
        ...extraQuery(),
      },
    });
  } catch (error) {
    comparison.result = undefined;
    comparison.error = errorText(error);
  } finally {
    comparison.loading = false;
  }
}

function bucketNote(bucket: (typeof buckets.value)[number]): string {
  if (bucket.state === "ok") {
    return `${bucket.count} · ${dateOnly(bucket.first ?? "")} – ${dateOnly(bucket.last ?? "")}`;
  }
  if (bucket.state === "failed") {
    return bucket.reason ?? "request failed";
  }
  if (bucket.state === "unsupported") {
    return bucket.reason ?? "unsupported";
  }
  return "none in this window";
}

/**
 * A prerendered page hydrates with an empty `route.query` and Nuxt restores the
 * real address only after mount, so the deep link is applied the first time a
 * `target` shows up in the query, whenever that is, and never again.
 */
let bootstrapped = false;

function applyDeepLink(query: Record<string, unknown>) {
  const read = (key: string) => (typeof query[key] === "string" ? (query[key] as string).trim() : "");
  if (bootstrapped || !read("target")) {
    return;
  }
  bootstrapped = true;
  form.target = read("target");
  form.provider = read("provider") || "all";
  form.limit = Number(read("limit")) || 25;
  form.from = read("from");
  form.to = read("to");
  form.collection = read("collection");
  form.user = read("user");
  void search({ at: read("at") || undefined, mode: read("mode") || undefined });
}

if (import.meta.client) {
  watch(() => route.query, applyDeepLink, { immediate: true, deep: true });
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="space-y-6">
    <form class="archives-frame overflow-hidden rounded-xl" @submit.prevent="search">
      <div class="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-6">
        <label class="sm:col-span-2 lg:col-span-3">
          <span class="archives-label">target · domain or URL</span>
          <input v-model="form.target" type="text" class="archives-field font-mono" placeholder="example.com" autocomplete="off" spellcheck="false" />
        </label>
        <label class="lg:col-span-2">
          <span class="archives-label">provider</span>
          <select v-model="form.provider" class="archives-select">
            <option value="all">all · Wayback, Arquivo.pt, Webarchiv, Archive.today, Common Crawl, WebCite</option>
            <option v-for="provider in PROVIDERS" :key="provider.slug" :value="provider.slug">
              {{ provider.label }}{{ provider.needs ? ` · needs ${provider.needs}` : "" }}
            </option>
          </select>
        </label>
        <label>
          <span class="archives-label">limit</span>
          <select v-model.number="form.limit" class="archives-select">
            <option v-for="limit in LIMITS" :key="limit" :value="limit">{{ limit }}</option>
          </select>
        </label>
        <label>
          <span class="archives-label">from</span>
          <input v-model="form.from" type="text" class="archives-field font-mono" placeholder="2010" autocomplete="off" />
        </label>
        <label>
          <span class="archives-label">to</span>
          <input v-model="form.to" type="text" class="archives-field font-mono" placeholder="2020-06" autocomplete="off" />
        </label>
        <label v-if="needsCollection">
          <span class="archives-label">collection</span>
          <input v-model="form.collection" type="text" class="archives-field font-mono" autocomplete="off" />
        </label>
        <label v-if="needsUser">
          <span class="archives-label">user</span>
          <input v-model="form.user" type="text" class="archives-field font-mono" autocomplete="off" />
        </label>
        <div class="flex items-end sm:col-span-2 lg:col-span-1 lg:col-start-6">
          <UButton type="submit" color="primary" class="w-full justify-center" :loading="listing.loading" icon="i-lucide-search">
            Search
          </UButton>
        </div>
      </div>
      <p class="border-t border-muted px-5 py-3 font-mono text-[11px] text-dimmed">
        Runs <span class="text-muted">archives_snapshots</span> on the docs worker with the same executor the MCP server uses. Answers are cached for 30 minutes; a target no archive holds is an answer, not an error.
      </p>
    </form>

    <pre v-if="listing.error" class="archives-body archives-frame rounded-xl" :style="{ color: 'var(--archives-del)' }">{{ listing.error }}</pre>

    <template v-if="listing.result">
      <div class="archives-frame overflow-hidden rounded-xl">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted px-5 py-3">
          <p class="font-mono text-xs text-highlighted"><LandingStamp :value="headline" /></p>
          <p class="font-mono text-[11px] text-dimmed">fetched {{ shortStamp(listing.result.fetchedAt) }}</p>
        </div>
        <div class="grid gap-6 px-5 py-5 lg:grid-cols-2">
          <ul class="archives-rows">
            <li v-for="bucket in buckets" :key="bucket.provider" class="archives-row">
              <span class="archives-row-main">
                <span class="archives-row-label">{{ providerLabel(bucket.provider) }}</span>
                <span class="archives-row-note" :title="bucket.reason">{{ shortUrl(bucketNote(bucket), 72) }}</span>
              </span>
              <span class="archives-state" :class="`archives-state-${bucket.state}`">{{ bucket.state }}</span>
            </li>
          </ul>
          <div v-if="years.length">
            <div class="archives-years" role="img" :aria-label="`Captures per year from ${years[0]?.year} to ${years.at(-1)?.year}`">
              <span
                v-for="year in years"
                :key="year.year"
                class="archives-year"
                :class="{ 'archives-year-hot': year.count === peak }"
                :style="{ height: `${Math.max(4, Math.round((year.count / peak) * 100))}%` }"
                :title="`${year.year}: ${year.count}`"
              />
            </div>
            <div class="archives-year-axis">
              <span>{{ years[0]?.year }}</span>
              <span>{{ pages.length }} captures</span>
              <span>{{ years.at(-1)?.year }}</span>
            </div>
          </div>
        </div>
        <div v-if="chronological.length > 1" class="border-t border-muted px-5 pt-3 pb-1">
          <CaptureStrip :pages="chronological" :current-key="viewerKey" :key-of="pageKey" @select="view($event)" />
        </div>
      </div>

      <div v-if="viewer.page" class="archives-frame overflow-hidden rounded-xl">
        <div class="archives-viewer-bar">
          <span class="inline-flex items-center gap-2">
            <UIcon :name="providerInfo(providerArgument(viewer.page))?.icon ?? 'i-lucide-archive'" class="size-4 text-primary" />
            <span class="text-sm font-medium text-highlighted">{{ providerLabel(providerArgument(viewer.page)) }}</span>
          </span>
          <span class="font-mono text-xs text-highlighted">{{ shortStamp(viewer.page.timestamp) }}</span>
          <span class="archives-viewer-url" :title="viewer.page.url">{{ viewer.page.url }}</span>
          <span class="inline-flex items-center gap-1">
            <button type="button" class="archives-btn h-7 px-2" :disabled="!previousPage" :title="previousPage ? `Previous: ${shortStamp(previousPage.timestamp)}` : 'Oldest capture in this listing'" aria-label="Previous capture" @click="step(-1)">
              <UIcon name="i-lucide-chevron-left" class="size-4" />
            </button>
            <span class="font-mono text-[11px] text-dimmed">{{ viewerIndex + 1 }} / {{ chronological.length }}</span>
            <button type="button" class="archives-btn h-7 px-2" :disabled="!nextPage" :title="nextPage ? `Next: ${shortStamp(nextPage.timestamp)}` : 'Newest capture in this listing'" aria-label="Next capture" @click="step(1)">
              <UIcon name="i-lucide-chevron-right" class="size-4" />
            </button>
          </span>
          <span class="archives-segmented" role="tablist" aria-label="View mode">
            <button
              v-for="mode in modes"
              :key="mode.id"
              type="button"
              role="tab"
              class="archives-segment inline-flex items-center gap-1.5"
              :class="{ 'archives-segment-active': viewer.mode === mode.id }"
              :aria-selected="viewer.mode === mode.id"
              :disabled="!mode.enabled"
              :title="mode.enabled ? undefined : mode.why"
              @click="view(viewer.page!, mode.id)"
            >
              <UIcon :name="mode.icon" class="size-3.5" />
              {{ mode.label }}
            </button>
          </span>
          <a :href="viewer.page.snapshot" target="_blank" rel="noopener" class="archives-btn h-7 px-2 text-xs" title="Open the capture in the archive">
            <UIcon name="i-lucide-external-link" class="size-3.5" />
            Open
          </a>
          <button type="button" class="archives-btn h-7 px-2" aria-label="Close viewer" title="Close (Esc)" @click="closeViewer()">
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </div>

        <p v-if="caveat" class="flex items-start gap-2 border-b border-muted px-4 py-2 text-xs text-muted">
          <UIcon name="i-lucide-shield-alert" class="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>{{ caveat }}</span>
        </p>

        <template v-if="viewer.mode === 'replay'">
          <iframe
            :key="viewer.page.snapshot"
            :src="viewer.page.snapshot"
            class="archives-viewer-frame"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerpolicy="no-referrer"
            :title="`${providerLabel(providerArgument(viewer.page))} replay of ${viewer.page.url} captured ${shortStamp(viewer.page.timestamp)}`"
          />
          <p class="border-t border-muted px-4 py-2 font-mono text-[11px] text-dimmed">
            Played back by the archive itself, in its own frame. Links inside stay in the archive.
          </p>
        </template>

        <template v-else>
          <p v-if="viewer.loading" class="flex items-center gap-2 px-5 py-4 text-sm text-muted">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
            Reading the capture…
          </p>
          <div v-else-if="viewer.error && throttled" class="px-5 py-5">
            <p class="flex items-start gap-2 text-sm text-highlighted">
              <UIcon name="i-lucide-shield-alert" class="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                {{ providerLabel(providerArgument(viewer.page)) }} answered <span class="font-mono">429 Too Many Requests</span>.
                It throttles automated readers, so the docs worker cannot fetch this capture right now.
              </span>
            </p>
            <div class="mt-4 flex flex-wrap items-center gap-2">
              <a :href="viewer.page.snapshot" target="_blank" rel="noopener" class="archives-btn">
                <UIcon name="i-lucide-external-link" class="size-4" />
                Open the capture in {{ providerLabel(providerArgument(viewer.page)) }}
              </a>
              <button type="button" class="archives-btn" @click="view(viewer.page!, viewer.mode)">
                Try again
              </button>
            </div>
            <details class="mt-4">
              <summary class="cursor-pointer font-mono text-[11px] text-dimmed">what the executor said</summary>
              <pre class="archives-body px-0" :style="{ color: 'var(--archives-del)' }">{{ viewer.error }}</pre>
            </details>
          </div>
          <pre v-else-if="viewer.error" class="archives-body" :style="{ color: 'var(--archives-del)' }">{{ viewer.error }}</pre>
          <template v-else-if="viewer.result">
            <div class="flex flex-wrap gap-x-4 gap-y-1 border-b border-muted px-5 py-2.5 font-mono text-[11px] text-dimmed">
              <span>captured <span class="text-muted">{{ capture?.timestamp }}</span></span>
              <span>type <span class="text-muted">{{ capture?.mime ?? "?" }}</span></span>
              <span>read <span class="text-muted">{{ formatBytes(capture?.bytes ?? 0) }}</span></span>
              <span v-if="viewer.mode === 'text'">slice <span class="text-muted">{{ viewer.result.details.offset }}..{{ viewer.result.details.endOffset }}</span></span>
              <span v-else-if="viewer.result.details.hasMore || capture?.truncated" :style="{ color: 'var(--archives-del)' }">truncated: the page is longer than what was rendered</span>
              <a :href="capture?.snapshot" target="_blank" rel="noopener" class="text-primary hover:underline">source</a>
            </div>
            <template v-if="viewer.mode === 'source'">
              <iframe
                v-if="sourceDocument"
                :key="`${viewerKey}-source`"
                :srcdoc="sourceDocument"
                class="archives-viewer-frame"
                sandbox=""
                referrerpolicy="no-referrer"
                :title="`Archived markup of ${viewer.page.url} captured ${shortStamp(viewer.page.timestamp)}, scripts removed`"
              />
              <pre v-else class="archives-body">{{ body || "(the capture is not text; see the source link)" }}</pre>
              <p class="border-t border-muted px-4 py-2 font-mono text-[11px] text-dimmed">
                The archived bytes, drawn without scripts. Only images, styles and fonts from the archive's own host are allowed to load.
              </p>
            </template>
            <template v-else>
              <pre class="archives-body">{{ body || "(the capture is not text; see the source link)" }}</pre>
              <div v-if="viewer.result.details.hasMore" class="border-t border-muted px-5 py-3">
                <button type="button" class="archives-btn" @click="loadBody(viewer.page!, 'text', viewer.result!.details.nextOffset ?? 0)">
                  Next slice
                  <UIcon name="i-lucide-chevron-right" class="size-4" />
                </button>
              </div>
            </template>
          </template>
        </template>
      </div>

      <div v-if="pages.length" class="archives-frame overflow-hidden rounded-xl">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted px-5 py-3">
          <p class="font-mono text-xs text-muted">
            captures <span class="ms-2 text-highlighted">{{ pages.length }}</span>
            <span class="ms-3 text-dimmed">newest first · ← → move between captures in the viewer</span>
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-[11px] text-dimmed">
              {{ selected.length ? `${selected.length} of 2 selected` : "tick two to compare" }}
            </span>
            <button type="button" class="archives-btn" :disabled="!pair || Boolean(pairProblem) || comparison.loading" @click="compare()">
              <UIcon name="i-lucide-diff" class="size-4" />
              Compare
            </button>
          </div>
        </div>
        <p v-if="pairProblem" class="border-b border-muted px-5 py-2 text-xs" :style="{ color: 'var(--archives-del)' }">
          {{ pairProblem }}
        </p>
        <div class="archives-table-wrap">
          <table class="archives-table">
            <thead>
              <tr>
                <th class="w-10"></th>
                <th>captured</th>
                <th>provider</th>
                <th>status</th>
                <th>original</th>
                <th>snapshot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="page in pages" :key="pageKey(page)" :class="{ 'archives-cell-active': isSelected(page) || pageKey(page) === viewerKey }">
                <td>
                  <input type="checkbox" :checked="isSelected(page)" :aria-label="`Select ${page.timestamp}`" class="accent-[var(--ui-primary)]" @change="toggle(page)" />
                </td>
                <td class="font-mono text-xs whitespace-nowrap text-highlighted">{{ shortStamp(page.timestamp) }}</td>
                <td class="text-xs whitespace-nowrap">{{ providerLabel(String(page._meta.provider ?? "")) }}</td>
                <td class="font-mono text-xs text-dimmed">{{ page._meta.status ?? "—" }}</td>
                <td class="font-mono text-xs text-muted" :title="page.url">{{ shortUrl(page.url, 40) }}</td>
                <td>
                  <a :href="page.snapshot" target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline" :title="page.snapshot">
                    open
                    <UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
                  </a>
                </td>
                <td class="text-end">
                  <button
                    type="button"
                    class="archives-btn h-7 px-2 text-xs"
                    :class="{ 'text-primary': pageKey(page) === viewerKey }"
                    :disabled="!canFrame(page) && !servesBodies(page)"
                    :title="canFrame(page) || servesBodies(page) ? 'View this capture' : 'This archive neither serves bodies nor allows framing; use open'"
                    @click="view(page)"
                  >
                    <UIcon name="i-lucide-eye" class="size-3.5" />
                    View
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-if="comparison.loading || comparison.error || comparison.result" class="archives-frame overflow-hidden rounded-xl">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted px-5 py-3">
        <p class="font-mono text-xs text-muted">
          <span class="text-dimmed">archives_diff</span>
          <span v-if="pair" class="ms-2 text-highlighted">{{ dateOnly(pair.before.timestamp) }} → {{ dateOnly(pair.after.timestamp) }}</span>
        </p>
        <div class="flex items-center gap-1">
          <button
            v-for="format in ['text', 'raw'] as const"
            :key="format"
            type="button"
            class="archives-btn h-7 px-2 text-xs"
            :class="{ 'text-primary': comparison.format === format }"
            :disabled="comparison.loading"
            @click="compare(format)"
          >
            {{ format }}
          </button>
        </div>
      </div>
      <p v-if="comparison.loading" class="flex items-center gap-2 px-5 py-4 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Reading both captures and comparing…
      </p>
      <pre v-else-if="comparison.error" class="archives-body" :style="{ color: 'var(--archives-del)' }">{{ comparison.error }}</pre>
      <template v-else-if="comparison.result">
        <div class="flex flex-wrap gap-x-4 gap-y-1 border-b border-muted px-5 py-2.5 font-mono text-[11px] text-dimmed">
          <span :style="{ color: 'var(--archives-add)' }">+{{ comparison.result.details.result?.additions ?? 0 }}</span>
          <span :style="{ color: 'var(--archives-del)' }">−{{ comparison.result.details.result?.deletions ?? 0 }}</span>
          <span>before <span class="text-muted">{{ comparison.result.details.result?.before.timestamp }}</span></span>
          <span>after <span class="text-muted">{{ comparison.result.details.result?.after.timestamp }}</span></span>
          <span v-if="comparison.result.details.result?.partial" :style="{ color: 'var(--archives-del)' }">partial: a body was truncated</span>
          <span v-if="comparison.result.details.result?.identical">identical</span>
        </div>
        <DiffLines :patch="patch" />
      </template>
    </div>
  </div>
</template>
