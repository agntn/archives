<script setup lang="ts">
import type { ArchivedPage } from "@agntn/archives";
import { captureLink, compareLink, errorText } from "../../utils/capture";
import { dateOnly, shortStamp } from "../../utils/format";
import { providerInfo, providerLabel } from "../../utils/providers";

definePageMeta({ layout: "default" });

const route = useRoute();
const domain = computed(() => decodeURIComponent(String(route.params.domain ?? "")));

useSeoMeta({
  title: () => `${domain.value} · coverage · @agntn/archives`,
  description: () => `Which web archives hold ${domain.value}, how many captures, and when.`,
});

interface ProviderCoverage {
  provider: string;
  state: "ok" | "empty" | "unsupported" | "failed";
  count: number;
  first?: string;
  last?: string;
  years: Record<string, number>;
  reason?: string;
  ms: number;
  sample: ArchivedPage[];
}

interface Coverage {
  target: string;
  providers: ProviderCoverage[];
  fetchedAt: string;
}

const state = reactive<{ loading: boolean; error?: string; result?: Coverage }>({ loading: true });

async function load() {
  state.loading = true;
  state.error = undefined;
  try {
    state.result = await $fetch<Coverage>("/api/coverage", { retry: 0, query: { target: domain.value } });
  } catch (error) {
    state.error = errorText(error);
  } finally {
    state.loading = false;
  }
}

const holders = computed(() => state.result?.providers.filter((provider) => provider.state === "ok") ?? []);
const total = computed(() => holders.value.reduce((sum, provider) => sum + provider.count, 0));
const span = computed(() => {
  const firsts = holders.value.map((provider) => provider.first!).sort();
  const lasts = holders.value.map((provider) => provider.last!).sort();
  return firsts.length ? { first: firsts[0]!, last: lasts.at(-1)! } : undefined;
});

const years = computed(() => {
  if (!span.value) {
    return [];
  }
  const start = Number(span.value.first.slice(0, 4));
  const end = Number(span.value.last.slice(0, 4));
  const list: number[] = [];
  for (let year = start; year <= end; year += 1) {
    list.push(year);
  }
  return list;
});

const peak = computed(() => Math.max(1, ...holders.value.flatMap((provider) => Object.values(provider.years))));

function level(count: number | undefined): string {
  if (!count) {
    return "";
  }
  const ratio = count / peak.value;
  return ratio > 0.75 ? "archives-heat-4" : ratio > 0.5 ? "archives-heat-3" : ratio > 0.25 ? "archives-heat-2" : "archives-heat-1";
}

/** Years no archive covers at all: the holes a researcher needs to know about. */
const gaps = computed(() =>
  years.value.filter((year) => !holders.value.some((provider) => provider.years[String(year)])),
);

const oldest = computed(() => {
  const candidates = holders.value.flatMap((provider) => provider.sample);
  return candidates.sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
});
const newest = computed(() => {
  const candidates = holders.value.flatMap((provider) => provider.sample);
  return candidates.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
});
const waybackPair = computed(() => {
  const wayback = holders.value.find((provider) => provider.provider === "wayback");
  if (!wayback || wayback.sample.length < 2) {
    return undefined;
  }
  const sorted = [...wayback.sample].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { before: sorted[0]!, after: sorted.at(-1)! };
});

