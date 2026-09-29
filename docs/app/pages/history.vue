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
const providerItems = bodyProviders.map((provider) => ({ label: provider.label, value: provider.slug, icon: provider.icon }));
const pickedProvider = computed(() => providerItems.find((item) => item.value === form.provider));
/** Two captures make one comparison; the worker reads at most seven. */
const limitItems = [2, 3, 4, 5, 6, 7].map((limit) => ({ label: `${limit} captures`, value: limit }));
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
      circuit="history"
    >
      <template #instrument>
        <div class="history-stack">
          <ExplorerPanel
            as="form"
            tag="Call"
            role="search"
            label="Trace one page"
            :busy="state.loading"
            :meta="pickedProvider?.label"
            @submit.prevent="load"
          >
            <template #title>history(<span class="tok-str">"{{ form.target || "https://example.com/" }}"</span>)</template>
            <div class="archives-band history-form">
              <div class="console-readout">
                <dl class="console-readout-rows">
                  <div>
                    <dt><label for="history-target">Page</label></dt>
                    <dd><UInput id="history-target" v-model="form.target" variant="none" placeholder="https://example.com/" autocomplete="off" spellcheck="false" class="w-full" /></dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>
                      <USelectMenu v-model="form.provider" :items="providerItems" value-key="value" :icon="pickedProvider?.icon" variant="none" :search-input="false" aria-label="Provider" class="w-full" />
                    </dd>
                  </div>
                  <div>
                    <dt>Captures</dt>
                    <dd>
                      <USelectMenu v-model="form.limit" :items="limitItems" value-key="value" variant="none" :search-input="false" aria-label="Captures" class="w-full" />
                    </dd>
                  </div>
                  <div>
                    <dt><label for="history-from">From</label></dt>
                    <dd><UInput id="history-from" v-model="form.from" variant="none" placeholder="2010" autocomplete="off" class="w-full" /></dd>
                  </div>
                </dl>
              </div>
              <div class="history-actions">
                <UButton type="submit" color="primary" variant="solid" :loading="state.loading" trailing-icon="i-lucide-git-compare" label="Trace" />
              </div>
            </div>
            <template #footer>
              <span>Reads every listed capture once and diffs each pair in turn. Slow on purpose: the archive sees one reader.</span>
            </template>
          </ExplorerPanel>

          <ExplorerPanel
            v-if="state.loading || state.error || state.result"
            tag="Log"
            label="Changes between consecutive captures"
            :busy="state.loading"
            :sweep="state.result?.fetchedAt"
            :meta="state.result ? `${state.result.pages.length} captures · ${state.result.steps.length} comparisons` : 'reading'"
          >
            <template #title>{{ state.result?.target ?? form.target }}</template>
            <div v-if="state.loading" class="archives-band">
              <p class="archives-note">
                <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
                Reading captures and comparing pairs. This can take a minute.
              </p>
            </div>
            <div v-else-if="state.error" class="archives-band">
              <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ state.error }}</p>
            </div>
            <ol v-else-if="state.result" class="archives-rows history-rows">
              <li
                v-for="step in state.result.steps"
                :key="`${step.before.snapshot}->${step.after.snapshot}`"
                :data-biggest="biggest === step"
              >
                <span class="history-pair">
                  <NuxtLink :to="captureLink(step.before)">{{ shortStamp(step.before.timestamp).slice(0, 10) }}</NuxtLink>
                  <span class="archives-dim" aria-hidden="true">→</span>
                  <NuxtLink :to="captureLink(step.after)">{{ shortStamp(step.after.timestamp).slice(0, 10) }}</NuxtLink>
                </span>
                <span class="history-change">
                  <UTooltip :text="`+${step.additions} −${step.deletions}`">
                    <span class="history-bar" tabindex="0">
                      <span class="history-bar-add" :style="{ width: width(step.additions, step) }" />
                      <span class="history-bar-del" :style="{ width: width(step.deletions, step) }" />
                    </span>
                  </UTooltip>
                  <span class="history-counts">
                    <span v-if="step.error" class="history-del">{{ step.error }}</span>
                    <template v-else>
                      <span class="history-add">+{{ step.additions }}</span>
                      <span class="history-del">−{{ step.deletions }}</span>
                      <span v-if="step.identical">identical</span>
                      <span v-if="step.partial" class="history-del">partial</span>
                      <span v-if="biggest === step" class="console-accent">biggest change</span>
                    </template>
                  </span>
                </span>
                <UButton :to="compareLink(step.before, step.after)" color="neutral" variant="subtle" icon="i-lucide-columns-2" label="side by side" />
              </li>
            </ol>
            <template v-if="state.result && biggest" #footer>
              <span>biggest change {{ shortStamp(biggest.before.timestamp).slice(0, 10) }} → {{ shortStamp(biggest.after.timestamp).slice(0, 10) }}</span>
              <span class="console-meta">visible text, one archive</span>
            </template>
          </ExplorerPanel>
        </div>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.history-stack {
  display: grid;
  gap: 28px;
}
.history-stack > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
.history-form {
  display: grid;
  gap: 16px;
}
.history-form .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
.history-rows > li {
  grid-template-columns: 14rem minmax(0, 1fr) auto;
  align-items: center;
}
.history-rows > li[data-biggest="true"] {
  box-shadow: inset 2px 0 0 var(--console-accent);
}
.history-rows > li + li[data-biggest="true"] {
  box-shadow:
    inset 2px 0 0 var(--console-accent),
    inset 0 1px 0 var(--console-line);
}
.history-pair {
  display: inline-flex;
  gap: 8px;
}
.history-change {
  display: grid;
  gap: 6px;
  min-width: 0;
}
/* How much moved: additions and deletions side by side on one track, scaled to the biggest step. */
.history-bar {
  display: flex;
  height: 6px;
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.history-bar-add {
  background: color-mix(in srgb, var(--archives-add) 70%, transparent);
}
.history-bar-del {
  background: color-mix(in srgb, var(--archives-del) 70%, transparent);
}
.history-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 11px;
  color: var(--ui-text-dimmed);
}
.history-add {
  color: var(--archives-add);
}
.history-del {
  color: var(--archives-del);
}
@media (width < 52rem) {
  .history-rows > li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .history-change {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
@media (width < 640px) {
  .history-form .console-readout-rows > div {
    grid-template-columns: 5rem minmax(0, 1fr);
  }
}
</style>
