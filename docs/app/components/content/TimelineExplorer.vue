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
import { bareHost, dateOnly, shortStamp, shortUrl } from "../../utils/format";
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

/** The provider picker: `all` first, then every provider with what it still needs. */
const providerItems = [
  { label: "all · the six in providers.all()", value: "all", icon: "i-lucide-layers" },
  ...PROVIDERS.map((provider) => ({
    label: provider.needs ? `${provider.label} · needs ${provider.needs}` : provider.label,
    value: provider.slug,
    icon: provider.icon,
  })),
];
const limitItems = LIMITS.map((limit): { label: string; value: number } => ({ label: String(limit), value: limit }));
const pickedProvider = computed(() => providerItems.find((item) => item.value === form.provider));

type BadgeColor = "neutral" | "error";
type BadgeVariant = "subtle" | "outline";

/** How each archive's answer reads: captures bright, nothing or no endpoint quiet, a failure red. */
const STATE: Record<string, { color: BadgeColor; variant: BadgeVariant }> = {
  ok: { color: "neutral", variant: "subtle" },
  empty: { color: "neutral", variant: "outline" },
  unsupported: { color: "neutral", variant: "outline" },
  failed: { color: "error", variant: "outline" },
};

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
  <div class="timeline-explorer">
    <ExplorerPanel
      as="form"
      tag="Call"
      role="search"
      label="Snapshot search"
      :call="`archives_snapshots({ target: &quot;${form.target}&quot;, provider: &quot;${form.provider}&quot;, limit: ${form.limit} })`"
      :busy="listing.loading"
      :meta="`limit ${form.limit}`"
      @submit.prevent="search()"
    >
      <template #title>snapshots(<span class="tok-str">"{{ form.target || "example.com" }}"</span>)</template>
      <div class="archives-band timeline-form">
        <div class="console-readout">
          <dl class="console-readout-rows">
            <div>
              <dt><label for="timeline-target">Target</label></dt>
              <dd>
                <UInput
                  id="timeline-target"
                  v-model="form.target"
                  variant="none"
                  placeholder="example.com"
                  autocomplete="off"
                  spellcheck="false"
                  class="w-full"
                />
              </dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>
                <USelectMenu
                  v-model="form.provider"
                  :items="providerItems"
                  value-key="value"
                  :icon="pickedProvider?.icon"
                  variant="none"
                  :search-input="false"
                  aria-label="Provider"
                  class="w-full"
                />
              </dd>
            </div>
            <div>
              <dt>Limit</dt>
              <dd>
                <USelectMenu
                  v-model="form.limit"
                  :items="limitItems"
                  value-key="value"
                  variant="none"
                  :search-input="false"
                  aria-label="Limit"
                  class="w-full"
                />
              </dd>
            </div>
            <div>
              <dt><label for="timeline-from">Window</label></dt>
              <dd class="timeline-window">
                <UInput id="timeline-from" v-model="form.from" variant="none" placeholder="from 2010" autocomplete="off" aria-label="From" />
                <span class="archives-dim" aria-hidden="true">→</span>
                <UInput v-model="form.to" variant="none" placeholder="to 2020-06" autocomplete="off" aria-label="To" />
              </dd>
            </div>
            <div v-if="needsCollection">
              <dt><label for="timeline-collection">Collection</label></dt>
              <dd><UInput id="timeline-collection" v-model="form.collection" variant="none" autocomplete="off" class="w-full" /></dd>
            </div>
            <div v-if="needsUser">
              <dt><label for="timeline-user">User</label></dt>
              <dd><UInput id="timeline-user" v-model="form.user" variant="none" autocomplete="off" class="w-full" /></dd>
            </div>
          </dl>
        </div>
        <div class="timeline-actions">
          <UButton type="submit" color="primary" variant="solid" :loading="listing.loading" trailing-icon="i-lucide-search" label="Search" />
          <p class="archives-note">A target no archive holds is an answer, not an error.</p>
        </div>
      </div>
      <template #footer>
        <span>archives_snapshots on the docs worker, the executor the MCP server runs</span>
        <span class="console-meta">cached 30 minutes</span>
      </template>
    </ExplorerPanel>

    <ExplorerPanel v-if="listing.error" tag="Error" title="archives_snapshots" label="Listing failed">
      <div class="archives-band">
        <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ listing.error }}</p>
      </div>
    </ExplorerPanel>

    <template v-if="listing.result">
      <ExplorerPanel
        tag="List"
        label="What each archive holds"
        :call="headline"
        :sweep="listing.result.fetchedAt"
        :meta="`fetched ${shortStamp(listing.result.fetchedAt)}`"
      >
        <template #title>{{ listing.result.details.target }}<span class="console-file">{{ pages.length }} captures</span></template>
        <div class="archives-band timeline-summary">
          <div class="timeline-buckets">
            <p class="console-label console-rule-title">
              <span>Archives <span aria-hidden="true">[ every one asked ]</span></span>
              <span class="console-mark" aria-hidden="true" />
            </p>
            <ul class="timeline-bucket-list">
              <li v-for="bucket in buckets" :key="bucket.provider">
                <span class="timeline-bucket-name">{{ providerLabel(bucket.provider) }}</span>
                <UBadge :color="STATE[bucket.state]?.color ?? 'neutral'" :variant="STATE[bucket.state]?.variant ?? 'outline'" :label="bucket.state" />
                <UTooltip :text="bucketNote(bucket)">
                  <span class="timeline-bucket-note" tabindex="0">{{ bucketNote(bucket) }}</span>
                </UTooltip>
              </li>
            </ul>
          </div>
          <div v-if="years.length" class="timeline-years-block">
            <p class="console-label console-rule-title">
              <span>Captures <span aria-hidden="true">[ per year ]</span></span>
              <span class="console-mark" aria-hidden="true" />
            </p>
            <div class="timeline-years" role="img" :aria-label="`Captures per year from ${years[0]?.year} to ${years.at(-1)?.year}`">
              <UTooltip v-for="year in years" :key="year.year" :text="`${year.year}: ${year.count}`">
                <span class="timeline-year" :data-peak="year.count === peak">
                  <span class="timeline-bar" :style="{ transform: `scaleY(${year.count ? Math.max(0.06, year.count / peak) : 0})` }" />
                </span>
              </UTooltip>
            </div>
            <div class="timeline-scale" aria-hidden="true">
              <span>{{ years[0]?.year }}</span>
              <span>{{ years.at(-1)?.year }}</span>
            </div>
          </div>
        </div>
        <div v-if="chronological.length > 1" class="archives-band">
          <p class="console-label console-rule-title">
            <span>Strip <span aria-hidden="true">[ oldest to newest · pick one to view ]</span></span>
            <span class="console-mark" aria-hidden="true" />
          </p>
          <CaptureStrip :pages="chronological" :current-key="viewerKey" :key-of="pageKey" @select="view($event)" />
        </div>
        <template #footer>
          <NuxtLink :to="`/site/${encodeURIComponent(bareHost(form.target).replace(/\/.*$/u, ''))}`" class="timeline-link"
            ><span aria-hidden="true">→ </span>coverage of the whole domain</NuxtLink
          >
          <span class="console-meta">{{ headline }}</span>
        </template>
      </ExplorerPanel>

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

      <ExplorerPanel v-if="pages.length" tag="List" title="captures" label="Captures" :meta="selected.length ? `${selected.length} of 2 selected` : 'tick two to compare'">
        <div class="archives-band timeline-pick">
          <p class="archives-note">Newest first. In the viewer, the arrow keys move between captures.</p>
          <div class="timeline-pick-actions">
            <UButton
              v-if="pair && !pairProblem"
              :to="compareLink(pair.before, pair.after)"
              color="neutral"
              variant="outline"
              icon="i-lucide-columns-2"
              label="Side by side"
            />
            <UButton
              color="primary"
              variant="solid"
              trailing-icon="i-lucide-diff"
              label="Diff"
              :disabled="!pair || Boolean(pairProblem) || comparison.loading"
              @click="compare()"
            />
          </div>
          <p v-if="pairProblem" class="archives-error" role="alert"><span class="console-tag">Pair</span>{{ pairProblem }}</p>
        </div>
        <ul class="archives-rows timeline-rows">
          <li v-for="page in pages" :key="pageKey(page)" :data-active="isSelected(page) || pageKey(page) === viewerKey">
            <UCheckbox :model-value="isSelected(page)" :aria-label="`Select ${page.timestamp}`" @update:model-value="toggle(page)" />
            <span class="archives-value">{{ shortStamp(page.timestamp) }}</span>
            <span class="timeline-row-provider">{{ providerLabel(String(page._meta.provider ?? "")) }}</span>
            <span class="archives-dim">{{ page._meta.status ?? "n/a" }}</span>
            <UTooltip :text="page.url">
              <span class="timeline-row-url" tabindex="0">{{ shortUrl(page.url, 48) }}</span>
            </UTooltip>
            <span class="timeline-row-actions">
              <UButton
                :to="page.snapshot"
                target="_blank"
                rel="noopener"
                color="neutral"
                variant="subtle"
                trailing-icon="i-lucide-arrow-up-right"
                label="open"
                :aria-label="`Open ${page.timestamp} on the archive`"
              />
              <UTooltip :text="canFrame(page) || servesBodies(page) ? 'View this capture here' : 'This archive neither serves bodies nor allows framing; use open'">
                <UButton
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-eye"
                  label="view"
                  :disabled="!canFrame(page) && !servesBodies(page)"
                  @click="view(page)"
                />
              </UTooltip>
            </span>
          </li>
        </ul>
      </ExplorerPanel>
    </template>

    <ExplorerPanel
      v-if="comparison.loading || comparison.error || comparison.result"
      tag="Call"
      label="Diff of the two picked captures"
      :busy="comparison.loading"
      :sweep="comparison.result?.fetchedAt"
      :meta="pair ? `${dateOnly(pair.before.timestamp)} → ${dateOnly(pair.after.timestamp)}` : undefined"
    >
      <template #title>archives_diff(<span class="tok-str">"{{ comparison.format }}"</span>)</template>
      <div class="archives-band timeline-diff-head">
        <div class="timeline-formats" aria-label="Diff format">
          <UButton
            v-for="format in ['text', 'raw'] as const"
            :key="format"
            :color="comparison.format === format ? 'primary' : 'neutral'"
            variant="chip"
            :label="format"
            :disabled="comparison.loading"
            @click="compare(format)"
          />
        </div>
        <p v-if="comparison.loading" class="archives-note">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
          Reading both captures and comparing…
        </p>
        <p v-else-if="comparison.error" class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ comparison.error }}</p>
        <p v-else-if="comparison.result" class="timeline-diff-stats">
          <span class="timeline-add">+{{ comparison.result.details.result?.additions ?? 0 }}</span>
          <span class="timeline-del">−{{ comparison.result.details.result?.deletions ?? 0 }}</span>
          <span>before <span class="archives-value">{{ comparison.result.details.result?.before.timestamp }}</span></span>
          <span>after <span class="archives-value">{{ comparison.result.details.result?.after.timestamp }}</span></span>
          <span v-if="comparison.result.details.result?.partial" class="timeline-del">partial: a body was cut</span>
          <span v-if="comparison.result.details.result?.identical">identical</span>
        </p>
      </div>
      <div v-if="comparison.result && patch" class="archives-band">
        <DiffLines :patch="patch" />
      </div>
    </ExplorerPanel>
  </div>