onMounted(load);
watch(domain, load);
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero eyebrow="coverage" :title="domain" accent="across the archives">
      <p class="mt-3 font-mono text-xs text-dimmed">
        <span v-if="state.result">{{ holders.length }} of {{ state.result.providers.length }} providers hold it · fetched {{ shortStamp(state.result.fetchedAt) }}</span>
        <span v-else-if="state.loading">asking seven archives…</span>
      </p>
    </ToolHero>

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] space-y-6 px-8 py-12 sm:px-12 lg:px-16">
        <p v-if="state.loading" class="archives-frame flex items-center gap-2 rounded-xl px-5 py-4 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Listing every archive in parallel. A cold Wayback query can take half a minute.
        </p>
        <pre v-else-if="state.error" class="archives-body archives-frame rounded-xl" :style="{ color: 'var(--archives-del)' }">{{ state.error }}</pre>

        <template v-else-if="state.result">
          <dl class="archives-frame grid grid-cols-2 overflow-hidden rounded-xl sm:grid-cols-4">
            <div class="px-5 py-5 text-center">
              <dd class="font-mono text-2xl text-highlighted">{{ holders.length }}</dd>
              <dt class="mt-1 font-mono text-[11px] tracking-[0.12em] text-dimmed uppercase">archives hold it</dt>
            </div>
            <div class="border-l border-muted px-5 py-5 text-center">
              <dd class="font-mono text-2xl text-highlighted">{{ total }}</dd>
              <dt class="mt-1 font-mono text-[11px] tracking-[0.12em] text-dimmed uppercase">captures listed</dt>
            </div>
            <div class="border-t border-muted px-5 py-5 text-center sm:border-t-0 sm:border-l">
              <dd class="font-mono text-2xl text-highlighted">{{ span ? span.first.slice(0, 4) : "n/a" }}</dd>
              <dt class="mt-1 font-mono text-[11px] tracking-[0.12em] text-dimmed uppercase">first seen</dt>
            </div>
            <div class="border-t border-l border-muted px-5 py-5 text-center sm:border-t-0">
              <dd class="font-mono text-2xl text-highlighted">{{ span ? span.last.slice(0, 4) : "n/a" }}</dd>
              <dt class="mt-1 font-mono text-[11px] tracking-[0.12em] text-dimmed uppercase">last seen</dt>
            </div>
          </dl>

          <div v-if="years.length" class="archives-frame overflow-hidden rounded-xl">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted px-5 py-3">
              <p class="font-mono text-xs text-muted">captures per year <span class="ms-2 text-dimmed">from the listings each archive could afford</span></p>
              <p v-if="gaps.length" class="font-mono text-[11px]" :style="{ color: 'var(--archives-del)' }">
                no archive covers {{ gaps.length === 1 ? gaps[0] : `${gaps.length} years` }}
              </p>
            </div>
            <div class="overflow-x-auto px-5 py-4">
              <div class="archives-heat" :style="{ gridTemplateColumns: `10rem repeat(${years.length}, minmax(1rem, 1fr))` }">
                <span />
                <span v-for="year in years" :key="`h-${year}`" class="archives-heat-label" :class="{ 'opacity-40': year % 5 !== 0 && years.length > 12 }">{{ year % 5 === 0 || years.length <= 12 ? year : "" }}</span>
                <template v-for="provider in holders" :key="provider.provider">
                  <span class="archives-heat-label flex items-center gap-1.5 pe-2 text-muted">
                    <UIcon :name="providerInfo(provider.provider)?.icon ?? 'i-lucide-archive'" class="size-3.5" />
                    {{ providerLabel(provider.provider) }}
                  </span>
                  <span v-for="year in years" :key="`${provider.provider}-${year}`" class="archives-heat-cell" :class="level(provider.years[String(year)])" :title="`${providerLabel(provider.provider)} ${year}: ${provider.years[String(year)] ?? 0}`" />
                </template>
              </div>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div v-for="provider in state.result.providers" :key="provider.provider" class="archives-frame overflow-hidden rounded-xl">
              <div class="flex items-center justify-between gap-2 border-b border-muted px-5 py-3">
                <NuxtLink :to="providerInfo(provider.provider)?.to ?? '/providers'" class="inline-flex items-center gap-2 text-sm font-medium text-highlighted hover:text-primary">
                  <UIcon :name="providerInfo(provider.provider)?.icon ?? 'i-lucide-archive'" class="size-4 text-muted" />
                  {{ providerLabel(provider.provider) }}
                </NuxtLink>
                <span class="inline-flex items-center gap-2">
                  <span class="font-mono text-[11px] text-dimmed">{{ (provider.ms / 1000).toFixed(1) }} s</span>
                  <span class="archives-state" :class="`archives-state-${provider.state}`">{{ provider.state }}</span>
                </span>
              </div>
              <div v-if="provider.state === 'ok'" class="px-5 py-4">
                <p class="font-mono text-xs text-muted">
                  <span class="text-highlighted">{{ provider.count }}</span> captures ·
                  {{ dateOnly(provider.first ?? "") }} to {{ dateOnly(provider.last ?? "") }}
                </p>
                <ul class="mt-3 space-y-1.5">
                  <li v-for="page in provider.sample" :key="page.snapshot" class="flex items-center justify-between gap-3 font-mono text-xs">
                    <NuxtLink :to="captureLink(page)" class="text-primary hover:underline">{{ shortStamp(page.timestamp) }}</NuxtLink>
                    <span class="truncate text-dimmed" :title="page.url">{{ page.url }}</span>
                  </li>
                </ul>
              </div>
              <p v-else class="px-5 py-4 text-xs text-muted">{{ provider.reason ?? "Nothing listed for this domain." }}</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <NuxtLink :to="{ path: '/timeline', query: { target: domain, provider: 'all', limit: '50' } }" class="archives-btn">
              <UIcon name="i-lucide-history" class="size-4" />
              Open in the timeline
            </NuxtLink>
            <NuxtLink v-if="waybackPair" :to="compareLink(waybackPair.before, waybackPair.after)" class="archives-btn">
              <UIcon name="i-lucide-columns-2" class="size-4" />
              Compare oldest and newest on Wayback
            </NuxtLink>
            <NuxtLink :to="{ path: '/urls', query: { target: domain } }" class="archives-btn">
              <UIcon name="i-lucide-list" class="size-4" />
              Archived URLs
            </NuxtLink>
            <NuxtLink v-if="oldest" :to="captureLink(oldest)" class="archives-btn">
              <UIcon name="i-lucide-eye" class="size-4" />
              Oldest capture
            </NuxtLink>
            <NuxtLink v-if="newest" :to="captureLink(newest)" class="archives-btn">
              <UIcon name="i-lucide-eye" class="size-4" />
              Newest capture
            </NuxtLink>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
