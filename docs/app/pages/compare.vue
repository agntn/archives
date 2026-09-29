<script setup lang="ts">
import type { ArchivedPage } from "@agntn/archives";
import type { DiffDetails, SnapshotDetails } from "@agntn/archives/tool-operations";
import { captureStamp, errorText, pageKey, providerArgument, sameResource, sortChronological, type ApiResult } from "../utils/capture";
import { dateOnly, shortStamp } from "../utils/format";
import { PROVIDERS } from "../utils/providers";
import { fencedBody } from "../utils/timeline";

definePageMeta({ layout: "default" });
useSeoMeta({
  title: "Compare · @agntn/archives",
  description: "Two captures of one page side by side, with the diff between them.",
});

const route = useRoute();
const router = useRouter();

const form = reactive({ target: "example.com", provider: "wayback", limit: 50 });
const listing = reactive<{ loading: boolean; error?: string; result?: ApiResult<SnapshotDetails> }>({ loading: false });
/** The one page's own captures; the archive's prefix listing also brings its neighbours, which a diff must not mix in. */
const pages = computed(() => {
  const all = sortChronological(listing.result?.details.response.pages ?? []);
  const own = all.filter((page) => sameResource(page.url, form.target));
  return own.length >= 2 ? own : all;
});
const beforeIndex = ref(0);
const afterIndex = ref(0);
const before = computed(() => pages.value[beforeIndex.value]);
const after = computed(() => pages.value[afterIndex.value]);
const format = ref<"text" | "raw">("text");
const diff = reactive<{ loading: boolean; error?: string; result?: ApiResult<DiffDetails> }>({ loading: false });
const patch = computed(() => (diff.result ? fencedBody(diff.result.text) : ""));

const bodyProviders = PROVIDERS.filter((provider) => provider.content && !provider.needs);
const providerItems = bodyProviders.map((provider) => ({ label: provider.label, value: provider.slug, icon: provider.icon }));
const pickedProvider = computed(() => providerItems.find((item) => item.value === form.provider));

function replaceQuery() {
  const query: Record<string, string> = { target: form.target, provider: form.provider };
  if (before.value) {
    query.before = captureStamp(before.value);
  }
  if (after.value) {
    query.after = captureStamp(after.value);
  }
  if (format.value !== "text") {
    query.format = format.value;
  }
  void router.replace({ query });
}

function indexOfStamp(stamp: string | undefined): number | undefined {
  if (!stamp) {
    return undefined;
  }
  const exact = pages.value.findIndex((page) => captureStamp(page) === stamp || page.timestamp === stamp);
  if (exact >= 0) {
    return exact;
  }
  const nearest = pages.value.findIndex((page) => captureStamp(page) >= stamp);
  return nearest >= 0 ? nearest : undefined;
}

async function load(deepLink: { before?: string; after?: string } = {}) {
  const target = form.target.trim();
  if (!target) {
    return;
  }
  listing.loading = true;
  listing.error = undefined;
  diff.result = undefined;
  diff.error = undefined;
  try {
    listing.result = await $fetch<ApiResult<SnapshotDetails>>("/api/snapshots", {
      retry: 0,
      query: { target, provider: form.provider, limit: form.limit },
    });
    const count = pages.value.length;
    beforeIndex.value = indexOfStamp(deepLink.before) ?? 0;
    afterIndex.value = indexOfStamp(deepLink.after) ?? Math.max(0, count - 1);
    if (afterIndex.value < beforeIndex.value) {
      [beforeIndex.value, afterIndex.value] = [afterIndex.value, beforeIndex.value];
    }
    replaceQuery();
    void runDiff();
  } catch (error) {
    listing.result = undefined;
    listing.error = errorText(error);
  } finally {
    listing.loading = false;
  }
}

async function runDiff() {
  if (!before.value || !after.value || pageKey(before.value) === pageKey(after.value)) {
    diff.result = undefined;
    return;
  }
  diff.loading = true;
  diff.error = undefined;
  try {
    diff.result = await $fetch<ApiResult<DiffDetails>>("/api/diff", {
      retry: 0,
      query: {
        target: form.target.trim(),
        provider: providerArgument(before.value),
        before: before.value.timestamp,
        after: after.value.timestamp,
        format: format.value,
        maxChars: 12_000,
      },
    });
  } catch (error) {
    diff.result = undefined;
    diff.error = errorText(error);
  } finally {
    diff.loading = false;
  }
}

