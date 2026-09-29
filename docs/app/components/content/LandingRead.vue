<script setup lang="ts">
import type { ContentSample } from "../../utils/landing-fixtures";
import { bareHost, formatBytes, shortStamp } from "../../utils/format";
import { providerInfo, providerLabel } from "../../utils/providers";
import { fencedBody } from "../../utils/timeline";

const props = defineProps<{ sample: ContentSample }>();

const content = computed(() => props.sample.details.response.content);
const body = computed(() => fencedBody(props.sample.text));

/** Five lines of the capture, each cut to one line, so the panel keeps its height; the dialog has the rest. */
const excerpt = computed(() => {
  const lines = body.value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  return [...lines.slice(0, 5), ...Array.from({ length: Math.max(0, 5 - lines.length) }, () => "")];
});

const call = computed(() => `getContent("${props.sample.target}", { timestamp: "${props.sample.timestamp}" })`);
</script>

<template>
  <section class="tool-console landing-read" aria-label="One capture read">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="`archive.${call}`">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">Call</span>getContent(<span class="tok-str">"{{ bareHost(sample.target) }}"</span>,
          <span class="tok-str">"{{ sample.timestamp }}"</span>)</span
        >
      </UTooltip>
      <span class="console-meta">{{ sample.live ? "live" : "recorded" }}</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="sample.timestamp" class="console-cursor" />
    </div>

    <div class="read-subject">
      <div :key="sample.timestamp" class="console-scan" aria-hidden="true" />
      <ConsoleReticle :key="sample.timestamp" :icon="providerInfo(sample.provider)?.icon ?? 'i-lucide-archive'" />
      <div class="read-name">
        <span class="console-label"
          >Capture / <span class="console-label-key">{{ providerLabel(sample.provider) }}</span></span
        >
        <h3>{{ shortStamp(content?.timestamp ?? "") || "none" }}</h3>
        <p class="read-about">asked for {{ sample.timestamp }}, got the capture nearest to it</p>
      </div>
    </div>

    <div class="archives-band read-band">
      <!-- The capture's text: interpolated into a pre, one line each, never rendered as markup. -->
      <pre class="console-snippet read-lines"><code><span v-for="(line, index) in excerpt" :key="index">{{ line || "&#160;" }}</span></code></pre>
    </div>

    <ConsoleResponse
      :title="`archives_content(&quot;${sample.target}&quot;)`"
      :text="sample.text"
      source="content[0].text"
      description="The tool text an agent receives, with the body fenced as untrusted data."
    />

    <footer class="console-footer console-footer-plain">
      <span class="read-foot">{{ content?.mime ?? "unknown type" }} · {{ formatBytes(content?.bytes ?? 0) }}</span>
      <span class="console-meta read-foot">{{ bareHost(content?.snapshot ?? "").split("/")[0] }}</span>
    </footer>
  </section>
</template>

<style scoped>
.read-subject {
  position: relative;
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  padding: 18px 20px 20px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Cpath d='M16 18h4m-2-2v4' fill='none' stroke='%23818a94' stroke-opacity='.1'/%3E%3C/svg%3E");
  background-size: 36px 36px;
  background-position: 24px 20px;
}
.read-subject > :not(.console-scan) {
  position: relative;
}
.read-name {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.read-name h3 {
  margin: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 400;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.read-about {
  margin: 0;
  overflow: hidden;
  font-family: var(--font-sans);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
}
.read-band {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  border-top: 1px solid var(--console-line);
}
.landing-read > .console-footer {
  flex-wrap: nowrap;
}
.read-foot {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.read-lines > code > span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
  color: var(--ui-text-muted);
}
@media (width < 400px) {
  .read-subject {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
    padding-inline: 14px;
  }
}
</style>
