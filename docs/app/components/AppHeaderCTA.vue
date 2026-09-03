<script setup lang="ts">
const route = useRoute();

const links = [
  { label: "Guide", to: "/guide" },
  { label: "Providers", to: "/providers" },
  { label: "Explorer", to: "/timeline" },
] as const;

const EXPLORER = ["/timeline", "/compare", "/site", "/urls", "/history", "/agent", "/status", "/shelf", "/capture"];

function isActive(to: string) {
  if (to === "/timeline") {
    return EXPLORER.some((prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`));
  }
  return route.path === to || route.path.startsWith(`${to}/`);
}
</script>

<template>
  <nav aria-label="Primary" class="hidden items-center gap-1 lg:flex">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors"
      :class="isActive(link.to) ? 'text-highlighted' : 'text-muted hover:text-highlighted'"
    >
      {{ link.label }}
    </NuxtLink>
    <USeparator orientation="vertical" class="mx-1 h-5" />
  </nav>
</template>
