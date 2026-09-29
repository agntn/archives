<script setup lang="ts">
import { version } from "../../../package.json";
</script>

<template>
  <!-- The mark: an archive box in a boxed cell, the scope dimmed, the name bright, the version as a tag. -->
  <span class="site-logo">
    <span class="site-logo-cell" aria-hidden="true"><UIcon name="i-lucide-archive" /></span>
    <span class="site-logo-name"><span class="site-logo-scope">@agntn/</span>archives</span>
    <span class="site-logo-version">v{{ version }}</span>
  </span>
</template>

<style scoped>
.site-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.site-logo-cell {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  color: var(--console-accent);
  background: color-mix(in srgb, var(--ui-text-muted) 5%, var(--ui-bg));
  box-shadow: inset 0 0 0 1px var(--console-line);
  clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%);
}
.site-logo-cell > * {
  width: 14px;
  height: 14px;
}
.site-logo-name {
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: -0.01em;
  color: var(--ui-text-highlighted);
}
.site-logo-scope {
  color: var(--ui-text-dimmed);
}
.site-logo-version {
  padding: 1px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.06em;
  color: var(--ui-text-muted);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
a:hover .site-logo-cell {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--console-accent) 55%, transparent);
}
@media (width < 400px) {
  .site-logo-version {
    display: none;
  }
}
</style>
