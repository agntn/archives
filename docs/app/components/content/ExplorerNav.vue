<script setup lang="ts">
const route = useRoute();

const links = [
  { label: "Timeline", to: "/timeline" },
  { label: "Compare", to: "/compare" },
  { label: "Site", to: "/site" },
  { label: "URLs", to: "/urls" },
  { label: "History", to: "/history" },
  { label: "Evidence", to: "/evidence" },
  { label: "Agent", to: "/agent" },
  { label: "Status", to: "/status" },
  { label: "Shelf", to: "/shelf" },
] as const;

const { items } = useShelf();

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`);
}
</script>

<template>
  <!-- The explorer's pages as the header's areas: mono capitals, a square node on the page you are on. -->
  <nav aria-label="Explorer" class="explorer-nav">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="explorer-nav-link"
      :aria-current="isActive(link.to) ? 'page' : undefined"
    >
      {{ link.label }}<span v-if="link.to === '/shelf' && items.length" class="explorer-nav-count">{{ items.length }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.explorer-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 6px;
  max-width: 56rem;
  margin: 28px auto 0;
  padding-top: 16px;
  border-top: 1px dotted var(--console-line);
}
.explorer-nav-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px 5px 18px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  transition: color 0.15s ease;
}
.explorer-nav-link::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 6px;
  width: 5px;
  height: 5px;
  transform: translateY(-50%);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.explorer-nav-link:hover,
.explorer-nav-link[aria-current="page"] {
  color: var(--ui-text-highlighted);
}
.explorer-nav-link[aria-current="page"]::before {
  background: var(--console-accent);
  box-shadow: none;
}
.explorer-nav-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
.explorer-nav-count {
  padding: 0 5px;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--console-accent);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
@media (prefers-reduced-motion: reduce) {
  .explorer-nav-link {
    transition: none;
  }
}
</style>
