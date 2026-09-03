<script setup lang="ts">
import type { ArchivedPage } from "@agntn/archives";
import { captureLink, compareLink, errorText } from "../utils/capture";
import { shortStamp } from "../utils/format";
import { PROVIDERS } from "../utils/providers";

definePageMeta({ layout: "default" });
useSeoMeta({ title: "History · @agntn/archives", description: "How a page changed capture by capture in one archive." });

interface Step {
  before: ArchivedPage;
  after: ArchivedPage;
  additions: number;
  deletions: number;
  identical: boolean;
  partial: boolean;
  error?: string;
}

interface History {
  target: string;
  provider: string;
  pages: ArchivedPage[];
  steps: Step[];
  text: string;
  fetchedAt: string;
}

const route = useRoute();
const router = useRouter();
const form = reactive({ target: "https://example.com/", provider: "wayback", limit: 6, from: "", to: "" });
const state = reactive<{ loading: boolean; error?: string; result?: History }>({ loading: false });
const bodyProviders = PROVIDERS.filter((provider) => provider.content && !provider.needs);
const peak = computed(() => Math.max(1, ...(state.result?.steps.map((step) => step.additions + step.deletions) ?? [])));
const biggest = computed(() => {
  const steps = state.result?.steps ?? [];
  return steps.reduce<Step | undefined>((best, step) => (!best || step.additions + step.deletions > best.additions + best.deletions ? step : best), undefined);
});

async function load() {
  const target = form.target.trim();
  if (!target) {
    return;
  }
  state.loading = true;
  state.error = undefined;
  const query: Record<string, string> = { target, provider: form.provider, limit: String(form.limit) };
  if (form.from.trim()) query.from = form.from.trim();
  if (form.to.trim()) query.to = form.to.trim();
  void router.replace({ query });
  try {
    state.result = await $fetch<History>("/api/history", { retry: 0, query });
  } catch (error) {
    state.result = undefined;
    state.error = errorText(error);
  } finally {
    state.loading = false;
  }
}

function width(value: number, step: Step): string {
  const total = step.additions + step.deletions;
  return total ? `${Math.round((value / peak.value) * 100)}%` : "0%";
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
      form.limit = Number(read("limit")) || 6;
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
      eyebrow="history"
      title="What changed,"
      accent="capture by capture."
      description="Consecutive captures from one archive, each pair compared on its visible text. The bars show how much moved; the biggest jump is where the story is."
    />

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] space-y-6 px-8 py-12 sm:px-12 lg:px-16">
        <form class="archives-frame overflow-hidden rounded-xl" @submit.prevent="load">
          <div class="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-6">
            <label class="sm:col-span-2 lg:col-span-2">
              <span class="archives-label">page · URL</span>
              <input v-model="form.target" type="text" class="archives-field font-mono" placeholder="https://example.com/" autocomplete="off" spellcheck="false" />
            </label>
            <label>
              <span class="archives-label">provider</span>
              <select v-model="form.provider" class="archives-select">
                <option v-for="provider in bodyProviders" :key="provider.slug" :value="provider.slug">{{ provider.label }}</option>
              </select>
            </label>
            <label>
              <span class="archives-label">captures · up to 7</span>
              <input v-model.number="form.limit" type="number" min="2" max="7" class="archives-field font-mono" />
            </label>
            <label><span class="archives-label">from</span><input v-model="form.from" type="text" class="archives-field font-mono" placeholder="2010" /></label>
            <div class="flex items-end">
              <UButton type="submit" color="primary" class="w-full justify-center" :loading="state.loading" icon="i-lucide-git-compare">Trace</UButton>
            </div>
          </div>
          <p class="border-t border-muted px-5 py-3 font-mono text-[11px] text-dimmed">
            Reads every listed capture once and diffs each pair in turn. Wayback lists one capture a year by default, so six captures span six years. Slow on purpose; the archive sees one reader.
          </p>
        </form>

        <p v-if="state.loading" class="archives-frame flex items-center gap-2 rounded-xl px-5 py-4 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Reading captures and comparing pairs. This can take a minute.
        </p>
        <pre v-else-if="state.error" class="archives-body archives-frame rounded-xl" :style="{ color: 'var(--archives-del)' }">{{ state.error }}</pre>

        <div v-else-if="state.result" class="archives-frame overflow-hidden rounded-xl">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-muted px-5 py-3">
            <p class="font-mono text-xs text-muted">
              <span class="text-highlighted">{{ state.result.pages.length }}</span> captures · <span class="text-highlighted">{{ state.result.steps.length }}</span> comparisons
            </p>
            <p v-if="biggest" class="font-mono text-[11px] text-dimmed">
              biggest change {{ shortStamp(biggest.before.timestamp).slice(0, 10) }} → {{ shortStamp(biggest.after.timestamp).slice(0, 10) }}
            </p>
          </div>
          <ol class="divide-y divide-muted">
            <li v-for="step in state.result.steps" :key="`${step.before.snapshot}->${step.after.snapshot}`" class="grid gap-3 px-5 py-4 lg:grid-cols-[14rem_1fr_auto] lg:items-center">
              <p class="font-mono text-xs">
                <NuxtLink :to="captureLink(step.before)" class="text-primary hover:underline">{{ shortStamp(step.before.timestamp).slice(0, 10) }}</NuxtLink>
                <span class="mx-1.5 text-dimmed">→</span>
                <NuxtLink :to="captureLink(step.after)" class="text-primary hover:underline">{{ shortStamp(step.after.timestamp).slice(0, 10) }}</NuxtLink>
              </p>
              <div>
                <div class="archives-change-bar" :title="`+${step.additions} −${step.deletions}`">
                  <span class="archives-change-add" :style="{ width: width(step.additions, step) }" />
                  <span class="archives-change-del" :style="{ width: width(step.deletions, step) }" />
                </div>
                <p class="mt-1.5 font-mono text-[11px] text-dimmed">
                  <span v-if="step.error" :style="{ color: 'var(--archives-del)' }">{{ step.error }}</span>
                  <template v-else>
                    <span :style="{ color: 'var(--archives-add)' }">+{{ step.additions }}</span>
                    <span class="ms-2" :style="{ color: 'var(--archives-del)' }">−{{ step.deletions }}</span>
                    <span v-if="step.identical" class="ms-2">identical</span>
                    <span v-if="step.partial" class="ms-2" :style="{ color: 'var(--archives-del)' }">partial</span>
                    <span v-if="biggest === step" class="ms-2 text-primary">biggest change</span>
                  </template>
                </p>
              </div>
              <NuxtLink :to="compareLink(step.before, step.after)" class="archives-btn h-7 px-2 text-xs">
                <UIcon name="i-lucide-columns-2" class="size-3.5" />
                side by side
              </NuxtLink>
            </li>
          </ol>
        </div>
      </div>
    </section>
  </div>
</template>
