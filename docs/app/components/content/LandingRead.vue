<script setup lang="ts">
import type { ContentSample } from "../../utils/landing-fixtures";
import { formatBytes } from "../../utils/format";
import { fencedBody } from "../../utils/timeline";

const props = defineProps<{ sample: ContentSample }>();

const content = computed(() => props.sample.details.response.content);
const captured = computed(() => content.value?.timestamp ?? "");
const excerpt = computed(() => {
  const text = fencedBody(props.sample.text).replace(/\s+/gu, " ").trim();
  return text.length > 96 ? `${text.slice(0, 96)}…` : text;
});
</script>

<template>
  <div class="archives-frame overflow-hidden rounded-xl">
    <div class="flex items-center justify-between gap-2 border-b border-muted px-4 py-3">
      <span class="inline-flex items-center gap-2">
        <span class="font-mono text-[10px] font-bold text-primary">TS</span>
        <span class="text-sm text-default">read.ts</span>
      </span>
      <span class="font-mono text-[11px] text-dimmed">{{ sample.live ? "live" : "sample" }} · {{ sample.provider }}</span>
    </div>
    <pre class="archives-rotating"><code><span class="tok-kw">import</span> { createArchive, providers } <span class="tok-kw">from</span> <span class="tok-str">"@agntn/archives"</span>;

<span class="tok-kw">const</span> archive = <span class="tok-fn">createArchive</span>(providers.<span class="tok-fn">{{ sample.provider }}</span>());
<span class="tok-kw">const</span> page = <span class="tok-kw">await</span> archive.<span class="tok-fn">getContent</span>(<span class="tok-str">"{{ sample.target }}"</span>, {
  timestamp: <span class="tok-str">"<Transition name="archives-roll" mode="out-in"><span :key="sample.timestamp" class="archives-roll-slot">{{ sample.timestamp }}</span></Transition>"</span>,
});

<span class="tok-cm">// page.timestamp  <LandingStamp :value="captured" /></span>
<span class="tok-cm">// page.mime       {{ content?.mime ?? "?" }} · {{ formatBytes(content?.bytes ?? 0) }}</span>
<span class="tok-cm">// page.content    "<LandingStamp :value="excerpt" />"</span></code></pre>
  </div>
</template>
