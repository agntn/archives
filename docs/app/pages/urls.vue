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
    />

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] space-y-6 px-8 py-12 sm:px-12 lg:px-16">
        <form class="archives-frame overflow-hidden rounded-xl" @submit.prevent="load">
          <div class="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-6">
            <label class="sm:col-span-2">
              <span class="archives-label">domain</span>
              <input v-model="form.target" type="text" class="archives-field font-mono" placeholder="example.com" autocomplete="off" spellcheck="false" />
            </label>
            <label>
              <span class="archives-label">provider</span>
              <select v-model="form.provider" class="archives-select">
                <option v-for="provider in listingProviders" :key="provider.slug" :value="provider.slug">{{ provider.label }}</option>
              </select>
            </label>
            <label><span class="archives-label">from</span><input v-model="form.from" type="text" class="archives-field font-mono" placeholder="2010" /></label>
            <label><span class="archives-label">to</span><input v-model="form.to" type="text" class="archives-field font-mono" placeholder="2020" /></label>
            <div class="flex items-end">
              <UButton type="submit" color="primary" class="w-full justify-center" :loading="state.loading" icon="i-lucide-list">List</UButton>
            </div>
          </div>
          <p class="border-t border-muted px-5 py-3 font-mono text-[11px] text-dimmed">
            Wayback and Archive-It collapse on the URL key, so each row is a distinct page. Other archives answer with their plain listing, up to a hundred rows.
          </p>
        </form>

        <pre v-if="state.error" class="archives-body archives-frame rounded-xl" :style="{ color: 'var(--archives-del)' }">{{ state.error }}</pre>

        <div v-else-if="state.result" class="archives-frame overflow-hidden rounded-xl">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted px-5 py-3">
            <p class="font-mono text-xs text-muted">urls <span class="ms-2 text-highlighted">{{ rows.length }}</span></p>
            <input v-model="filter" type="search" class="archives-field h-8 max-w-xs font-mono text-xs" placeholder="filter by path" />
          </div>
          <div class="archives-table-wrap">
            <table class="archives-table">
              <thead>
                <tr><th>url</th><th>captured</th><th>status</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="page in rows" :key="pageKey(page)">
                  <td class="font-mono text-xs break-all text-highlighted" :title="page.url">{{ shortUrl(page.url, 90) }}</td>
                  <td class="font-mono text-xs whitespace-nowrap text-muted">{{ shortStamp(page.timestamp) }}</td>
                  <td class="font-mono text-xs text-dimmed">{{ page._meta.status ?? "n/a" }}</td>
                  <td class="text-end whitespace-nowrap">
                    <NuxtLink :to="{ path: '/timeline', query: { target: page.url, provider: form.provider, limit: '50' } }" class="archives-btn h-7 px-2 text-xs" title="All captures of this URL">
                      <UIcon name="i-lucide-history" class="size-3.5" />
                    </NuxtLink>
                    <NuxtLink :to="captureLink(page)" class="archives-btn ms-1 h-7 px-2 text-xs">
                      <UIcon name="i-lucide-eye" class="size-3.5" />
                      View
                    </NuxtLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
