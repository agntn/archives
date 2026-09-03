<script setup lang="ts">
import type { ArchivedPage } from "@agntn/archives";
import { shortStamp } from "../../utils/format";
import { providerLabel } from "../../utils/providers";

const props = defineProps<{
  /** Captures in chronological order. */
  pages: readonly ArchivedPage[];
  currentKey?: string;
  keyOf: (page: ArchivedPage) => string;
}>();

const emit = defineEmits<{ select: [page: ArchivedPage] }>();

const span = computed(() => {
  const times = props.pages.map((page) => Date.parse(page.timestamp)).filter((time) => Number.isFinite(time));
  const start = Math.min(...times);
  const end = Math.max(...times);
  return { start, end: end > start ? end : start + 1 };
});

const ticks = computed(() =>
  props.pages.map((page) => {
    const time = Date.parse(page.timestamp);
    const position = Number.isFinite(time) ? ((time - span.value.start) / (span.value.end - span.value.start)) * 100 : 0;
    return { page, key: props.keyOf(page), left: `${Math.min(100, Math.max(0, position))}%` };
  }),
);

const labels = computed(() => {
  const first = props.pages[0]?.timestamp.slice(0, 4) ?? "";
  const last = props.pages.at(-1)?.timestamp.slice(0, 4) ?? "";
  return { first, last };
});
</script>

<template>
  <div class="archives-ticks" role="list" aria-label="Captures on a time axis">
    <span class="archives-ticks-axis" />
    <button
      v-for="tick in ticks"
      :key="tick.key"
      type="button"
      role="listitem"
      class="archives-tick"
      :class="{ 'archives-tick-current': tick.key === currentKey }"
      :style="{ left: tick.left }"
      :title="`${shortStamp(tick.page.timestamp)} · ${providerLabel(String(tick.page._meta.provider ?? ''))}`"
      :aria-label="`View capture from ${shortStamp(tick.page.timestamp)}`"
      @click="emit('select', tick.page)"
    />
    <span class="archives-ticks-label archives-ticks-start">{{ labels.first }}</span>
    <span class="archives-ticks-label archives-ticks-end">{{ labels.last }}</span>
  </div>
</template>