function pick(side: "before" | "after", index: number) {
  if (side === "before") {
    beforeIndex.value = Math.min(index, afterIndex.value);
  } else {
    afterIndex.value = Math.max(index, beforeIndex.value);
  }
  replaceQuery();
  void runDiff();
}

/** Moves both ends one capture along, so a step walks the whole history without picking dates. */
function walk(delta: -1 | 1) {
  const nextBefore = beforeIndex.value + delta;
  const nextAfter = afterIndex.value + delta;
  if (nextBefore < 0 || nextAfter >= pages.value.length) {
    return;
  }
  beforeIndex.value = nextBefore;
  afterIndex.value = nextAfter;
  replaceQuery();
  void runDiff();
}

function setFormat(next: "text" | "raw") {
  format.value = next;
  replaceQuery();
  void runDiff();
}

const span = computed(() => {
  if (!before.value || !after.value) {
    return "";
  }
  return `${dateOnly(before.value.timestamp)} → ${dateOnly(after.value.timestamp)}`;
});

let bootstrapped = false;
function applyDeepLink(query: Record<string, unknown>) {
  const read = (key: string) => (typeof query[key] === "string" ? (query[key] as string).trim() : "");
  if (bootstrapped || !read("target")) {
    return;
  }
  bootstrapped = true;
  form.target = read("target");
  form.provider = read("provider") || "wayback";
  format.value = read("format") === "raw" ? "raw" : "text";
  void load({ before: read("before") || undefined, after: read("after") || undefined });
}

onMounted(() => {
  watch(() => route.query, applyDeepLink, { immediate: true, deep: true });
});

