<script setup lang="ts">
import type { ArchivedPage } from "@agntn/archives";
import type { SnapshotDetails } from "@agntn/archives/tool-operations";
import { captureStamp, citation, errorText, pageKey, sameResource, sortChronological, type ApiResult, type ViewMode } from "../../../../utils/capture";
import { shortStamp } from "../../../../utils/format";
import { providerInfo, providerLabel } from "../../../../utils/providers";

definePageMeta({ layout: "default" });

const route = useRoute();
const provider = computed(() => String(route.params.provider ?? ""));
const stamp = computed(() => decodeURIComponent(String(route.params.stamp ?? "")));
const url = computed(() => decodeURIComponent(String(route.params.url ?? "")));
const label = computed(() => providerLabel(provider.value));

useSeoMeta({
  title: () => `${url.value} · ${stamp.value} · ${label.value}`,
  description: () => `${url.value} as ${label.value} captured it on ${stamp.value}.`,
});

const state = reactive<{ loading: boolean; error?: string; page?: ArchivedPage; neighbours: ArchivedPage[]; text?: string }>({
  loading: true,
  neighbours: [],
});
const mode = ref<ViewMode | undefined>(typeof route.query.mode === "string" ? (route.query.mode as ViewMode) : undefined);

function yearOf(value: string): number {
  return Number(value.slice(0, 4));
}

async function load() {
  state.loading = true;
  state.error = undefined;
  try {
    const exact = await $fetch<ApiResult<SnapshotDetails>>("/api/snapshots", {
      retry: 0,
      query: { target: url.value, provider: provider.value, from: stamp.value, to: stamp.value, limit: 5 },
    });
    const pages = exact.details.response.pages;
    state.page = pages.find((page) => captureStamp(page) === stamp.value || page.timestamp === stamp.value) ?? pages[0];
    state.text = exact.text;
    if (!state.page) {
      state.error = `${label.value} lists no capture of ${url.value} at ${stamp.value}.\n\n${exact.text}`;
      return;
    }
    const year = yearOf(state.page.timestamp);
    const around = await $fetch<ApiResult<SnapshotDetails>>("/api/snapshots", {
      retry: 0,
      query: { target: url.value, provider: provider.value, from: String(year - 1), to: String(year + 1), limit: 50 },
    });
    const set = new Map(
      around.details.response.pages.filter((page) => sameResource(page.url, url.value)).map((page) => [pageKey(page), page]),
    );
    set.set(pageKey(state.page), state.page);
    state.neighbours = sortChronological([...set.values()]);
  } catch (error) {
    state.error = errorText(error);
  } finally {
    state.loading = false;
  }
}

function select(page: ArchivedPage) {
  void navigateTo({ path: `/capture/${provider.value}/${encodeURIComponent(captureStamp(page))}/${encodeURIComponent(page.url)}`, query: mode.value ? { mode: mode.value } : {} });
}

const agentCall = computed(() =>
  JSON.stringify(
    {
      method: "tools/call",
      params: {
        name: "archives_content",
        arguments: { target: url.value, provider: provider.value, timestamp: stamp.value, format: "text" },
      },
    },
    null,
    2,
  ),
);

const copied = ref(false);

/** Copies the citation; a blocked clipboard is not an error, the text stays on screen. */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1200);
  } catch {
    return;
  }
}

onMounted(load);
watch([provider, stamp, url], load);
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero eyebrow="capture" :title="shortStamp(stamp.length >= 14 ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}` : stamp)" :accent="label">
      <p class="mt-3 font-mono text-xs break-all text-muted">{{ url }}</p>
    </ToolHero>

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] space-y-6 px-8 py-12 sm:px-12 lg:px-16">
        <p v-if="state.loading" class="archives-frame flex items-center gap-2 rounded-xl px-5 py-4 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Finding the capture in {{ label }}…
        </p>
        <pre v-else-if="state.error" class="archives-body archives-frame rounded-xl" :style="{ color: 'var(--archives-del)' }">{{ state.error }}</pre>

        <template v-else-if="state.page">
          <CaptureViewer :page="state.page" :pages="state.neighbours" :mode="mode" :closable="false" height="75vh" @select="select" @update:mode="mode = $event" />

          <div class="grid gap-4 lg:grid-cols-2">
            <div class="archives-frame overflow-hidden rounded-xl">
              <div class="border-b border-muted px-5 py-3">
                <p class="font-mono text-xs text-muted"><span class="text-dimmed">provenance</span></p>
              </div>
              <dl class="grid gap-3 px-5 py-4 font-mono text-xs">
                <div><dt class="archives-label">archive</dt><dd class="text-highlighted">{{ label }} <span class="text-dimmed">· {{ providerInfo(provider)?.index }}</span></dd></div>
                <div><dt class="archives-label">captured</dt><dd class="text-highlighted">{{ state.page.timestamp }}</dd></div>
                <div><dt class="archives-label">original</dt><dd class="break-all text-highlighted">{{ state.page.url }}</dd></div>
                <div><dt class="archives-label">snapshot</dt><dd class="break-all"><a :href="state.page.snapshot" target="_blank" rel="noopener" class="text-primary hover:underline">{{ state.page.snapshot }}</a></dd></div>
                <div v-if="state.page._meta.digest"><dt class="archives-label">digest</dt><dd class="break-all text-highlighted">{{ state.page._meta.digest }}</dd></div>
                <div v-if="state.page._meta.status"><dt class="archives-label">status</dt><dd class="text-highlighted">{{ state.page._meta.status }}</dd></div>
                <div>
                  <dt class="archives-label">citation</dt>
                  <dd class="flex items-start gap-2">
                    <span class="break-all text-muted">{{ citation(state.page) }}</span>
                    <button type="button" class="archives-btn h-7 shrink-0 px-2" title="Copy the citation" @click="copy(citation(state.page!))">
                      <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-clipboard-copy'" class="size-3.5" />
                    </button>
                  </dd>
                </div>
              </dl>
            </div>

            <div class="archives-frame overflow-hidden rounded-xl">
              <div class="flex items-center justify-between gap-2 border-b border-muted px-5 py-3">
                <p class="font-mono text-xs text-muted"><span class="text-dimmed">what an agent gets</span> <span class="ms-2 text-highlighted">archives_snapshots</span></p>
                <NuxtLink :to="{ path: '/agent', query: { tool: 'content', target: url, provider, timestamp: stamp } }" class="font-mono text-[11px] text-primary hover:underline">read it in the console →</NuxtLink>
              </div>
              <pre class="archives-body max-h-56">{{ state.text }}</pre>
              <div class="border-t border-muted">
                <p class="archives-label px-5 pt-3">the same capture over MCP</p>
                <CodeSnippet :code="agentCall" lang="json" />
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
