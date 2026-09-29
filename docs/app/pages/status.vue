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

type BadgeColor = "neutral" | "error" | "primary";
type BadgeVariant = "subtle" | "outline";

/** How each probe state reads: answered bright, empty and unconfigured quiet, a failure red. */
const STATE: Record<Probe["state"], { label: string; color: BadgeColor; variant: BadgeVariant }> = {
  ok: { label: "ok", color: "neutral", variant: "subtle" },
  empty: { label: "empty", color: "neutral", variant: "outline" },
  unsupported: { label: "unsupported", color: "neutral", variant: "outline" },
  failed: { label: "failed", color: "error", variant: "outline" },
  "needs-config": { label: "needs config", color: "neutral", variant: "outline" },
};

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
      circuit="probe"
    >
      <template #instrument>
        <ExplorerPanel
          tag="Log"
          title="status()"
          label="Provider status"
          :busy="state.loading"
          :sweep="state.result?.fetchedAt"
          :meta="state.result ? `${answering} of ${state.result.probes.length} answering` : 'probing'"
        >
          <div v-if="state.loading" class="archives-band">
            <p class="archives-note">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
              Probing every provider…
            </p>
          </div>
          <div v-else-if="state.error" class="archives-band">
            <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ state.error }}</p>
          </div>
          <ul v-else-if="state.result" class="archives-rows status-rows">
            <li v-for="probe in state.result.probes" :key="probe.provider">
              <NuxtLink :to="providerInfo(probe.provider)?.to ?? '/providers'" class="status-name">
                <UIcon :name="providerInfo(probe.provider)?.icon ?? 'i-lucide-archive'" class="size-3.5 flex-none" aria-hidden="true" />
                <span>{{ providerLabel(probe.provider) }}</span>
              </NuxtLink>
              <span class="status-state">
                <UBadge :color="STATE[probe.state].color" :variant="STATE[probe.state].variant" :label="STATE[probe.state].label" />
              </span>
              <span class="archives-value status-ms">{{ probe.ms ? `${(probe.ms / 1000).toFixed(1)} s` : "n/a" }}</span>
              <span class="status-note">{{ probe.reason ?? probe.note }}</span>
            </li>
          </ul>
          <template #footer>
            <span v-if="state.result">probed {{ shortStamp(state.result.fetchedAt) }} with {{ state.result.target }}</span>
            <span v-else>one listing per provider</span>
            <span class="console-meta">cached ten minutes</span>
          </template>
        </ExplorerPanel>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.status-rows > li {
  grid-template-columns: minmax(10rem, 13rem) 7.5rem 4rem minmax(0, 1fr);
}
.status-name {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.status-name > .iconify {
  position: relative;
  top: 2px;
  color: var(--ui-text-muted);
}
.status-ms {
  text-align: right;
}
.status-note {
  min-width: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
@media (width < 52rem) {
  .status-rows > li {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
  .status-note {
    grid-column: 1 / -1;
  }
}
</style>
