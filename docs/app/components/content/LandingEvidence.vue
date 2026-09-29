<script setup lang="ts">
import { EVIDENCE_LIMITS, EVIDENCE_TOOL_NAMES } from "../../utils/webmcp";

/** The four browser tools in the order one case uses them, with what each hands back. */
const STEPS = [
  { tag: "Scope", note: "coverage across archives" },
  { tag: "Find", note: "change IDs, no bodies read" },
  { tag: "Inspect", note: "one diff excerpt, untrusted" },
  { tag: "Pin", note: `up to ${EVIDENCE_LIMITS.findings} findings` },
] as const;

const steps = EVIDENCE_TOOL_NAMES.map((name, index) => ({ name, ...STEPS[index]! }));
</script>

<template>
  <section class="tool-console landing-evidence" aria-label="The Evidence Room tools">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"><span class="console-tag">List</span>document.modelContext</span>
      <span class="console-meta">{{ steps.length }} tools</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true"><span class="console-cursor" /></div>

    <div class="evidence-subject">
      <ConsoleReticle icon="i-lucide-scan-search" />
      <div class="evidence-name">
        <span class="console-label">Case / <span class="console-label-key">WebMCP</span></span>
        <h3>Evidence Room</h3>
        <p class="evidence-about">An agent and a person work one caseboard. Findings stay apart from what the archive said.</p>
      </div>
    </div>

    <div class="archives-band evidence-band">
      <p class="console-label console-rule-title">
        <span>Tools <span aria-hidden="true">[ in the order a case runs ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <ol class="evidence-steps console-animate">
        <li v-for="step in steps" :key="step.name" class="console-lead">
          <span class="console-tag">{{ step.tag }}</span>
          <UTooltip :text="`${step.name}: ${step.note}`">
            <code class="evidence-code" tabindex="0">{{ step.name }}</code>
          </UTooltip>
          <span class="console-leader" aria-hidden="true" />
        </li>
      </ol>
    </div>

    <footer class="console-footer console-footer-plain">
      <NuxtLink to="/evidence" class="evidence-open"><span aria-hidden="true">→ </span>open the Evidence Room</NuxtLink>
      <span class="console-meta">works by hand too</span>
    </footer>
  </section>
</template>

<style scoped>
.evidence-subject {
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
.evidence-name {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.evidence-name h3 {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 22px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--ui-text-highlighted);
}
.evidence-about {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.evidence-band {
  border-top: 1px solid var(--console-line);
}
.evidence-band > .console-rule-title {
  margin-bottom: 10px;
}
.evidence-steps {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.evidence-steps > .console-lead {
  flex-wrap: nowrap;
  min-width: 0;
  margin: 0 0 8px;
}
.evidence-code {
  min-width: 0;
  overflow: hidden;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.evidence-open {
  color: var(--ui-text-muted);
}
.evidence-open:hover {
  color: var(--console-accent);
}
.evidence-open:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
@media (width < 400px) {
  .evidence-subject {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
    padding-inline: 14px;
  }
}
</style>
