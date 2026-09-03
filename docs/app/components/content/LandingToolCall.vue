<script setup lang="ts">
import type { SnapshotSample } from "../../utils/landing-fixtures";

const props = defineProps<{ target: string; sample: SnapshotSample | undefined }>();

/** The header line plus the first entry, exactly as the MCP client receives them. */
const excerpt = computed(() => {
  const lines = (props.sample?.text ?? "").split("\n");
  const head = lines.slice(0, 5);
  return lines.length > 5 ? [...head, "…"] : head;
});
</script>

<template>
  <div class="archives-frame overflow-hidden rounded-xl">
    <div class="flex items-center justify-between gap-3 border-b border-muted px-4 py-3">
      <p class="font-mono text-xs text-muted">
        <span class="text-dimmed">tool</span>
        <span class="ms-2 text-highlighted">archives_snapshots</span>
      </p>
      <p class="font-mono text-[11px] text-dimmed">stdio · archives mcp</p>
    </div>
    <div class="divide-y divide-muted">
      <div class="px-4 py-4">
        <p class="archives-eyebrow mb-3">request</p>
        <pre class="archives-tool"><code>{
  <span class="tok-key">"target"</span>: <span class="tok-str">"<Transition name="archives-roll" mode="out-in"><span :key="target" class="archives-roll-slot">{{ target }}</span></Transition>"</span>,
  <span class="tok-key">"provider"</span>: <span class="tok-str">"all"</span>,
  <span class="tok-key">"limit"</span>: <span class="tok-key">12</span>
}</code></pre>
      </div>
      <div class="px-4 py-4">
        <p class="archives-eyebrow mb-3">result · text</p>
        <pre class="archives-tool"><code><template v-for="(line, index) in excerpt" :key="`${target}-${index}`"><LandingStamp :value="line" />
</template></code></pre>
      </div>
    </div>
  </div>
</template>