</template>

<style scoped>
.timeline-explorer {
  display: grid;
  gap: 28px;
}
.timeline-explorer > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
.timeline-form {
  display: grid;
  gap: 16px;
}
.timeline-form .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
.timeline-window {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.timeline-actions,
.timeline-pick-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}
.timeline-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px 32px;
}
.timeline-bucket-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.timeline-bucket-list > li {
  display: grid;
  grid-template-columns: 10rem auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
}
.timeline-bucket-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.timeline-bucket-note {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
}
.timeline-years {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 72px;
  box-shadow: inset 0 -1px 0 var(--console-line);
}
.timeline-year {
  position: relative;
  flex: 1 1 0;
  min-width: 2px;
}
.timeline-bar {
  position: absolute;
  inset: 0;
  transform-origin: bottom;
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-text-muted) 55%, transparent) 0 1px,
    transparent 1px 4px
  );
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.timeline-year[data-peak="true"] .timeline-bar {
  background: color-mix(in srgb, var(--console-accent) 30%, transparent);
  box-shadow: inset 0 0 0 1px var(--console-accent);
}
.timeline-scale {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--ui-text-dimmed);
}
.timeline-link {
  color: var(--ui-text-muted);
}
.timeline-link:hover {
  color: var(--console-accent);
}
.timeline-pick {
  display: grid;
  gap: 12px;
}
.timeline-rows > li {
  grid-template-columns: 1.25rem 8.5rem minmax(7rem, 10rem) 3rem minmax(0, 1fr) auto;
  align-items: center;
}
.timeline-rows > li[data-active="true"] {
  background: color-mix(in srgb, var(--ui-text-muted) 5%, var(--ui-bg));
  box-shadow: inset 2px 0 0 var(--console-accent);
}
.timeline-rows > li + li[data-active="true"] {
  box-shadow:
    inset 2px 0 0 var(--console-accent),
    inset 0 1px 0 var(--console-line);
}
.timeline-row-provider,
.timeline-row-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timeline-row-actions {
  display: inline-flex;
  gap: 6px;
}
.timeline-diff-head {
  display: grid;
  gap: 12px;
}
.timeline-formats {
  display: flex;
  gap: 6px;
}
.timeline-diff-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ui-text-dimmed);
}
.timeline-add {
  color: var(--archives-add);
}
.timeline-del {
  color: var(--archives-del);
}
@media (width < 56rem) {
  .timeline-summary {
    grid-template-columns: minmax(0, 1fr);
  }
  .timeline-rows > li {
    grid-template-columns: 1.25rem minmax(0, 1fr) auto;
  }
  .timeline-row-provider,
  .timeline-rows > li > .archives-dim,
  .timeline-row-url {
    grid-column: 2 / -1;
  }
  .timeline-row-actions {
    grid-column: 2 / -1;
  }
}
@media (width < 640px) {
  .timeline-form .console-readout-rows > div {
    grid-template-columns: 5rem minmax(0, 1fr);
  }
  .timeline-bucket-list > li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .timeline-bucket-note {
    grid-column: 1 / -1;
  }
}
</style>
