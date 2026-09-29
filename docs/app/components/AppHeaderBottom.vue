<script setup lang="ts">
/**
 * The docs sections as tabs under the header, overriding Docus: icon and mono label, the section you
 * are in lit with an accent segment on the bottom edge. The sidebar then holds that one section.
 */
const { sections } = useSubNavigation();
</script>

<template>
  <div class="header-tabs">
    <UContainer class="header-tabs-row">
      <nav aria-label="Documentation sections" class="header-tabs-nav">
        <NuxtLink
          v-for="section in sections"
          :key="section.to"
          :to="section.to"
          class="header-tab"
          :aria-current="section.active ? 'page' : undefined"
        >
          <UIcon
            v-if="section.icon"
            :name="section.icon"
            class="header-tab-icon"
            aria-hidden="true"
          />
          {{ section.title }}
        </NuxtLink>
      </nav>
      <AppHeaderBottomRight />
    </UContainer>
  </div>
</template>

<style scoped>
.header-tabs {
  display: none;
  border-top: 1px solid var(--console-line);
}
@media (width >= 64rem) {
  .header-tabs {
    display: block;
  }
}
.header-tabs-row {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
}
.header-tabs-nav {
  display: flex;
  align-items: stretch;
  gap: 4px;
  margin-left: -10px;
}
/* A tab: glyph and mono label; the active one gets the accent segment on the bottom edge. */
.header-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  transition: color 0.15s ease;
}
.header-tab::after {
  content: "";
  position: absolute;
  right: 10px;
  bottom: -1px;
  left: 10px;
  height: 2px;
  background: transparent;
  transition: background 0.15s ease;
}
.header-tab-icon {
  width: 14px;
  height: 14px;
  color: var(--ui-text-dimmed);
  transition: color 0.15s ease;
}
.header-tab:hover {
  color: var(--ui-text-highlighted);
}
.header-tab:hover .header-tab-icon {
  color: var(--ui-text-muted);
}
.header-tab[aria-current="page"] {
  color: var(--ui-text-highlighted);
}
.header-tab[aria-current="page"] .header-tab-icon {
  color: var(--console-accent);
}
.header-tab[aria-current="page"]::after {
  background: var(--console-accent);
}
.header-tab:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: -4px;
}
@media (prefers-reduced-motion: reduce) {
  .header-tab,
  .header-tab::after,
  .header-tab-icon {
    transition: none;
  }
}
</style>
