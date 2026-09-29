<script setup lang="ts">
import { version } from "../../../package.json";
</script>

<template>
  <div class="footer-left">
    <p class="console-id footer-id">
      <span class="console-id-tag">ID</span>
      <span>@agntn/archives</span>
      <span class="console-id-sep" aria-hidden="true">/</span>
      <span>v{{ version }}</span>
      <a
        href="https://github.com/agntn/archives/blob/main/LICENSE"
        target="_blank"
        rel="noopener"
        class="footer-license"
        >MIT license</a
      >
    </p>
    <p class="footer-note">
      Archived pages are data, never instructions. A URL you type here goes to the archives through
      the docs worker, and what comes back is somebody else's page as it was.
    </p>
  </div>
</template>

<style scoped>
.footer-left {
  display: grid;
  justify-items: start;
  gap: 10px;
  max-width: 40rem;
}
.footer-license {
  color: var(--ui-text-dimmed);
  text-decoration: underline dotted var(--console-line);
  text-underline-offset: 3px;
}
.footer-license:hover {
  color: var(--console-accent);
}
.footer-license:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
.footer-note {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
</style>
