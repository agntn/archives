<script setup lang="ts">
import { captureLink } from "../utils/capture";
import { shortStamp } from "../utils/format";
import { providerInfo, providerLabel } from "../utils/providers";

definePageMeta({ layout: "default" });
useSeoMeta({ title: "Shelf · @agntn/archives", description: "Captures saved in this browser, with the provenance a citation needs." });

const { items, remove, clear, toPage, exportMarkdown, exportJson } = useShelf();
const format = ref<"markdown" | "json">("markdown");
const formatItems = [
  { label: "Markdown", value: "markdown", icon: "i-simple-icons-markdown" },
  { label: "JSON", value: "json", icon: "i-lucide-braces" },
];
const exported = computed(() => (format.value === "markdown" ? exportMarkdown() : exportJson()));
const copied = ref(false);

/** Copies the export; a blocked clipboard is not an error, the textarea holds the same text. */
async function copy() {
  try {
    await navigator.clipboard.writeText(exported.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1200);
  } catch {
    return;
  }
}
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero
      eyebrow="shelf"
      title="Captures you kept,"
      accent="with their provenance."
      description="Saved in this browser only. Export the list as Markdown footnotes or JSON, each entry naming the archive, the exact capture date, the snapshot URL and the digest when the archive gave one."
      circuit="shelf"
    >
      <template #instrument>
        <div class="shelf-stack">
          <ExplorerPanel tag="List" title="shelf" label="Saved captures" :meta="`${items.length} saved · this browser`">
            <div v-if="!items.length" class="archives-band">
              <p class="archives-note">
                The shelf is empty. Open a capture in the
                <NuxtLink to="/timeline" class="shelf-link">timeline</NuxtLink> and press the bookmark in the viewer.
              </p>
            </div>
            <ul v-else class="archives-rows shelf-rows">
              <li v-for="item in items" :key="item.key">
                <NuxtLink :to="captureLink(toPage(item))" class="archives-value">{{ shortStamp(item.timestamp) }}</NuxtLink>
                <span class="shelf-archive">
                  <UIcon :name="providerInfo(item.provider)?.icon ?? 'i-lucide-archive'" class="size-3.5 flex-none" aria-hidden="true" />
                  <span>{{ providerLabel(item.provider) }}</span>
                </span>
                <UTooltip :text="item.url">
                  <span class="shelf-url" tabindex="0">{{ item.url }}</span>
                </UTooltip>
                <span class="archives-dim">saved {{ shortStamp(item.savedAt) }}</span>
                <UButton color="neutral" variant="subtle" square icon="i-lucide-x" :aria-label="`Remove ${item.url}`" @click="remove(item.key)" />
              </li>
            </ul>
            <template v-if="items.length" #footer>
              <span>Kept in localStorage, never sent anywhere.</span>
              <UButton color="neutral" variant="subtle" icon="i-lucide-trash-2" label="clear shelf" class="shelf-clear" @click="clear()" />
            </template>
          </ExplorerPanel>

          <ExplorerPanel v-if="items.length" tag="File" label="Export" :meta="`${items.length} entries`">
            <template #title>{{ format === "markdown" ? "shelf.md" : "shelf.json" }}</template>
            <UTabs v-model="format" :items="formatItems" :content="false" variant="link" class="shelf-tabs" aria-label="Export format" />
            <div class="archives-band">
              <p class="console-label console-rule-title">
                <span>Export <span aria-hidden="true">[ {{ format }} ]</span></span>
                <span class="console-mark" aria-hidden="true" />
                <UButton
                  color="neutral"
                  variant="subtle"
                  :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                  :label="copied ? 'copied' : 'copy'"
                  :aria-label="copied ? 'Copied' : 'Copy the export'"
                  @click="copy"
                />
              </p>
              <pre class="console-snippet shelf-export">{{ exported }}</pre>
            </div>
          </ExplorerPanel>
        </div>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.shelf-stack {
  display: grid;
  gap: 28px;
}
.shelf-stack > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
.shelf-link {
  color: var(--ui-text-highlighted);
  text-decoration: underline dotted var(--console-line);
  text-underline-offset: 3px;
}
.shelf-link:hover {
  color: var(--console-accent);
}
.shelf-rows > li {
  grid-template-columns: 8.5rem minmax(8rem, 12rem) minmax(0, 1fr) auto auto;
  align-items: center;
}
.shelf-archive {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.shelf-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shelf-clear {
  margin-left: auto;
}
.shelf-tabs {
  padding: 0 20px;
}
/* The export as text, interpolated; it scrolls inside, never the page. */
.shelf-export {
  max-height: 20rem;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (width < 52rem) {
  .shelf-rows > li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .shelf-url,
  .shelf-rows > li > .archives-dim {
    grid-column: 1 / -1;
  }
}
</style>
