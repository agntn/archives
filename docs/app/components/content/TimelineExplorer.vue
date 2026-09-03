<script setup lang="ts">
import type { ArchivedPage } from "@agntn/archives";
import type { DiffDetails, SnapshotDetails } from "@agntn/archives/tool-operations";
import {
  captureStamp,
  compareLink,
  defaultMode,
  errorText,
  pageKey,
  providerArgument,
  servesBodies,
  sortChronological,
  type ApiResult,
  type ViewMode,
} from "../../utils/capture";
import { dateOnly, shortStamp, shortUrl } from "../../utils/format";
import { PROVIDERS, canFrame, providerLabel } from "../../utils/providers";
import { fencedBody, groupByProvider, yearBuckets } from "../../utils/timeline";

const route = useRoute();
const router = useRouter();

const LIMITS = [10, 25, 50] as const;

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

const listing = reactive<{ loading: boolean; error?: string; result?: ApiResult<SnapshotDetails> }>({ loading: false });

const pages = computed(() => listing.result?.details.response.pages ?? []);
const chronological = computed(() => sortChronological(pages.value));
const buckets = computed(() => (listing.result ? groupByProvider(listing.result.details.response) : []));
const years = computed(() => yearBuckets(pages.value));
const peak = computed(() => Math.max(1, ...years.value.map((year) => year.count)));
const headline = computed(() => listing.result?.text.split("\n")[0] ?? "");

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
  const query: Record<string, string> = { target, provider: form.provider, limit: String(form.limit), ...extraQuery() };
  if (form.from.trim()) {
    query.from = form.from.trim();
  }
  if (form.to.trim()) {
    query.to = form.to.trim();
  }
  replaceQuery({ ...query, from: query.from, to: query.to, at: undefined, mode: undefined });
  try {
    listing.result = await $fetch<ApiResult<SnapshotDetails>>("/api/snapshots", { retry: 0, query });
    const deepLinked = deepLink.at ? pages.value.find((page) => page.timestamp === deepLink.at || captureStamp(page) === deepLink.at) : undefined;
    if (deepLinked) {
      const requested = deepLink.mode;
      const mode = requested === "source" || requested === "text" || requested === "replay" ? requested : undefined;
      view(deepLinked, mode ?? defaultMode(deepLinked));
    }
  } catch (error) {
    listing.result = undefined;
    listing.error = errorText(error);
  } finally {
    listing.loading = false;
  }
}

/* Viewer */

const viewer = reactive<{ page?: ArchivedPage; mode: ViewMode }>({ mode: "replay" });
const viewerKey = computed(() => (viewer.page ? pageKey(viewer.page) : undefined));

function view(page: ArchivedPage, mode: ViewMode = defaultMode(page)) {
  viewer.page = page;
  viewer.mode = mode;
  comparison.result = undefined;
  replaceQuery({ at: page.timestamp, mode });
}

function onMode(mode: ViewMode) {
  viewer.mode = mode;
  replaceQuery({ mode });
}

function closeViewer(updateQuery = true) {
  viewer.page = undefined;
  if (updateQuery) {
    replaceQuery({ at: undefined, mode: undefined });
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

const comparison = reactive<{ loading: boolean; format: "text" | "raw"; error?: string; result?: ApiResult<DiffDetails> }>({
  loading: false,
  format: "text",
});

const pair = computed(() => {
  if (selected.value.length !== 2) {
    return undefined;
  }
  const [first, second] = sortChronological(selected.value);
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
    return `${bucket.count} · ${dateOnly(bucket.first ?? "")} to ${dateOnly(bucket.last ?? "")}`;
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

onMounted(() => {
  watch(() => route.query, applyDeepLink, { immediate: true, deep: true });
});
</script>

<template>
  <div class="space-y-6">
    <form class="archives-frame overflow-hidden rounded-xl" @submit.prevent="search()">
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
          <span class="flex flex-wrap items-center gap-3 font-mono text-[11px] text-dimmed">
            <NuxtLink :to="`/site/${encodeURIComponent(form.target.replace(/^https?:\/\//u, '').replace(/\/.*$/u, ''))}`" class="text-primary hover:underline">coverage dashboard →</NuxtLink>
            <span>fetched {{ shortStamp(listing.result.fetchedAt) }}</span>
          </span>
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

      <CaptureViewer
        v-if="viewer.page"
        :page="viewer.page"
        :pages="chronological"
        :mode="viewer.mode"
        :extra="extraQuery()"
        @select="view($event, viewer.mode)"
        @update:mode="onMode"
        @close="closeViewer()"
      />

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
            <NuxtLink v-if="pair && !pairProblem" :to="compareLink(pair.before, pair.after)" class="archives-btn">
              <UIcon name="i-lucide-columns-2" class="size-4" />
              Side by side
            </NuxtLink>
            <button type="button" class="archives-btn" :disabled="!pair || Boolean(pairProblem) || comparison.loading" @click="compare()">
              <UIcon name="i-lucide-diff" class="size-4" />
              Diff
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
                <td class="font-mono text-xs text-dimmed">{{ page._meta.status ?? "n/a" }}</td>
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
