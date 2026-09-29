<script setup lang="ts">
/**
 * The hero zone of an explorer page: the ID strip names the page, the title is two-tone, one
 * sentence says what the page runs, and the explorer's pages sit on the zone's last line. The
 * page's first instrument, passed in the `instrument` slot, hangs under it on the `circuit` tag.
 */
defineProps<{ eyebrow: string; title: string; accent: string; description?: string; circuit?: string }>();
</script>

<template>
  <header class="archives-hero hero-page tool-hero">
    <div class="hero-zone">
      <span class="hero-cross hero-cross-tl" aria-hidden="true">+</span>
      <span class="hero-cross hero-cross-tr" aria-hidden="true">+</span>
      <span class="hero-bracket hero-bracket-l" aria-hidden="true" />
      <span class="hero-bracket hero-bracket-r" aria-hidden="true" />

      <p class="console-id">
        <span class="console-id-tag">ID</span>
        <span>explorer</span>
        <span class="console-id-sep" aria-hidden="true">/</span>
        <span>{{ eyebrow }}</span>
      </p>

      <h1 class="hero-title tool-hero-title">{{ title }} <span>{{ accent }}</span></h1>
      <p v-if="description" class="hero-lead">{{ description }}</p>
      <slot />
      <ExplorerNav />
    </div>

    <div v-if="$slots.instrument" class="hero-instrument hero-instrument-keep tool-hero-instrument">
      <svg class="hero-circuit" viewBox="0 0 160 56" aria-hidden="true">
        <path class="hero-circuit-rail" d="M80 0V16L96 32V56" />
        <path class="hero-circuit-live" d="M80 0V16L96 32V56" pathLength="1" />
        <path class="hero-circuit-seg" d="M96 38V48" />
        <rect class="hero-circuit-node" x="92.5" y="52.5" width="7" height="7" />
      </svg>
      <span class="hero-circuit-tag" aria-hidden="true">{{ circuit ?? "input" }}</span>
      <slot name="instrument" />
    </div>
  </header>
</template>

<style scoped>
.tool-hero {
  padding-top: 56px;
  padding-bottom: 48px;
}
.tool-hero-title,
.tool-hero .hero-lead {
  overflow-wrap: anywhere;
}
</style>
