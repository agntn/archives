<script setup lang="ts">
import type { SnapshotSample } from "../../utils/landing-fixtures";
import { dateOnly } from "../../utils/format";
import { PROVIDERS_IN_ALL, providerLabel } from "../../utils/providers";
import { groupByProvider, yearBuckets, type ProviderBucket } from "../../utils/timeline";

const props = defineProps<{
  target: string;
  sample: SnapshotSample | undefined;
  tick: number;
}>();

const emit = defineEmits<{
  step: [delta: number];
  pause: [value: boolean];
}>();

const response = computed(() => props.sample?.details.response);

const rows = computed(() => {
  const buckets = response.value ? groupByProvider(response.value) : [];
  return PROVIDERS_IN_ALL.map((provider) => ({
    ...provider,
    bucket: buckets.find((row) => row.provider === provider.meta),
  }));
});

const years = computed(() => yearBuckets(response.value?.pages ?? []));
const peak = computed(() => Math.max(1, ...years.value.map((year) => year.count)));
const hotYear = computed(() => {
  const busy = years.value.filter((year) => year.count > 0);
  return busy.length ? busy[props.tick % busy.length]!.year : undefined;
});
const newest = computed(() => (response.value?.pages ?? []).slice(0, 3));

function note(bucket: ProviderBucket | undefined): string {
  if (!bucket) {
    return "waiting";
  }
  if (bucket.state === "ok") {
    return `${bucket.count} · ${bucket.first?.slice(0, 4)} – ${bucket.last?.slice(0, 4)}`;
  }
  if (bucket.state === "failed") {
    return /timeout/iu.test(bucket.reason ?? "") ? "timed out" : "request failed";
  }
  return bucket.state === "unsupported" ? "no list-by-domain API" : "none in the newest 12";
}
</script>

<template>
  <div
    class="archives-frame overflow-hidden rounded-xl"
    @mouseenter="emit('pause', true)"
    @mouseleave="emit('pause', false)"
  >
    <div class="flex items-center justify-between gap-3 border-b border-muted px-5 py-3">
      <p class="font-mono text-xs text-muted">
        target
        <span class="archives-gold ms-2 text-sm">
          <Transition name="archives-roll" mode="out-in">
            <span :key="target" class="archives-roll-slot">{{ target }}</span>
          </Transition>
        </span>
      </p>
      <p class="font-mono text-[11px] text-dimmed">
        {{ sample?.live ? "live · docs worker" : `sample · ${dateOnly(sample?.fetchedAt ?? "")}` }}
      </p>
    </div>

    <ol class="archives-pipeline">
      <li class="archives-step">
        <div class="archives-step-head">
          <span class="archives-step-index">1</span>
          <span class="archives-step-title">one call</span>
          <span class="archives-step-note">providers.all()</span>
        </div>
        <pre class="archives-step-value archives-step-code"><code><span class="tok-kw">await</span> archive.<span class="tok-fn">snapshots</span>(<span class="tok-str">"<Transition name="archives-roll" mode="out-in"><span :key="target" class="archives-roll-slot">{{ target }}</span></Transition>"</span>, { limit: <span class="tok-key">12</span> });</code></pre>
      </li>

      <li class="archives-step">
        <div class="archives-step-head">
          <span class="archives-step-index">2</span>
          <span class="archives-step-title">fan-out</span>
          <span class="archives-step-note">every provider answers, or says why not</span>
        </div>
        <ul class="archives-rows">
          <li v-for="row in rows" :key="row.slug" class="archives-row">
            <span class="archives-row-main">
              <span class="archives-row-label">{{ row.label }}</span>
              <span class="archives-row-note" :title="row.bucket?.reason">{{ note(row.bucket) }}</span>
            </span>
            <span class="archives-state" :class="`archives-state-${row.bucket?.state ?? 'empty'}`">
              {{ row.bucket?.state ?? "…" }}
            </span>
          </li>
        </ul>
      </li>

      <li class="archives-step">
        <div class="archives-step-head">
          <span class="archives-step-index">3</span>
          <span class="archives-step-title">one list</span>
          <span class="archives-step-note">{{ response?.pages.length ?? 0 }} pages · newest first · same shape from every source</span>
        </div>
        <div v-if="years.length">
          <div class="archives-years" role="img" :aria-label="`Captures per year from ${years[0]?.year} to ${years.at(-1)?.year}`">
            <span
              v-for="year in years"
              :key="year.year"
              class="archives-year"
              :class="{ 'archives-year-hot': year.year === hotYear }"
              :style="{ height: `${Math.max(4, Math.round((year.count / peak) * 100))}%` }"
              :title="`${year.year}: ${year.count}`"
            />
          </div>
          <div class="archives-year-axis">
            <span>{{ years[0]?.year }}</span>
            <span>{{ years.at(-1)?.year }}</span>
          </div>
        </div>
        <ul class="archives-formats mt-2">
          <li v-for="page in newest" :key="page.snapshot" class="archives-format">
            <span class="archives-format-label">
              <span class="font-mono text-xs text-highlighted"><LandingStamp :value="dateOnly(page.timestamp)" /></span>
              <span class="font-mono text-[10px] text-dimmed">{{ providerLabel(String(page._meta.provider ?? "")) }}</span>
            </span>
            <span class="archives-step-value"><LandingStamp :value="page.snapshot" /></span>
          </li>
        </ul>
      </li>
    </ol>

    <div class="flex flex-wrap items-center gap-2 border-t border-muted px-5 py-3">
      <button type="button" class="archives-btn" @click="emit('step', -1)">
        <UIcon name="i-lucide-chevron-left" class="size-4" />
        Previous
      </button>
      <button type="button" class="archives-btn" @click="emit('step', 1)">
        Next target
        <UIcon name="i-lucide-chevron-right" class="size-4" />
      </button>
      <NuxtLink
        :to="{ path: '/timeline', query: { target } }"
        class="ms-auto inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
      >
        open in the timeline
        <UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
      </NuxtLink>
    </div>
  </div>
</template>
