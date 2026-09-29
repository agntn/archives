<script setup lang="ts">
import { PROVIDERS, providerInfo } from "../../utils/providers";

const props = defineProps<{ slug: string }>();

const info = computed(() => providerInfo(props.slug));
const position = computed(() => PROVIDERS.findIndex((entry) => entry.slug === info.value?.slug) + 1);

/** The three operations in their fixed order; a supported one links to where it runs or is explained. */
const operations = computed(() => {
  const provider = info.value;
  if (!provider) return [];
  const lists = provider.index !== "none";
  return [
    {
      label: "List",
      method: "snapshots()",
      on: lists,
      to: provider.needs
        ? "/guide/snapshots"
        : { path: "/timeline", query: { target: "example.com", provider: provider.slug } },
    },
    { label: "Read", method: "content()", on: provider.content, to: "/guide/content" },
    { label: "Diff", method: "diff()", on: provider.content, to: "/guide/diff" },
  ];
});

/** What a caller has to hand over and what the viewer can do with a capture. */
const leads = computed(() => {
  const provider = info.value;
  if (!provider) return [];
  return [
    { tag: "Load", text: `createArchive(${provider.factory})` },
    { tag: "Needs", text: provider.needs ?? "nothing, no key or collection" },
    {
      tag: "Replay",
      text: provider.frame
        ? "the playback page opens framed on this site"
        : (provider.caveat ??
          (provider.content
            ? "source and text read here, the capture itself opens on the archive"
            : "no bodies to read, the capture opens on the archive")),
    },
  ];
});
</script>

<template>
  <section v-if="info" class="tool-console console-wide not-prose my-6" aria-label="Provider record">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"
        ><span class="console-tag">ID</span>{{ info.slug
        }}<span v-if="position > 0" class="console-file"
          >{{ String(position).padStart(2, "0") }} / {{ PROVIDERS.length }}</span
        ></span
      >
      <span class="console-meta">{{ info.host }}</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true"><span class="console-cursor" /></div>

    <div class="console-band console-subject-band">
      <div class="console-scan" aria-hidden="true" />
      <div class="console-identity-block">
        <ConsoleReticle :key="info.slug" :icon="info.icon" />
        <div class="console-name">
          <span class="console-label">Provider</span>
          <h3>{{ info.label }}</h3>
          <ul class="facts-aliases" aria-label="Identifiers">
            <li><span class="facts-alias">{{ info.factory }}</span></li>
            <li><span class="facts-alias">provider: "{{ info.slug }}"</span></li>
          </ul>
        </div>
      </div>

      <div class="console-readout">
        <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
          <circle cx="3" cy="12" r="2.5" />
          <path d="M5.5 12H14L22 20H32" />
        </svg>
        <dl class="console-readout-rows">
          <div>
            <dt>Index</dt>
            <dd>{{ info.index }}</dd>
          </div>
          <div>
            <dt>Bodies</dt>
            <dd>
              <span v-if="info.content && info.rendered">the archive's rendering</span>
              <span v-else-if="info.content" class="console-accent">read raw</span>
              <span v-else class="facts-none">listing only</span>
            </dd>
          </div>
          <div>
            <dt>provider=all</dt>
            <dd>
              <span v-if="info.inAll">included</span>
              <span v-else class="facts-none">left out</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>

    <div class="console-band">
      <p class="console-label console-rule-title">
        <span>Operations <span aria-hidden="true">[ list · read · diff ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <ul class="facts-ops">
        <li v-for="operation in operations" :key="operation.label" :data-on="operation.on">
          <span class="facts-op-label">{{ operation.label }}</span>
          <NuxtLink v-if="operation.on" :to="operation.to" class="facts-op-method">{{ operation.method }}</NuxtLink>
          <span v-else class="facts-op-method facts-none">unsupported</span>
          <span class="facts-op-node" aria-hidden="true" />
        </li>
      </ul>
    </div>

    <div class="console-band">
      <p class="console-label console-rule-title">
        <span>Access <span aria-hidden="true">[ what it needs · how it replays ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <dl class="facts-leads">
        <dd v-for="lead in leads" :key="lead.tag" class="console-lead">
          <span class="console-tag">{{ lead.tag }}</span>
          <UTooltip :text="lead.text">
            <code class="facts-code" tabindex="0">{{ lead.text }}</code>
          </UTooltip>
          <span class="console-leader" aria-hidden="true" />
        </dd>
      </dl>
    </div>

    <footer class="console-footer console-footer-plain">
      <ul class="console-links">
        <li>
          <NuxtLink to="/providers"><span aria-hidden="true">→ </span>All providers</NuxtLink>
        </li>
      </ul>
      <span class="console-meta">src/providers</span>
    </footer>
  </section>
</template>

<style scoped>
.facts-aliases {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}
.facts-alias {
  display: inline-flex;
  max-width: 100%;
  padding: 1px 7px;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.facts-none {
  color: var(--ui-text-dimmed);
}
.facts-ops {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.facts-ops > li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 10px;
  align-items: center;
  padding: 7px 10px;
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.facts-op-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}
.facts-op-method {
  grid-column: 1;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
a.facts-op-method:hover {
  color: var(--console-accent);
}
a.facts-op-method:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
.facts-op-node {
  grid-column: 2;
  grid-row: 1 / span 2;
  width: 7px;
  height: 7px;
  box-shadow: inset 0 0 0 1px var(--console-corner);
}
[data-on="true"] > .facts-op-node {
  background: var(--console-accent);
  box-shadow: none;
}
.facts-leads {
  display: grid;
  gap: 0;
  margin: 0;
}
.facts-leads > .console-lead {
  margin: 0 0 8px;
  flex-wrap: nowrap;
  min-width: 0;
}
.facts-code {
  min-width: 0;
  overflow: hidden;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
@media (width < 640px) {
  .facts-leads .console-leader {
    display: none;
  }
}
</style>
