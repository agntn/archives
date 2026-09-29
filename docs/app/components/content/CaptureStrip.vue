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
  <div class="strip" role="list" aria-label="Captures on a time axis">
    <span class="strip-axis" aria-hidden="true" />
    <UTooltip
      v-for="tick in ticks"
      :key="tick.key"
      :text="`${shortStamp(tick.page.timestamp)} · ${providerLabel(String(tick.page._meta.provider ?? ''))}`"
    >
      <button
        type="button"
        role="listitem"
        class="strip-tick"
        :data-current="tick.key === currentKey"
        :style="{ left: tick.left }"
        :aria-label="`View capture from ${shortStamp(tick.page.timestamp)}`"
        @click="emit('select', tick.page)"
      />
    </UTooltip>
    <span class="strip-label strip-start">{{ labels.first }}</span>
    <span class="strip-label strip-end">{{ labels.last }}</span>
  </div>
</template>

<style scoped>
/* Captures as ticks on one axis, placed by date; the one in the viewer stands taller in the accent. */
.strip {
  position: relative;
  height: 44px;
  margin: 0 6px;
}
.strip-axis {
  position: absolute;
  top: 18px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--console-line);
}
.strip-tick {
  position: absolute;
  top: 10px;
  width: 7px;
  height: 17px;
  margin-left: -3px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.strip-tick::before {
  content: "";
  position: absolute;
  left: 3px;
  top: 3px;
  width: 1px;
  height: 11px;
  background: var(--ui-text-muted);
}
.strip-tick:hover::before {
  background: var(--console-accent);
}
.strip-tick[data-current="true"]::before {
  top: 0;
  left: 2px;
  width: 3px;
  height: 17px;
  background: var(--console-accent);
}
.strip-tick:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 1px;
}
.strip-label {
  position: absolute;
  bottom: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--ui-text-dimmed);
}
.strip-start {
  left: 0;
}
.strip-end {
  right: 0;
}
</style>
