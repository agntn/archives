<script setup lang="ts">
const route = useRoute();

const links = [
  { label: "Timeline", to: "/timeline", icon: "i-lucide-history" },
  { label: "Compare", to: "/compare", icon: "i-lucide-columns-2" },
  { label: "Site", to: "/site", icon: "i-lucide-map" },
  { label: "URLs", to: "/urls", icon: "i-lucide-list" },
  { label: "History", to: "/history", icon: "i-lucide-git-compare" },
  { label: "Agent", to: "/agent", icon: "i-lucide-terminal" },
  { label: "Status", to: "/status", icon: "i-lucide-activity" },
  { label: "Shelf", to: "/shelf", icon: "i-lucide-bookmark" },
] as const;

const { items } = useShelf();

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`);
}
</script>

<template>
  <nav aria-label="Explorer" class="archives-explorer-nav">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="archives-explorer-link"
      :class="{ 'archives-explorer-link-active': isActive(link.to) }"
    >
      <UIcon :name="link.icon" class="size-3.5" />
      {{ link.label }}
      <span v-if="link.to === '/shelf' && items.length" class="archives-explorer-count">{{ items.length }}</span>
    </NuxtLink>
  </nav>
</template>
