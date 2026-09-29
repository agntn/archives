<script setup lang="ts">
import { version } from "../../../../package.json";
import type { SnapshotSample } from "../../utils/landing-fixtures";
import { PROVIDERS, PROVIDERS_IN_ALL } from "../../utils/providers";

defineProps<{
  target: string;
  sample: SnapshotSample | undefined;
  position: number;
  total: number;
}>();

const emit = defineEmits<{
  step: [delta: number];
  pause: [value: boolean];
}>();

const INSTALL = "pnpm add @agntn/archives";

/** Archives that hand back the bytes a capture recorded; Archive.today only serves its own rendering. */
const READERS = PROVIDERS.filter((provider) => provider.content && !provider.rendered).length;

const { copied, copy } = useCopied();
</script>

<template>
  <header class="archives-hero hero-page">
    <div class="hero-zone">
      <span class="hero-cross hero-cross-tl" aria-hidden="true">+</span>
      <span class="hero-cross hero-cross-tr" aria-hidden="true">+</span>
      <span class="hero-bracket hero-bracket-l" aria-hidden="true" />
      <span class="hero-bracket hero-bracket-r" aria-hidden="true" />

      <p class="console-id">
        <span class="console-id-tag">ID</span>
        <span>@agntn/archives</span>
        <span class="console-id-sep" aria-hidden="true">/</span>
        <span>v{{ version }}</span>
      </p>

      <h1 class="hero-title">One query. <span>Every archive.</span></h1>
      <p class="hero-lead">
        One TypeScript interface over the Wayback Machine, Arquivo.pt, Common Crawl and the other web
        archives. List captures, read what a page said, diff two versions, and hand the same tools to
        an agent over MCP.
      </p>

      <dl class="hero-metrics">
        <div>
          <dt>Providers</dt>
          <dd>{{ PROVIDERS.length }}</dd>
          <dd class="hero-metric-sub">{{ PROVIDERS_IN_ALL.length }} in all()</dd>
        </div>
        <div>
          <dt>Read</dt>
          <dd class="hero-metric-accent">{{ READERS }} <span>raw</span></dd>
          <dd class="hero-metric-sub">no toolbar</dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd>4</dd>
          <dd class="hero-metric-sub">3 hosts</dd>
        </div>
      </dl>

      <div class="console-actions">
        <UButton
          to="/guide"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          label="Get started"
        />
        <UButton
          to="https://github.com/agntn/archives"
          target="_blank"
          color="neutral"
          variant="outline"
          icon="i-simple-icons-github"
          label="Star on GitHub"
        />
      </div>
      <div class="console-install">
        <span class="console-install-tag">Install</span>
        <code><span class="console-install-prompt">$</span> {{ INSTALL }}</code>
        <UButton
          color="neutral"
          variant="subtle"
          :icon="copied === 'install' ? 'i-lucide-check' : 'i-lucide-copy'"
          :aria-label="copied === 'install' ? 'Copied' : 'Copy install command'"
          @click="copy('install', INSTALL)"
        />
      </div>
    </div>

    <div class="hero-instrument">
      <svg class="hero-circuit" viewBox="0 0 160 56" aria-hidden="true">
        <path class="hero-circuit-rail" d="M80 0V16L96 32V56" />
        <path :key="target" class="hero-circuit-live" d="M80 0V16L96 32V56" pathLength="1" />
        <path class="hero-circuit-seg" d="M96 38V48" />
        <rect class="hero-circuit-node" x="92.5" y="52.5" width="7" height="7" />
      </svg>
      <span class="hero-circuit-tag" aria-hidden="true">snapshots()</span>
      <LandingTimeline
        :target="target"
        :sample="sample"
        :position="position"
        :total="total"
        @step="emit('step', $event)"
        @pause="emit('pause', $event)"
      />
    </div>
  </header>
</template>
