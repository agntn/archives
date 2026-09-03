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
    />

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] space-y-6 px-8 py-12 sm:px-12 lg:px-16">
        <form class="archives-frame overflow-hidden rounded-xl" @submit.prevent="load()">
          <div class="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-6">
            <label class="sm:col-span-2 lg:col-span-3">
              <span class="archives-label">page · URL or domain</span>
              <input v-model="form.target" type="text" class="archives-field font-mono" placeholder="https://example.com/" autocomplete="off" spellcheck="false" />
            </label>
            <label class="lg:col-span-2">
              <span class="archives-label">provider · one archive, so the diff means something</span>
              <select v-model="form.provider" class="archives-select">
                <option v-for="provider in bodyProviders" :key="provider.slug" :value="provider.slug">{{ provider.label }}</option>
              </select>
            </label>
            <div class="flex items-end">
              <UButton type="submit" color="primary" class="w-full justify-center" :loading="listing.loading" icon="i-lucide-search">Load</UButton>
            </div>
          </div>
        </form>

        <pre v-if="listing.error" class="archives-body archives-frame rounded-xl" :style="{ color: 'var(--archives-del)' }">{{ listing.error }}</pre>

        <template v-if="pages.length > 1 && before && after">
          <div class="archives-frame overflow-hidden rounded-xl">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-muted px-5 py-3">
              <p class="font-mono text-xs text-muted">
                <span class="text-dimmed">captures</span>
                <span class="ms-2 text-highlighted">{{ pages.length }}</span>
                <span class="ms-3 text-dimmed">{{ span }}</span>
              </p>
              <span class="inline-flex items-center gap-1">
                <button type="button" class="archives-btn h-7 px-2 text-xs" :disabled="beforeIndex === 0" @click="walk(-1)">
                  <UIcon name="i-lucide-chevron-left" class="size-4" />
                  earlier pair
                </button>
                <button type="button" class="archives-btn h-7 px-2 text-xs" :disabled="afterIndex >= pages.length - 1" @click="walk(1)">
                  later pair
                  <UIcon name="i-lucide-chevron-right" class="size-4" />
                </button>
              </span>
            </div>
            <div class="grid gap-5 px-5 py-4 lg:grid-cols-2">
              <label>
                <span class="archives-label">before · {{ shortStamp(before.timestamp) }}</span>
                <input type="range" class="archives-range" :min="0" :max="pages.length - 1" :value="beforeIndex" @input="pick('before', Number(($event.target as HTMLInputElement).value))" />
              </label>
              <label>
                <span class="archives-label">after · {{ shortStamp(after.timestamp) }}</span>
                <input type="range" class="archives-range" :min="0" :max="pages.length - 1" :value="afterIndex" @input="pick('after', Number(($event.target as HTMLInputElement).value))" />
              </label>
            </div>
            <div class="border-t border-muted px-5 pt-3 pb-1">
              <CaptureStrip :pages="pages" :current-key="pageKey(after)" :key-of="pageKey" @select="pick('after', pages.findIndex((page) => pageKey(page) === pageKey($event)))" />
            </div>
          </div>

          <div class="archives-split overflow-hidden rounded-xl archives-frame">
            <CaptureViewer :key="`before-${pageKey(before)}`" :page="pageOf(before)!" :closable="false" :keyboard="false" height="60vh" />
            <CaptureViewer :key="`after-${pageKey(after)}`" :page="pageOf(after)!" :closable="false" :keyboard="false" height="60vh" />
          </div>

          <div class="archives-frame overflow-hidden rounded-xl">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted px-5 py-3">
              <p class="font-mono text-xs text-muted">
                <span class="text-dimmed">archives_diff</span>
                <span class="ms-2 text-highlighted">{{ span }}</span>
              </p>
              <div class="flex items-center gap-1">
                <button v-for="option in ['text', 'raw'] as const" :key="option" type="button" class="archives-btn h-7 px-2 text-xs" :class="{ 'text-primary': format === option }" :disabled="diff.loading" @click="setFormat(option)">
                  {{ option }}
                </button>
              </div>
            </div>
            <p v-if="diff.loading" class="flex items-center gap-2 px-5 py-4 text-sm text-muted">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
              Reading both captures and comparing…
            </p>
            <pre v-else-if="diff.error" class="archives-body" :style="{ color: 'var(--archives-del)' }">{{ diff.error }}</pre>
            <p v-else-if="!diff.result" class="px-5 py-4 text-sm text-muted">Pick two different captures.</p>
            <template v-else>
              <div class="flex flex-wrap gap-x-4 gap-y-1 border-b border-muted px-5 py-2.5 font-mono text-[11px] text-dimmed">
                <span :style="{ color: 'var(--archives-add)' }">+{{ diff.result.details.result?.additions ?? 0 }}</span>
                <span :style="{ color: 'var(--archives-del)' }">−{{ diff.result.details.result?.deletions ?? 0 }}</span>
                <span>before <span class="text-muted">{{ diff.result.details.result?.before.timestamp }}</span></span>
                <span>after <span class="text-muted">{{ diff.result.details.result?.after.timestamp }}</span></span>
                <span v-if="diff.result.details.result?.partial" :style="{ color: 'var(--archives-del)' }">partial: a body was truncated</span>
                <span v-if="diff.result.details.result?.identical">identical</span>
              </div>
              <DiffLines :patch="patch" />
            </template>
          </div>
        </template>
        <p v-else-if="listing.result" class="archives-frame rounded-xl px-5 py-4 text-sm text-muted">
          This archive lists fewer than two captures for the page. Try the timeline with <span class="font-mono">provider=all</span>.
        </p>
      </div>
    </section>
  </div>
</template>
