<script setup lang="ts">
import { PROVIDERS } from "../../utils/providers";
import { groupByProvider } from "../../utils/timeline";

const { targets, target, tick, paused, current, content, diff, step } = useLandingArchive();

const stats = [
  { value: "10", label: "providers" },
  { value: "4", label: "MCP tools" },
  { value: "3", label: "agent surfaces" },
  { value: "1", label: "response shape" },
] as const;

const buckets = computed(() => (current.value ? groupByProvider(current.value.details.response) : []));
const pages = computed(() => current.value?.details.response.pages ?? []);
const activeProvider = computed(() => tick.value % PROVIDERS.length);

const copied = ref(false);

async function copyInstall() {
  try {
    await navigator.clipboard.writeText("pnpm add @agntn/archives");
  } catch {
    return;
  }
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1200);
}

function providerNote(index: number): string {
  const provider = PROVIDERS[index]!;
  if (provider.needs) {
    return `needs ${provider.needs}`;
  }
  return provider.content ? `${provider.index} · reads bodies` : `${provider.index} · listing only`;
}
</script>

<template>
  <div class="archives-landing not-prose">
    <header class="archives-hero mx-auto w-full max-w-[var(--ui-container)] px-8 pt-24 pb-20 text-center sm:px-12 lg:px-16">
      <h1 class="archives-enter mx-auto max-w-3xl text-4xl leading-[1.08] font-medium tracking-tight text-highlighted sm:text-5xl lg:text-[3.75rem]">
        One query. <span class="text-primary">Every archive.</span>
      </h1>
      <p class="archives-enter archives-enter-2 mx-auto mt-6 max-w-xl text-base leading-7 text-muted">
        One TypeScript interface over ten web archives. List captures, read what a page said,
        diff two versions, and hand the same four tools to an agent over MCP.
      </p>
      <div class="archives-enter archives-enter-3 mt-8 flex flex-wrap items-center justify-center gap-2">
        <UButton to="/guide" color="primary" trailing-icon="i-lucide-arrow-right">
          Get started
        </UButton>
        <UButton to="https://github.com/agntn/archives" target="_blank" color="neutral" variant="outline" icon="i-simple-icons-github">
          Star on GitHub
        </UButton>
      </div>
      <button
        type="button"
        class="archives-enter archives-enter-4 archives-install mt-5"
        :aria-label="copied ? 'Copied' : 'Copy install command'"
        @click="copyInstall"
      >
        <span class="text-dimmed">$</span>
        <span>pnpm add @agntn/archives</span>
        <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3.5 text-dimmed" />
      </button>

      <div
        class="archives-enter archives-enter-4 mx-auto mt-16 hidden max-w-6xl md:block"
        @mouseenter="paused = true"
        @mouseleave="paused = false"
      >
        <LandingFlow :target="target" :buckets="buckets" :pages="pages" :total="pages.length" :tick="tick" />
      </div>
    </header>

    <dl class="archives-section grid grid-cols-2 sm:grid-cols-4">
      <div
        v-for="(stat, index) in stats"
        :key="stat.label"
        class="border-default px-6 py-7 text-center"
        :class="{ 'border-t sm:border-t-0': index >= 2, 'border-l': index % 2 === 1, 'sm:border-l': index > 0 }"
      >
        <dd class="font-mono text-2xl text-highlighted">{{ stat.value }}</dd>
        <dt class="mt-1 font-mono text-[11px] tracking-[0.12em] text-dimmed uppercase">{{ stat.label }}</dt>
      </div>
    </dl>

    <LandingFeature
      eyebrow="Snapshots"
      title="One call, every provider"
      to="/timeline"
      link="Open the timeline"
      :checks="[
        'Wayback, Arquivo.pt, Webarchiv Österreich, Archive.today, Common Crawl in one call',
        'A provider with no endpoint says so, instead of returning nothing',
        'Merged newest first, one page shape, a from/to window that holds across sources',
      ]"
    >
      Ask once and every archive answers in parallel, with concurrency, retries and a timeout you
      control. What comes back is one list, and the providers that could not answer are named
      with their reason. The panel queries the docs worker for {{ targets.length }} targets in turn.
      <template #visual>
        <LandingFanout :target="target" :sample="current" :tick="tick" @step="step" @pause="paused = $event" />
      </template>
    </LandingFeature>

    <LandingFeature
      eyebrow="Content"
      title="Read what the page said"
      to="/guide/content"
      link="Reading captures"
      :checks="[
        'Original bytes from raw replay endpoints, never the archive\'s own UI',
        'Transfer and content encodings, charset, and markup-to-text handled',
        'A timestamp picks the closest capture; the answer says which one it got',
      ]"
      reverse
    >
      Listing captures says when a page existed. Reading one says what it contained. The same
      call works on Wayback, Arquivo.pt, Webarchiv Österreich, Archive-It and Common Crawl WARC
      ranges, and returns the decoded body with its real capture date.
      <template #visual>
        <LandingRead :sample="content" />
      </template>
    </LandingFeature>

    <LandingFeature
      eyebrow="Diff"
      title="Compare two captures"
      to="/guide/diff"
      link="Comparing versions"
      :checks="[
        'Visible text by default, decoded source with format=raw',
        'Both captures from one provider, so replay rewriting never looks like a change',
        'Bounded by time and edit distance, with a digest that pins the patch',
      ]"
    >
      Two dates, one URL, one provider. The result is a unified diff with the exact capture dates
      it resolved to, plus a warning when either body was truncated before comparison, so an
      absence is never over-claimed.
      <template #visual>
        <LandingDiff :diff="diff" />
      </template>
    </LandingFeature>

    <LandingFeature
      eyebrow="Providers"
      title="Ten sources, one shape"
      to="/providers"
      link="All providers"
      :checks="[
        'CDX, CDXJ, Memento TimeMaps, WARC byte ranges and REST behind one class',
        'Providers load lazily, only the ones you use ship',
        'Collection, user and API key options where the archive needs them',
      ]"
      reverse
    >
      Each provider is an adapter over the shared response helpers. Adding one means mapping an
      index format, not rewriting the client.
      <template #visual>
        <div class="archives-frame grid grid-cols-2 overflow-hidden rounded-xl sm:grid-cols-5">
          <NuxtLink
            v-for="(provider, index) in PROVIDERS"
            :key="provider.to"
            :to="provider.to"
            class="group flex flex-col gap-3 border-muted px-4 py-4 transition-colors duration-500 hover:bg-muted"
            :class="{
              'border-t': index >= 2,
              'sm:border-t-0': index < 5,
              'border-l': index % 2 === 1,
              'sm:border-l': index % 5 !== 0,
              'archives-cell-active': index === activeProvider,
            }"
          >
            <UIcon
              :name="provider.icon"
              class="size-5 text-muted transition-colors duration-500 group-hover:text-primary"
              :class="{ 'text-primary': index === activeProvider }"
            />
            <span>
              <span class="block text-sm font-medium text-highlighted">{{ provider.label }}</span>
              <span class="mt-0.5 block font-mono text-[10px] text-dimmed">{{ providerNote(index) }}</span>
            </span>
          </NuxtLink>
        </div>
      </template>
    </LandingFeature>

    <LandingFeature
      eyebrow="Agents"
      title="Four tools over MCP"
      to="/guide/agents"
      link="MCP server and extensions"
      :checks="[
        'archives_snapshots, archives_content, archives_diff, archives_providers',
        'The text carries the whole answer: provider, dates, URLs, and who could not answer',
        'Archived bodies are fenced as untrusted data, never as instructions',
      ]"
    >
      The MCP server, the Pi extension and the OMP extension call the same executors, so they
      answer identically. Slices, continuation arguments and digests let an agent page through
      a long body without re-reading it.
      <template #visual>
        <LandingToolCall :target="target" :sample="current" />
      </template>
    </LandingFeature>

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-20 text-center sm:px-12 lg:px-16">
        <h2 class="text-2xl font-medium tracking-tight text-highlighted sm:text-3xl">
          Start with one command
        </h2>
        <p class="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
          Pre-1.0. Pin exact versions, and treat every archived body as data you did not write.
        </p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-2">
          <UButton to="/guide" color="primary" trailing-icon="i-lucide-arrow-right">
            Read the guide
          </UButton>
          <UButton to="/timeline" color="neutral" variant="outline">
            Open the timeline
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>
