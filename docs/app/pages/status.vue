<script setup lang="ts">
import { errorText } from "../utils/capture";
import { shortStamp } from "../utils/format";
import { providerInfo, providerLabel } from "../utils/providers";

definePageMeta({ layout: "default" });
useSeoMeta({ title: "Provider status · @agntn/archives", description: "Which archives answer right now, and how fast." });

interface Probe {
  provider: string;
  state: "ok" | "empty" | "unsupported" | "failed" | "needs-config";
  ms: number;
  note: string;
  reason?: string;
}

interface Status {
  target: string;
  probes: Probe[];
  fetchedAt: string;
}

const state = reactive<{ loading: boolean; error?: string; result?: Status }>({ loading: true });

async function load() {
  state.loading = true;
  state.error = undefined;
  try {
    state.result = await $fetch<Status>("/api/status", { retry: 0 });
  } catch (error) {
    state.error = errorText(error);
  } finally {
    state.loading = false;
  }
}

const answering = computed(() => state.result?.probes.filter((probe) => probe.state === "ok" || probe.state === "empty").length ?? 0);

onMounted(load);
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero
      eyebrow="status"
      title="Which archives answer"
      accent="right now."
      description="One tiny listing per provider, timed from the docs worker. Cached for ten minutes, so a demo does not turn into a stress test."
    >
      <p v-if="state.result" class="mt-3 font-mono text-xs text-dimmed">{{ answering }} answering · probed {{ shortStamp(state.result.fetchedAt) }} with {{ state.result.target }}</p>
    </ToolHero>

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-12 sm:px-12 lg:px-16">
        <p v-if="state.loading" class="archives-frame flex items-center gap-2 rounded-xl px-5 py-4 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Probing every provider…
        </p>
        <pre v-else-if="state.error" class="archives-body archives-frame rounded-xl" :style="{ color: 'var(--archives-del)' }">{{ state.error }}</pre>
        <div v-else-if="state.result" class="archives-frame overflow-hidden rounded-xl">
          <div class="archives-table-wrap">
            <table class="archives-table">
              <thead>
                <tr><th>provider</th><th>state</th><th>latency</th><th>note</th></tr>
              </thead>
              <tbody>
                <tr v-for="probe in state.result.probes" :key="probe.provider">
                  <td class="whitespace-nowrap">
                    <NuxtLink :to="providerInfo(probe.provider)?.to ?? '/providers'" class="inline-flex items-center gap-2 text-sm text-highlighted hover:text-primary">
                      <UIcon :name="providerInfo(probe.provider)?.icon ?? 'i-lucide-archive'" class="size-4 text-muted" />
                      {{ providerLabel(probe.provider) }}
                    </NuxtLink>
                  </td>
                  <td><span class="archives-state" :class="`archives-state-${probe.state === 'needs-config' ? 'unsupported' : probe.state}`">{{ probe.state === 'needs-config' ? 'needs config' : probe.state }}</span></td>
                  <td class="font-mono text-xs text-muted">{{ probe.ms ? `${(probe.ms / 1000).toFixed(1)} s` : "n/a" }}</td>
                  <td class="text-xs text-muted">{{ probe.reason ?? probe.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
