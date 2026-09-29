<script setup lang="ts">
import type { SnapshotDetails } from "@agntn/archives/tool-operations";
import { captureLink, errorText, pageKey, type ApiResult } from "../utils/capture";
import { shortStamp, shortUrl } from "../utils/format";
import { PROVIDERS } from "../utils/providers";

definePageMeta({ layout: "default" });
useSeoMeta({ title: "Archived URLs · @agntn/archives", description: "Every URL an archive has seen under a domain." });

const route = useRoute();
const router = useRouter();
const form = reactive({ target: "example.com", provider: "wayback", from: "", to: "" });
const filter = ref("");
const state = reactive<{ loading: boolean; error?: string; result?: ApiResult<SnapshotDetails> }>({ loading: false });
const listingProviders = PROVIDERS.filter((provider) => !provider.needs && provider.slug !== "webcite");
const providerItems = listingProviders.map((provider) => ({ label: provider.label, value: provider.slug, icon: provider.icon }));
const pickedProvider = computed(() => providerItems.find((item) => item.value === form.provider));

const rows = computed(() => {
  const pages = state.result?.details.response.pages ?? [];
  const needle = filter.value.trim().toLowerCase();
  const filtered = needle ? pages.filter((page) => page.url.toLowerCase().includes(needle)) : pages;
  return [...filtered].sort((a, b) => a.url.localeCompare(b.url));
});

async function load() {
  const target = form.target.trim();
  if (!target) {
    return;
  }
  state.loading = true;
  state.error = undefined;
  const query: Record<string, string> = { target, provider: form.provider, limit: "100" };
  if (form.from.trim()) query.from = form.from.trim();
  if (form.to.trim()) query.to = form.to.trim();
  void router.replace({ query });
  try {
    state.result = await $fetch<ApiResult<SnapshotDetails>>("/api/urls", { retry: 0, query });
  } catch (error) {
    state.result = undefined;
    state.error = errorText(error);
  } finally {
    state.loading = false;
  }
}

let bootstrapped = false;
onMounted(() => {
  watch(
    () => route.query,
    (query) => {
      const read = (key: string) => (typeof query[key] === "string" ? (query[key] as string).trim() : "");
      if (bootstrapped || !read("target")) {
        return;
      }
      bootstrapped = true;
      form.target = read("target");
      form.provider = read("provider") || "wayback";
      form.from = read("from");
      form.to = read("to");
      void load();
    },
    { immediate: true, deep: true },
  );
});
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero
      eyebrow="archived urls"
      title="Every page"
      accent="an archive has seen."
      description="The domain's index collapsed to one row per URL: the pages the archive ever crawled, even the ones the live site has forgotten."
      circuit="urls"
    >
      <template #instrument>
        <div class="urls-stack">
          <ExplorerPanel
            as="form"
            tag="Call"
            role="search"
            label="List archived URLs"
            :busy="state.loading"
            :meta="pickedProvider?.label"
            @submit.prevent="load"
          >
            <template #title>urls(<span class="tok-str">"{{ form.target || "example.com" }}"</span>)</template>
            <div class="archives-band urls-form">
              <div class="console-readout">
                <dl class="console-readout-rows">
                  <div>
                    <dt><label for="urls-target">Domain</label></dt>
                    <dd><UInput id="urls-target" v-model="form.target" variant="none" placeholder="example.com" autocomplete="off" spellcheck="false" class="w-full" /></dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>
                      <USelectMenu v-model="form.provider" :items="providerItems" value-key="value" :icon="pickedProvider?.icon" variant="none" :search-input="false" aria-label="Provider" class="w-full" />
                    </dd>
                  </div>
                  <div>
                    <dt><label for="urls-from">Window</label></dt>
                    <dd class="urls-window">
                      <UInput id="urls-from" v-model="form.from" variant="none" placeholder="from 2010" autocomplete="off" aria-label="From" />
                      <span class="archives-dim" aria-hidden="true">→</span>
                      <UInput v-model="form.to" variant="none" placeholder="to 2020" autocomplete="off" aria-label="To" />
                    </dd>
                  </div>
                </dl>
              </div>
              <div>
                <UButton type="submit" color="primary" variant="solid" :loading="state.loading" trailing-icon="i-lucide-list" label="List" />
              </div>
            </div>
            <template #footer>
              <span>Wayback and Archive-It collapse on the URL key, so each row is a distinct page. Other archives answer with their plain listing, up to a hundred rows.</span>
            </template>
          </ExplorerPanel>

          <ExplorerPanel v-if="state.error" tag="Error" title="urls" label="Listing failed">
            <div class="archives-band">
              <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ state.error }}</p>
            </div>
          </ExplorerPanel>

          <ExplorerPanel v-else-if="state.result" tag="List" label="Archived URLs" :sweep="state.result.fetchedAt" :meta="`${rows.length} urls`">
            <template #title>{{ state.result.details.target }}</template>
            <div class="archives-band urls-filter">
              <div class="console-readout">
                <dl class="console-readout-rows">
                  <div>
                    <dt><label for="urls-filter">Filter</label></dt>
                    <dd><UInput id="urls-filter" v-model="filter" type="search" variant="none" icon="i-lucide-search" placeholder="by path" autocomplete="off" class="w-full" /></dd>
                  </div>
                </dl>
              </div>
            </div>
            <ul class="archives-rows urls-rows">
              <li v-for="page in rows" :key="pageKey(page)">
                <UTooltip :text="page.url">
                  <span class="urls-url" tabindex="0">{{ shortUrl(page.url, 90) }}</span>
                </UTooltip>
                <span class="archives-value">{{ shortStamp(page.timestamp) }}</span>
                <span class="archives-dim">{{ page._meta.status ?? "n/a" }}</span>
                <span class="urls-actions">
                  <UTooltip text="All captures of this URL">
                    <UButton
                      :to="{ path: '/timeline', query: { target: page.url, provider: form.provider, limit: '50' } }"
                      color="neutral"
                      variant="subtle"
                      square
                      icon="i-lucide-history"
                      aria-label="All captures of this URL"
                    />
                  </UTooltip>
                  <UButton :to="captureLink(page)" color="neutral" variant="subtle" icon="i-lucide-eye" label="view" />
                </span>
              </li>
            </ul>
            <p v-if="!rows.length" class="archives-note list-empty">Nothing matches that path.</p>
          </ExplorerPanel>
        </div>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.urls-stack {
  display: grid;
  gap: 28px;
}
.urls-stack > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
.urls-form {
  display: grid;
  gap: 16px;
}
.urls-form .console-readout-rows > div,
.urls-filter .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
.urls-window {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.urls-rows > li {
  grid-template-columns: minmax(0, 1fr) 8.5rem 3rem auto;
  align-items: center;
}
.urls-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.urls-actions {
  display: inline-flex;
  gap: 6px;
}
@media (width < 52rem) {
  .urls-rows > li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .urls-url {
    grid-column: 1 / -1;
  }
}
@media (width < 640px) {
  .urls-form .console-readout-rows > div,
  .urls-filter .console-readout-rows > div {
    grid-template-columns: 5rem minmax(0, 1fr);
  }
}
</style>
