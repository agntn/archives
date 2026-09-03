<script setup lang="ts">
const route = useRoute();

const links = [
  { label: "Guide", to: "/guide" },
  { label: "Providers", to: "/providers" },
  { label: "Timeline", to: "/timeline" },
] as const;

function isActive(to: string) {
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
