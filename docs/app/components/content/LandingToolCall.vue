<script setup lang="ts">
import type { SnapshotSample } from "../../utils/landing-fixtures";
import { PROVIDERS_IN_ALL } from "../../utils/providers";
import { groupByProvider } from "../../utils/timeline";

const props = defineProps<{ target: string; sample: SnapshotSample | undefined }>();

const buckets = computed(() => (props.sample ? groupByProvider(props.sample.details.response) : []));
const count = (state: string) => buckets.value.filter((bucket) => bucket.state === state).length;

/** The first line of the text is the summary an agent reads before any capture. */
const headline = computed(() => props.sample?.text.split("\n")[0] ?? "");
</script>

<template>
  <section class="tool-console landing-call" aria-label="One tool call">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="`archives_snapshots({ target: &quot;${target}&quot;, provider: &quot;all&quot;, limit: 50 })`">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">Call</span>archives_snapshots(<span class="tok-str">"{{ target }}"</span>)</span
        >
      </UTooltip>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="target" class="console-cursor" />
    </div>

    <!-- The tool on the crosses grid; what its text says in the readout. -->
    <div class="call-subject">
      <div :key="target" class="console-scan" aria-hidden="true" />
      <div class="call-identity">
        <ConsoleReticle :key="target" icon="i-lucide-terminal" />
        <div class="call-name">
          <span class="console-label">Tool / read-only</span>
          <h3>archives_snapshots</h3>
          <p class="call-note">
            The whole answer is in the text: dates, capture URLs and every archive that could not
            answer, with its reason.
          </p>
        </div>
      </div>
      <div class="console-readout">
        <dl :key="target" class="console-readout-rows console-animate">
          <div>
            <dt>summary</dt>
            <dd>
              <UTooltip :text="headline">
                <span class="call-line" tabindex="0">{{ headline }}</span>
              </UTooltip>
            </dd>
          </div>
          <div>
            <dt>pages</dt>
            <dd class="console-accent">{{ sample?.details.count ?? 0 }}</dd>
          </div>
          <div>
            <dt>archives</dt>
            <dd>
              <span class="call-line"
                >{{ count("ok") }} answered · {{ count("unsupported") + count("failed") }} with a reason
                · {{ PROVIDERS_IN_ALL.length }} asked</span
              >
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <ConsoleResponse
      :title="`archives_snapshots(&quot;${target}&quot;)`"
      :text="sample?.text ?? ''"
      source="content[0].text"
      description="The text an MCP client receives for this call, recorded through the same executor."
    />

    <footer class="console-footer console-footer-plain">
      <span aria-label="Supported hosts: MCP, Pi and OMP">MCP · Pi · OMP</span>
      <span class="console-meta">archives mcp · stdio</span>
    </footer>
  </section>
</template>

<style scoped>
.call-subject {
  position: relative;
  display: grid;
  gap: 16px;
  padding: 18px 20px 20px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Cpath d='M16 18h4m-2-2v4' fill='none' stroke='%23818a94' stroke-opacity='.1'/%3E%3C/svg%3E");
  background-size: 36px 36px;
  background-position: 24px 20px;
}
.call-subject > :not(.console-scan) {
  position: relative;
}
.call-identity {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}
.call-name {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.call-name h3 {
  margin: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 400;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.call-note {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.landing-call .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
.landing-call .console-readout-rows dt {
  text-transform: none;
  letter-spacing: 0.02em;
}
.call-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (width < 400px) {
  .call-subject {
    padding-inline: 14px;
  }
  .call-identity {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
  }
}
</style>