const pageOf = (page: ArchivedPage | undefined) => page;
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero
      eyebrow="compare"
      title="Two captures."
      accent="Side by side."
      description="One page, one archive, two dates. Both captures play back next to each other, the diff sits underneath, and the sliders walk the whole history."
      circuit="pair"
    >
      <template #instrument>
        <div class="compare-stack">
          <ExplorerPanel
            as="form"
            tag="Call"
            role="search"
            label="Load the captures of one page"
            :busy="listing.loading"
            :meta="pickedProvider?.label"
            @submit.prevent="load()"
          >
            <template #title>snapshots(<span class="tok-str">"{{ form.target || "example.com" }}"</span>)</template>
            <div class="archives-band compare-form">
              <div class="console-readout">
                <dl class="console-readout-rows">
                  <div>
                    <dt><label for="compare-target">Page</label></dt>
                    <dd>
                      <UInput id="compare-target" v-model="form.target" variant="none" placeholder="https://example.com/" autocomplete="off" spellcheck="false" class="w-full" />
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
                    <dt>Why one</dt>
                    <dd class="archives-dim">a diff never mixes archives, so replay rewriting never reads as a change</dd>
                  </div>
                </dl>
              </div>
              <div>
                <UButton type="submit" color="primary" variant="solid" :loading="listing.loading" trailing-icon="i-lucide-search" label="Load" />
              </div>
            </div>
          </ExplorerPanel>

          <ExplorerPanel v-if="listing.error" tag="Error" title="snapshots" label="Listing failed">
            <div class="archives-band">
              <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ listing.error }}</p>
            </div>
          </ExplorerPanel>

          <template v-if="pages.length > 1 && before && after">
            <ExplorerPanel tag="List" label="Pick the pair" :meta="span" :sweep="`${beforeIndex}-${afterIndex}`">
              <template #title>{{ form.target }}<span class="console-file">{{ pages.length }} captures</span></template>
              <div class="archives-band compare-pick">
                <div class="console-readout">
                  <dl class="console-readout-rows">
                    <div>
                      <dt>Before</dt>
                      <dd class="compare-slider">
                        <USlider
                          :model-value="beforeIndex"
                          :min="0"
                          :max="pages.length - 1"
                          aria-label="Before"
                          @update:model-value="pick('before', Number($event))"
                        />
                        <span class="archives-value">{{ shortStamp(before.timestamp) }}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>After</dt>
                      <dd class="compare-slider">
                        <USlider
                          :model-value="afterIndex"
                          :min="0"
                          :max="pages.length - 1"
                          aria-label="After"
                          @update:model-value="pick('after', Number($event))"
                        />
                        <span class="console-accent">{{ shortStamp(after.timestamp) }}</span>
                      </dd>
                    </div>
                  </dl>
                </div>
                <CaptureStrip :pages="pages" :current-key="pageKey(after)" :key-of="pageKey" @select="pick('after', pages.findIndex((page) => pageKey(page) === pageKey($event)))" />
              </div>
              <template #footer>
                <span>Walk the history one pair at a time.</span>
                <div class="console-controls" aria-label="Pairs">
                  <UButton color="neutral" variant="subtle" square icon="i-lucide-chevron-left" aria-label="Earlier pair" :disabled="beforeIndex === 0" @click="walk(-1)" />
                  <span>Pair</span>
                  <UButton color="neutral" variant="subtle" square icon="i-lucide-chevron-right" aria-label="Later pair" :disabled="afterIndex >= pages.length - 1" @click="walk(1)" />
                </div>
              </template>
            </ExplorerPanel>

            <div class="compare-split">
              <CaptureViewer :key="`before-${pageKey(before)}`" :page="pageOf(before)!" :closable="false" :keyboard="false" height="60vh" />
              <CaptureViewer :key="`after-${pageKey(after)}`" :page="pageOf(after)!" :closable="false" :keyboard="false" height="60vh" />
            </div>

            <ExplorerPanel tag="Call" label="Diff of the pair" :busy="diff.loading" :sweep="diff.result?.fetchedAt" :meta="span">
              <template #title>archives_diff(<span class="tok-str">"{{ format }}"</span>)</template>
              <div class="archives-band compare-diff-head">
                <div class="compare-formats" aria-label="Diff format">
                  <UButton
                    v-for="option in ['text', 'raw'] as const"
                    :key="option"
                    :color="format === option ? 'primary' : 'neutral'"
                    variant="chip"
                    :label="option"
                    :disabled="diff.loading"
                    @click="setFormat(option)"
                  />
                </div>
                <p v-if="diff.loading" class="archives-note">
                  <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
                  Reading both captures and comparing…
                </p>
                <p v-else-if="diff.error" class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ diff.error }}</p>
                <p v-else-if="!diff.result" class="archives-note">Pick two different captures.</p>
                <p v-else class="compare-stats">
                  <span class="compare-add">+{{ diff.result.details.result?.additions ?? 0 }}</span>
                  <span class="compare-del">−{{ diff.result.details.result?.deletions ?? 0 }}</span>
                  <span>before <span class="archives-value">{{ diff.result.details.result?.before.timestamp }}</span></span>
                  <span>after <span class="archives-value">{{ diff.result.details.result?.after.timestamp }}</span></span>
                  <span v-if="diff.result.details.result?.partial" class="compare-del">partial: a body was cut</span>
                  <span v-if="diff.result.details.result?.identical">identical</span>
                </p>
              </div>
              <div v-if="diff.result && patch" class="archives-band">
                <DiffLines :patch="patch" />
              </div>
            </ExplorerPanel>
          </template>

          <ExplorerPanel v-else-if="listing.result" tag="List" :title="form.target" label="Too few captures">
            <div class="archives-band">
              <p class="archives-note">
                This archive lists fewer than two captures for the page. Try the timeline with
                <code class="archives-code">provider=all</code>.
              </p>
            </div>
          </ExplorerPanel>
        </div>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.compare-stack {
  display: grid;
  gap: 28px;
}
.compare-stack > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
.compare-form,
.compare-pick,
.compare-diff-head {
  display: grid;
  gap: 16px;
}
.compare-form .console-readout-rows > div,
.compare-pick .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
.compare-slider {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 9.5rem;
  align-items: center;
  gap: 16px;
}
.compare-slider > span {
  text-align: right;
}
.compare-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
}
.compare-split > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
.compare-formats {
  display: flex;
  gap: 6px;
}
.compare-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ui-text-dimmed);
}
.compare-add {
  color: var(--archives-add);
}
.compare-del {
  color: var(--archives-del);
}
@media (width < 64rem) {
  .compare-split {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (width < 640px) {
  .compare-form .console-readout-rows > div,
  .compare-pick .console-readout-rows > div {
    grid-template-columns: 5rem minmax(0, 1fr);
  }
  .compare-slider {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .compare-slider > span {
    text-align: left;
  }
}
</style>
