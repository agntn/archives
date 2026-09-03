<script setup lang="ts">
import { captureLink } from "../utils/capture";
import { shortStamp } from "../utils/format";
import { providerInfo, providerLabel } from "../utils/providers";

definePageMeta({ layout: "default" });
useSeoMeta({ title: "Shelf · @agntn/archives", description: "Captures saved in this browser, with the provenance a citation needs." });

const { items, remove, clear, toPage, exportMarkdown, exportJson } = useShelf();
const format = ref<"markdown" | "json">("markdown");
const exported = computed(() => (format.value === "markdown" ? exportMarkdown() : exportJson()));
const copied = ref(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(exported.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1200);
  } catch {
    // Clipboard blocked; the export is in the textarea.
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
    />

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] space-y-6 px-8 py-12 sm:px-12 lg:px-16">
        <p v-if="!items.length" class="archives-frame rounded-xl px-5 py-4 text-sm text-muted">
          The shelf is empty. Open a capture in the <NuxtLink to="/timeline" class="text-primary hover:underline">timeline</NuxtLink> and press the bookmark in the viewer bar.
        </p>
        <template v-else>
          <div class="archives-frame overflow-hidden rounded-xl">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted px-5 py-3">
              <p class="font-mono text-xs text-muted">captures <span class="ms-2 text-highlighted">{{ items.length }}</span></p>
              <button type="button" class="archives-btn h-7 px-2 text-xs" @click="clear()">
                <UIcon name="i-lucide-trash-2" class="size-3.5" />
                clear shelf
              </button>
            </div>
            <div class="archives-table-wrap">
              <table class="archives-table">
                <thead>
                  <tr><th>captured</th><th>archive</th><th>original</th><th>saved</th><th></th></tr>
                </thead>
                <tbody>
                  <tr v-for="item in items" :key="item.key">
                    <td class="font-mono text-xs whitespace-nowrap"><NuxtLink :to="captureLink(toPage(item))" class="text-primary hover:underline">{{ shortStamp(item.timestamp) }}</NuxtLink></td>
                    <td class="text-xs whitespace-nowrap"><span class="inline-flex items-center gap-1.5"><UIcon :name="providerInfo(item.provider)?.icon ?? 'i-lucide-archive'" class="size-3.5 text-muted" />{{ providerLabel(item.provider) }}</span></td>
                    <td class="font-mono text-xs break-all text-muted">{{ item.url }}</td>
                    <td class="font-mono text-xs whitespace-nowrap text-dimmed">{{ shortStamp(item.savedAt) }}</td>
                    <td class="text-end">
                      <button type="button" class="archives-btn h-7 px-2" :aria-label="`Remove ${item.url}`" @click="remove(item.key)"><UIcon name="i-lucide-x" class="size-3.5" /></button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="archives-frame overflow-hidden rounded-xl">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted px-5 py-3">
              <span class="archives-segmented">
                <button v-for="option in ['markdown', 'json'] as const" :key="option" type="button" class="archives-segment" :class="{ 'archives-segment-active': format === option }" @click="format = option">{{ option }}</button>
              </span>
              <button type="button" class="archives-btn h-7 px-2 text-xs" @click="copy">
                <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-clipboard-copy'" class="size-3.5" />
                copy export
              </button>
            </div>
            <div class="px-5 py-4">
              <textarea class="archives-textarea" rows="10" readonly :value="exported" />
            </div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
