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
/** `20021129054348` as `2002-11-29 05:43`; anything shorter stays as typed. */
const stampLabel = computed(() =>
  stamp.value.length >= 14
    ? shortStamp(`${stamp.value.slice(0, 4)}-${stamp.value.slice(4, 6)}-${stamp.value.slice(6, 8)}T${stamp.value.slice(8, 10)}:${stamp.value.slice(10, 12)}`)
    : stamp.value,
);

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
    <ToolHero eyebrow="capture" :title="stampLabel" :accent="label" :description="url" circuit="view">
      <template #instrument>
        <div class="capture-stack">
          <ExplorerPanel v-if="state.loading" tag="View" :title="label" label="Finding the capture" busy>
            <div class="archives-band">
              <p class="archives-note">
                <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
                Finding the capture in {{ label }}…
              </p>
            </div>
          </ExplorerPanel>
          <ExplorerPanel v-else-if="state.error" tag="Error" :title="label" label="Capture not found">
            <div class="archives-band">
              <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ state.error }}</p>
            </div>
          </ExplorerPanel>

          <template v-else-if="state.page">
            <CaptureViewer :page="state.page" :pages="state.neighbours" :mode="mode" :closable="false" height="75vh" @select="select" @update:mode="mode = $event" />

            <ExplorerPanel tag="ID" label="Provenance of this capture" :sweep="state.page.snapshot" :meta="providerInfo(provider)?.host">
              <template #title>{{ provider }}<span class="console-file">{{ stamp }}</span></template>
              <div class="console-band console-subject-band">
                <div :key="state.page.snapshot" class="console-scan" aria-hidden="true" />
                <div class="console-identity-block">
                  <ConsoleReticle :key="state.page.snapshot" :icon="providerInfo(provider)?.icon ?? 'i-lucide-archive'" />
                  <div class="console-name">
                    <span class="console-label">Capture / <span class="console-label-key">{{ label }}</span></span>
                    <h3 class="console-name-mono">{{ state.page.timestamp }}</h3>
                    <p class="console-about">Where this copy lives, what the archive recorded, and how to cite it.</p>
                  </div>
                </div>
                <div class="console-readout">
                  <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
                    <circle cx="3" cy="12" r="2.5" />
                    <path d="M5.5 12H14L22 20H32" />
                  </svg>
                  <dl class="console-readout-rows">
                    <div>
                      <dt>Archive</dt>
                      <dd>{{ label }}</dd>
                    </div>
                    <div>
                      <dt>Index</dt>
                      <dd>{{ providerInfo(provider)?.index ?? "n/a" }}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd class="console-accent">{{ state.page._meta.status ?? "n/a" }}</dd>
                    </div>
                    <div v-if="state.page._meta.digest">
                      <dt>Digest</dt>
                      <dd>
                        <UTooltip :text="String(state.page._meta.digest)">
                          <span class="capture-clip" tabindex="0">{{ state.page._meta.digest }}</span>
                        </UTooltip>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div class="archives-band capture-leads">
                <p class="console-label console-rule-title">
                  <span>Trace <span aria-hidden="true">[ original · snapshot · citation ]</span></span>
                  <span class="console-mark" aria-hidden="true" />
                </p>
                <p class="console-lead">
                  <span class="console-tag">Original</span>
                  <UTooltip :text="state.page.url"><span class="capture-clip capture-bright" tabindex="0">{{ state.page.url }}</span></UTooltip>
                  <span class="console-leader" aria-hidden="true" />
                </p>
                <p class="console-lead">
                  <span class="console-tag">Snapshot</span>
                  <a :href="state.page.snapshot" target="_blank" rel="noopener" class="capture-clip capture-link">{{ state.page.snapshot }}</a>
                  <span class="console-leader" aria-hidden="true" />
                </p>
                <p class="console-lead">
                  <span class="console-tag">Cite</span>
                  <UTooltip :text="citation(state.page)"><span class="capture-clip" tabindex="0">{{ citation(state.page) }}</span></UTooltip>
                  <UButton
                    color="neutral"
                    variant="subtle"
                    square
                    :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                    :aria-label="copied ? 'Copied' : 'Copy the citation'"
                    @click="copy(citation(state.page!))"
                  />
                </p>
              </div>

              <div class="archives-band">
                <p class="console-label console-rule-title">
                  <span>Agent <span aria-hidden="true">[ the same capture over MCP ]</span></span>
                  <span class="console-mark" aria-hidden="true" />
                </p>
                <CodeSnippet :code="agentCall" lang="json" />
              </div>

              <ConsoleResponse
                :title="`archives_snapshots(&quot;${url}&quot;)`"
                :text="state.text ?? ''"
                source="content[0].text"
                description="What archives_snapshots answers for this exact URL, the text an agent reads."
              />

              <template #footer>
                <NuxtLink :to="{ path: '/agent', query: { tool: 'content', target: url, provider, timestamp: stamp } }" class="capture-footer-link"
                  ><span aria-hidden="true">→ </span>read it in the agent console</NuxtLink
                >
                <NuxtLink :to="{ path: '/timeline', query: { target: url, provider, limit: '50' } }" class="capture-footer-link"
                  ><span aria-hidden="true">→ </span>every capture of this URL</NuxtLink
                >
              </template>
            </ExplorerPanel>
          </template>
        </div>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.capture-stack {
  display: grid;
  gap: 28px;
}
.capture-stack > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
.capture-leads > .console-lead {
  flex-wrap: nowrap;
  min-width: 0;
  margin: 0 0 8px;
}
.capture-clip {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.capture-bright {
  color: var(--ui-text-highlighted);
}
.capture-link {
  color: var(--ui-text-highlighted);
}
.capture-link:hover {
  color: var(--console-accent);
}
.capture-footer-link {
  color: var(--ui-text-muted);
}
.capture-footer-link:hover {
  color: var(--console-accent);
}
.capture-footer-link + .capture-footer-link {
  margin-left: auto;
}
@media (width < 640px) {
  .capture-leads .console-leader {
    display: none;
  }
}
</style>
