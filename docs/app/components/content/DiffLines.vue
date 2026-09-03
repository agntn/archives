<script setup lang="ts">
import { diffLines } from "../../utils/timeline";

const props = defineProps<{ patch: string; max?: number }>();

const lines = computed(() => {
  const all = diffLines(props.patch);
  return props.max ? all.slice(0, props.max) : all;
});
const hidden = computed(() => Math.max(0, diffLines(props.patch).length - lines.value.length));
</script>

<template>
  <pre class="archives-diff"><code><span
    v-for="(line, index) in lines"
    :key="index"
    class="archives-diff-line"
    :class="`archives-diff-${line.kind}`"
  >{{ line.text || " " }}</span><span v-if="hidden" class="archives-diff-line archives-diff-meta">… {{ hidden }} more lines</span></code></pre>
</template>
