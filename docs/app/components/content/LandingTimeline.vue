<script setup lang="ts">
import type { SnapshotSample } from "../../utils/landing-fixtures";
import { dateOnly } from "../../utils/format";
import { PROVIDERS_IN_ALL } from "../../utils/providers";
import { groupByProvider, yearBuckets } from "../../utils/timeline";

/**
 * One `snapshots(target)` over `providers.all()`, the way an archive remembers a site: captures
 * piled up per year on one axis, the archives that answered as cells under it.
 */
const props = defineProps<{
  target: string;
  sample: SnapshotSample | undefined;
  position: number;
  total: number;
}>();

const emit = defineEmits<{
  step: [delta: number];
  pause: [value: boolean];
}>();

const response = computed(() => props.sample?.details.response);
const pages = computed(() => response.value?.pages ?? []);
const buckets = computed(() => (response.value ? groupByProvider(response.value) : []));
const answered = computed(() => buckets.value.filter((bucket) => bucket.state === "ok").length);

/** The Wayback Machine's first captures; every sample shares the axis from here to the year it was fetched. */
const FIRST_YEAR = 1996;

const captured = computed(() => yearBuckets(pages.value).filter((year) => year.count > 0));
const years = computed(() => {
  const counts = new Map(captured.value.map((year) => [year.year, year.count]));
  const last = Math.max(Number((props.sample?.fetchedAt ?? "").slice(0, 4)) || 0, captured.value.at(-1)?.year ?? 0, FIRST_YEAR);
  return Array.from({ length: last - FIRST_YEAR + 1 }, (_, index) => ({
    year: FIRST_YEAR + index,
    count: counts.get(FIRST_YEAR + index) ?? 0,
  }));
});
const peak = computed(() => Math.max(1, ...years.value.map((year) => year.count)));
const span = computed(() => {
  const first = captured.value[0]?.year;
  const last = captured.value.at(-1)?.year;
  if (first === undefined || last === undefined) return "none";
  return first === last ? String(first) : `${first} → ${last}`;
});
const newest = computed(() => (pages.value[0] ? dateOnly(pages.value[0].timestamp) : "none"));

const call = computed(() => `snapshots("${props.target}", { limit: 50 })`);
</script>

<template>
  <section
    class="tool-console console-wide landing-timeline"
    aria-label="One listing across the archives"
    @mouseenter="emit('pause', true)"
    @mouseleave="emit('pause', false)"
    @focusin="emit('pause', true)"
    @focusout="emit('pause', false)"
  >
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="`archive.${call}`">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">Call</span>snapshots(<span class="tok-str">"{{ target }}"</span>)<span
            class="console-file"
            >{{ String(position + 1).padStart(2, "0") }} / {{ String(total).padStart(2, "0") }}</span
          ></span
        >
      </UTooltip>
      <span class="console-meta">{{ sample?.live ? "live" : `recorded ${dateOnly(sample?.fetchedAt ?? "")}` }}</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="target" class="console-cursor" />
    </div>

    <div class="console-band console-subject-band">
      <div :key="target" class="console-scan" aria-hidden="true" />
      <div class="timeline-left">
        <div class="console-identity-block">
          <ConsoleReticle :key="target" icon="i-lucide-history" />
          <div class="console-name">
            <span class="console-label">Target / <span class="console-label-key">provider=all</span></span>
            <h3 class="console-name-mono timeline-name">{{ target }}</h3>
            <p class="console-about timeline-about">
              {{ pages.length }} captures merged newest first from {{ answered }} of
              {{ PROVIDERS_IN_ALL.length }} archives. The rest say why.
            </p>
          </div>
        </div>

        <!-- The archive's memory of the site: one column per year, its height the captures that year. -->
        <div class="timeline-axis">
          <p class="console-label console-rule-title">
            <span>Captures <span aria-hidden="true">[ per year ]</span></span>
            <span class="console-mark" aria-hidden="true" />
          </p>
          <div
            class="timeline-years"
            role="img"
            :aria-label="`Captures per year from ${years[0]?.year} to ${years.at(-1)?.year}, ${span}`"
          >
            <UTooltip v-for="year in years" :key="`${target}-${year.year}`" :text="`${year.year}: ${year.count}`">
              <span class="timeline-year" :data-empty="year.count === 0" tabindex="-1">
                <span class="timeline-bar" :style="{ transform: `scaleY(${Math.max(0.06, year.count / peak)})` }" />
              </span>
            </UTooltip>
          </div>
          <div class="timeline-scale" aria-hidden="true">
            <span>{{ years[0]?.year }}</span>
            <span>{{ years.at(-1)?.year }}</span>
          </div>
        </div>
      </div>

      <div class="console-readout">
        <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
          <circle cx="3" cy="12" r="2.5" />
          <path d="M5.5 12H14L22 20H32" />
        </svg>
        <dl class="console-readout-rows">
          <div>
            <dt>Captures</dt>
            <dd class="console-accent">{{ pages.length }}</dd>
          </div>
          <div>
            <dt>Span</dt>
            <dd>{{ span }}</dd>
          </div>
          <div>
            <dt>Newest</dt>
            <dd>{{ newest }}</dd>
          </div>
          <div>
            <dt>Answered</dt>
            <dd>{{ answered }} of {{ PROVIDERS_IN_ALL.length }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <div class="console-band">
      <p class="console-label console-rule-title">
        <span>Archives <span aria-hidden="true">[ answered · empty · cannot list · failed ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <ProviderCells :response="response" />
    </div>

    <footer class="console-footer console-footer-plain">
      <NuxtLink :to="{ path: '/timeline', query: { target } }" class="timeline-open"
        ><span aria-hidden="true">→ </span>open {{ target }} in the timeline</NuxtLink
      >
      <div class="console-controls" aria-label="Sample targets">
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-left"
          aria-label="Previous target"
          @click="emit('step', -1)"
        />
        <span>Target</span>
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-right"
          aria-label="Next target"
          @click="emit('step', 1)"
        />
      </div>
    </footer>
  </section>
</template>

<style scoped>
.landing-timeline {
  text-align: left;
}
.timeline-left {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 18px;
  min-width: 0;
}
.timeline-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timeline-about {
  font-size: 14px;
}
.timeline-axis {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-width: 0;
}
.timeline-axis > .console-rule-title {
  margin-bottom: 10px;
}
/* One column per year; the bar grows from the axis by transform only, so the band never changes height. */
.timeline-years {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 56px;
  min-height: 56px;
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
  transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.timeline-year[data-empty="true"] .timeline-bar {
  background: none;
  box-shadow: none;
}
.timeline-year:hover .timeline-bar {
  background: color-mix(in srgb, var(--console-accent) 35%, transparent);
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
.landing-timeline > .console-footer {
  flex-wrap: nowrap;
}
.timeline-open {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
}
.timeline-open:hover {
  color: var(--console-accent);
}
.timeline-open:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .timeline-bar {
    transition: none;
  }
}
</style>
