<script setup lang="ts">
import type { DiffSample } from "../../utils/landing-fixtures";
import { dateOnly } from "../../utils/format";
import { fencedBody } from "../../utils/timeline";

const props = defineProps<{ diff: DiffSample }>();

const result = computed(() => props.diff.details.result);
const patch = computed(() => fencedBody(props.diff.text));
const digest = computed(() => props.diff.details.digest?.slice(0, 12) ?? "");
</script>

<template>
  <div class="archives-frame overflow-hidden rounded-xl">
    <div class="flex items-center justify-between gap-3 border-b border-muted px-4 py-3">
      <p class="font-mono text-xs text-muted">
        <span class="text-dimmed">tool</span>
        <span class="ms-2 text-highlighted">archives_diff</span>
      </p>
      <p class="font-mono text-[11px] text-dimmed">
        {{ diff.provider }} · {{ diff.before }} → {{ diff.after }}
      </p>
    </div>
    <DiffLines :patch="patch" :max="18" />
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-muted px-4 py-3 font-mono text-[11px] text-dimmed">
      <span>
        <span :style="{ color: 'var(--archives-add)' }">+{{ result?.additions ?? 0 }}</span>
        <span class="ms-1.5" :style="{ color: 'var(--archives-del)' }">−{{ result?.deletions ?? 0 }}</span>
      </span>
      <span>before <span class="text-muted">{{ dateOnly(result?.before.timestamp ?? "") }}</span></span>
      <span>after <span class="text-muted">{{ dateOnly(result?.after.timestamp ?? "") }}</span></span>
      <span v-if="digest">sha256 <span class="text-muted">{{ digest }}…</span></span>
      <span class="ms-auto">{{ diff.live ? "live" : `sample · ${dateOnly(diff.fetchedAt)}` }}</span>
    </div>
  </div>
</template>
