<script setup lang="ts">
const route = useRoute();

/** The site's areas; the docs sections are the tabs under the header. */
const links = [
  { label: "Docs", to: "/guide", areas: ["/guide", "/providers"] },
  {
    label: "Explorer",
    to: "/timeline",
    areas: ["/timeline", "/compare", "/site", "/urls", "/history", "/evidence", "/agent", "/status", "/shelf", "/capture"],
  },
] as const;

/**
 * Whether the route is inside an area, so /providers/wayback lights Docs.
 *
 * @param {readonly string[]} areas - The paths the area covers.
 * @returns {boolean} Whether the route is one of them or a page under one.
 */
function isActive(areas: readonly string[]): boolean {
  return areas.some((to) => route.path === to || route.path.startsWith(`${to}/`));
}
</script>

<template>
  <!-- Sections as mono labels; the one you are in gets the square node the sidebar uses. -->
  <nav aria-label="Primary" class="site-nav">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="site-nav-link"
      :aria-current="isActive(link.areas) ? 'page' : undefined"
    >
      {{ link.label }}
    </NuxtLink>
    <span class="site-nav-rule" aria-hidden="true" />
  </nav>
</template>

<style scoped>
.site-nav {
  display: none;
  align-items: center;
  gap: 4px;
}
@media (width >= 64rem) {
  .site-nav {
    display: flex;
  }
}
.site-nav-link {
  position: relative;
  padding: 6px 10px 6px 18px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  transition: color 0.15s ease;
}
.site-nav-link::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 6px;
  width: 5px;
  height: 5px;
  transform: translateY(-50%);
  box-shadow: inset 0 0 0 1px var(--console-line);
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;
}
.site-nav-link:hover {
  color: var(--ui-text-highlighted);
}
.site-nav-link[aria-current="page"] {
  color: var(--ui-text-highlighted);
}
.site-nav-link[aria-current="page"]::before {
  background: var(--console-accent);
  box-shadow: none;
}
.site-nav-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
.site-nav-rule {
  width: 1px;
  height: 20px;
  margin-inline: 8px 4px;
  background: var(--console-line);
}
@media (prefers-reduced-motion: reduce) {
  .site-nav-link,
  .site-nav-link::before {
    transition: none;
  }
}
</style>
