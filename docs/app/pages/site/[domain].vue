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
  state: "ok" | "empty" | "unsupported" | "unreachable" | "failed";
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

/** Four steps of density, 0 for a year the archive has nothing for. */
function level(count: number | undefined): number {
  if (!count) {
    return 0;
  }
  const ratio = count / peak.value;
  return ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
}

type BadgeColor = "neutral" | "error";
type BadgeVariant = "subtle" | "outline";

/** How each archive's answer reads: holding it bright, nothing or no endpoint quiet, a failure red. */
const STATE: Record<ProviderCoverage["state"], { color: BadgeColor; variant: BadgeVariant }> = {
  ok: { color: "neutral", variant: "subtle" },
  empty: { color: "neutral", variant: "outline" },
  unsupported: { color: "neutral", variant: "outline" },
  unreachable: { color: "neutral", variant: "outline" },
  failed: { color: "error", variant: "outline" },
};

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
    <ToolHero eyebrow="coverage" :title="domain" accent="across the archives." circuit="coverage">
      <template #instrument>
        <ExplorerPanel
          tag="ID"
          :title="domain"
          label="Coverage of one domain"
          :busy="state.loading"
          :sweep="state.result?.fetchedAt"
          :meta="state.result ? `fetched ${shortStamp(state.result.fetchedAt)}` : 'asking every open archive'"
        >
          <div v-if="state.loading" class="archives-band">
            <p class="archives-note">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
              Listing every archive in parallel. A cold Wayback query can take half a minute.
            </p>
          </div>
          <div v-else-if="state.error" class="archives-band">
            <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ state.error }}</p>
          </div>

          <template v-else-if="state.result">
            <div class="console-band console-subject-band">
              <div :key="state.result.fetchedAt" class="console-scan" aria-hidden="true" />
              <div class="console-identity-block">
                <ConsoleReticle :key="domain" icon="i-lucide-map" />
                <div class="console-name">
                  <span class="console-label">Site / <span class="console-label-key">coverage</span></span>
                  <h3 class="console-name-mono">{{ domain }}</h3>
                  <p class="console-about">
                    {{ holders.length }} of {{ state.result.providers.length }} archives list captures of it.
                    <template v-if="gaps.length">No archive covers {{ gaps.length === 1 ? gaps[0] : `${gaps.length} of the years` }} in between.</template>
                  </p>
                </div>
              </div>
              <div class="console-readout">
                <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
                  <circle cx="3" cy="12" r="2.5" />
                  <path d="M5.5 12H14L22 20H32" />
                </svg>
                <dl class="console-readout-rows">
                  <div>
                    <dt>Held by</dt>
                    <dd class="console-accent">{{ holders.length }} archives</dd>
                  </div>
                  <div>
                    <dt>Captures</dt>
                    <dd>{{ total }} listed</dd>
                  </div>
                  <div>
                    <dt>First seen</dt>
                    <dd>{{ span ? dateOnly(span.first) : "none" }}</dd>
                  </div>
                  <div>
                    <dt>Last seen</dt>
                    <dd>{{ span ? dateOnly(span.last) : "none" }}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div v-if="years.length" class="archives-band">
              <p class="console-label console-rule-title">
                <span>Heatmap <span aria-hidden="true">[ captures per year · from what each archive listed ]</span></span>
                <span class="console-mark" aria-hidden="true" />
              </p>
              <div class="heat-scroll">
                <div class="heat" :style="{ gridTemplateColumns: `10rem repeat(${years.length}, minmax(0.9rem, 1fr))` }">
                  <span />
                  <span v-for="year in years" :key="`h-${year}`" class="heat-year">{{ year % 5 === 0 || years.length <= 12 ? year : "" }}</span>
                  <template v-for="provider in holders" :key="provider.provider">
                    <span class="heat-name">
                      <UIcon :name="providerInfo(provider.provider)?.icon ?? 'i-lucide-archive'" class="size-3.5 flex-none" aria-hidden="true" />
                      <span>{{ providerLabel(provider.provider) }}</span>
                    </span>
                    <UTooltip
                      v-for="year in years"
                      :key="`${provider.provider}-${year}`"
                      :text="`${providerLabel(provider.provider)} ${year}: ${provider.years[String(year)] ?? 0}`"
                    >
                      <span class="heat-cell" :data-level="level(provider.years[String(year)])" />
                    </UTooltip>
                  </template>
                </div>
              </div>
            </div>

            <div class="archives-band site-band-rows">
              <p class="console-label console-rule-title">
                <span>Archives <span aria-hidden="true">[ every one asked ]</span></span>
                <span class="console-mark" aria-hidden="true" />
              </p>
            </div>
            <ul class="archives-rows site-rows">
              <li v-for="provider in state.result.providers" :key="provider.provider">
                <NuxtLink :to="providerInfo(provider.provider)?.to ?? '/providers'" class="site-name">
                  <UIcon :name="providerInfo(provider.provider)?.icon ?? 'i-lucide-archive'" class="size-3.5 flex-none" aria-hidden="true" />
                  <span>{{ providerLabel(provider.provider) }}</span>
                </NuxtLink>
                <span><UBadge :color="STATE[provider.state].color" :variant="STATE[provider.state].variant" :label="provider.state" /></span>
                <span v-if="provider.state === 'ok'" class="site-span">
                  <span class="archives-value">{{ provider.count }}</span> · {{ dateOnly(provider.first ?? "") }} → {{ dateOnly(provider.last ?? "") }}
                </span>
                <span v-else class="site-reason">{{ provider.reason ?? "Nothing listed for this domain." }}</span>
                <span class="archives-dim site-ms">{{ (provider.ms / 1000).toFixed(1) }} s</span>
                <span v-if="provider.state === 'ok' && provider.sample.length" class="site-samples">
                  <UTooltip v-for="page in provider.sample" :key="page.snapshot" :text="page.url">
                    <NuxtLink :to="captureLink(page)">{{ shortStamp(page.timestamp) }}</NuxtLink>
                  </UTooltip>
                </span>
              </li>
            </ul>

            <div class="archives-band site-leads">
              <p class="console-label console-rule-title">
                <span>Next <span aria-hidden="true">[ same domain, other pages ]</span></span>
                <span class="console-mark" aria-hidden="true" />
              </p>
              <NuxtLink :to="{ path: '/timeline', query: { target: domain, provider: 'all', limit: '50' } }" class="console-lead">
                <span class="console-tag">Timeline</span><span class="site-lead-text">every capture, newest first</span><span class="console-leader" aria-hidden="true" />
              </NuxtLink>
              <NuxtLink :to="{ path: '/urls', query: { target: domain } }" class="console-lead">
                <span class="console-tag">URLs</span><span class="site-lead-text">the archived URLs under the domain</span><span class="console-leader" aria-hidden="true" />
              </NuxtLink>
              <NuxtLink v-if="waybackPair" :to="compareLink(waybackPair.before, waybackPair.after)" class="console-lead">
                <span class="console-tag">Compare</span><span class="site-lead-text">oldest and newest on the Wayback Machine</span><span class="console-leader" aria-hidden="true" />
              </NuxtLink>
              <NuxtLink v-if="oldest" :to="captureLink(oldest)" class="console-lead">
                <span class="console-tag">Oldest</span><span class="site-lead-text">{{ shortStamp(oldest.timestamp) }} · {{ providerLabel(String(oldest._meta.provider ?? "")) }}</span><span class="console-leader" aria-hidden="true" />
              </NuxtLink>
              <NuxtLink v-if="newest" :to="captureLink(newest)" class="console-lead">
                <span class="console-tag">Newest</span><span class="site-lead-text">{{ shortStamp(newest.timestamp) }} · {{ providerLabel(String(newest._meta.provider ?? "")) }}</span><span class="console-leader" aria-hidden="true" />
              </NuxtLink>
            </div>
          </template>

          <template #footer>
            <NuxtLink to="/site" class="site-back"><span aria-hidden="true">→ </span>another domain</NuxtLink>
            <span class="console-meta">cached per archive, never a failed probe</span>
          </template>
        </ExplorerPanel>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.heat-scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
}
.heat {
  display: grid;
  gap: 3px;
  min-width: 36rem;
  font-family: var(--font-mono);
  font-size: 10px;
}
.heat-year {
  overflow: visible;
  white-space: nowrap;
  letter-spacing: 0.06em;
  color: var(--ui-text-dimmed);
}
.heat-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-right: 8px;
  overflow: hidden;
  font-size: 11px;
  white-space: nowrap;
  color: var(--ui-text-muted);
}
.heat-cell {
  display: block;
  height: 16px;
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.heat-cell[data-level="1"] {
  background: color-mix(in srgb, var(--console-accent) 18%, transparent);
}
.heat-cell[data-level="2"] {
  background: color-mix(in srgb, var(--console-accent) 38%, transparent);
}
.heat-cell[data-level="3"] {
  background: color-mix(in srgb, var(--console-accent) 62%, transparent);
}
.heat-cell[data-level="4"] {
  background: var(--console-accent);
}
.site-band-rows {
  padding-bottom: 4px;
}
.site-rows > li {
  grid-template-columns: minmax(9rem, 12rem) 7.5rem minmax(0, 1fr) 3.5rem;
}
.site-name {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.site-name > .iconify {
  position: relative;
  top: 2px;
  color: var(--ui-text-muted);
}
.site-reason {
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.site-ms {
  text-align: right;
}
.site-samples {
  grid-column: 3 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 11px;
}
.site-leads {
  border-top: 1px solid var(--console-line);
}
.site-leads > .console-lead {
  flex-wrap: nowrap;
  min-width: 0;
  margin: 0 0 8px;
}
.site-lead-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.site-leads > .console-lead:hover .site-lead-text {
  color: var(--console-accent);
}
.site-back {
  color: var(--ui-text-muted);
}
.site-back:hover {
  color: var(--console-accent);
}
@media (width < 52rem) {
  .site-rows > li {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
  .site-span,
  .site-reason,
  .site-samples {
    grid-column: 1 / -1;
  }
}
</style>
