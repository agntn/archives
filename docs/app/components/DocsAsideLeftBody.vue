<script setup lang="ts">
/**
 * The docs sidebar in the instrument grammar, matching the table of contents on the right: each group
 * opens with a section title and its glyph, its pages hang on a rail of ticks, and the page you are on
 * gets a square node in the accent. The tree and its icons come from `useSubNavigation`.
 */
import type { ContentNavigationItem } from "@nuxt/content";

/** `full` shows every section, for the mobile menu, which has no tabs under the header. */
const props = defineProps<{ full?: boolean }>();

const { sidebarNavigation, fullNavigation } = useSubNavigation();
/** A page that is a view of the section rather than one of its entries names its tag in `navigation.lead`. */
type NavigationPage = ContentNavigationItem & { lead?: string };

/**
 * Each group with its views lifted out as leads: the page whose path is the section's own (an
 * overview, or the guide's first page) as `Index`, and any page whose frontmatter sets
 * `navigation.lead`, under that tag.
 */
const groups = computed(() =>
  (props.full ? fullNavigation.value : sidebarNavigation.value).map((group) => {
    const children = (group.children ?? []) as NavigationPage[];
    const isLead = (item: NavigationPage) => item.path === group.path || Boolean(item.lead);
    return {
      ...group,
      /** `useSubNavigation` sets the icon; the content type doesn't declare it. */
      icon: (group as ContentNavigationItem & { icon?: string }).icon,
      leads: children
        .filter(isLead)
        .sort((a, b) => Number(b.path === group.path) - Number(a.path === group.path))
        .map((item) => ({ item, tag: item.path === group.path ? "Index" : item.lead! })),
      entries: children.filter((item) => !isLead(item)),
    };
  }),
);
const route = useRoute();

/**
 * Whether a page is the one on screen. Leaf pages match exactly, so /guide isn't lit with /guide/diff.
 *
 * @param {ContentNavigationItem} item - A page of the tree.
 * @returns {boolean} Whether the route is on that page.
 */
function isActive(item: ContentNavigationItem): boolean {
  const path = route.path.replace(/\/$/, "") || "/";
  return path === item.path;
}
</script>

<template>
  <nav class="docs-nav" aria-label="Documentation">
    <section v-for="group in groups" :key="group.path" class="nav-group">
      <p class="console-label console-rule-title nav-title">
        <span>
          <span v-if="group.icon" class="nav-title-cell" aria-hidden="true"
            ><UIcon :name="group.icon"
          /></span>
          {{ group.title }}
        </span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <NuxtLink
        v-for="lead in group.leads"
        :key="lead.item.path"
        :to="lead.item.path"
        class="nav-index"
        :aria-current="isActive(lead.item) ? 'page' : undefined"
      >
        <span class="console-tag">{{ lead.tag }}</span>
        <span class="nav-index-text">{{ lead.item.title }}</span>
        <span class="console-leader" aria-hidden="true" />
      </NuxtLink>
      <ol v-if="group.entries.length" class="nav-list">
        <li
          v-for="item in group.entries"
          :key="item.path"
          :data-active="isActive(item)"
          :data-group="item.children?.length ? 'true' : undefined"
        >
          <NuxtLink
            :to="item.path"
            class="nav-link"
            :aria-current="isActive(item) ? 'page' : undefined"
          >
            <UIcon v-if="item.icon" :name="item.icon" class="nav-icon" aria-hidden="true" />
            <span class="nav-text">{{ item.title }}</span>
          </NuxtLink>
          <ol v-if="item.children?.length" class="nav-sublist">
            <li v-for="child in item.children" :key="child.path" :data-active="isActive(child)">
              <NuxtLink
                :to="child.path"
                class="nav-link nav-sub"
                :aria-current="isActive(child) ? 'page' : undefined"
              >
                <span class="nav-text">{{ child.title }}</span>
              </NuxtLink>
            </li>
          </ol>
        </li>
      </ol>
      <NuxtLink
        v-else
        :to="group.path"
        class="nav-link nav-single"
        :aria-current="isActive(group) ? 'page' : undefined"
      >
        <span class="nav-text">{{ group.title }}</span>
      </NuxtLink>
    </section>
  </nav>
</template>

<style scoped>
.docs-nav {
  display: grid;
  gap: 22px;
}
/* The group title stands out: its glyph boxed like the instruments' glyphs, the name brighter. */
.nav-title {
  margin: 0 0 10px;
}
.nav-title > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--ui-text-highlighted);
}
.nav-title-cell {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--console-accent);
  background: color-mix(in srgb, var(--ui-text-muted) 5%, var(--ui-bg));
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.nav-title-cell > * {
  width: 13px;
  height: 13px;
}
.nav-title > .console-mark {
  width: 22px;
}
/* The index page as a lead between the title and the entries, so an overview never reads as one of them. */
.nav-index {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 10px;
  padding: 3px 0;
  font-family: var(--font-sans);
  font-size: 13.5px;
  color: var(--ui-text-muted);
  transition: color 0.15s ease;
}
.nav-index > .console-tag {
  flex: none;
  min-width: 4.5rem;
  margin: 0;
  text-align: center;
}
.nav-index-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-index:hover,
.nav-index[aria-current="page"] {
  color: var(--ui-text-highlighted);
}
.nav-index:hover .console-leader::after,
.nav-index[aria-current="page"] .console-leader::after {
  background: var(--console-accent);
  box-shadow: none;
}
.nav-index[aria-current="page"] > .console-tag {
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px var(--console-accent);
}
.nav-index:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
/* The rail: ticks every 12 px down the left edge, the page nodes sit on it, like the toc on the right. */
.nav-list {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1px;
  margin: 0;
  padding: 0 0 0 16px;
  list-style: none;
}
.nav-list::before {
  content: "";
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 3px;
  width: 5px;
  border-left: 1px solid var(--console-line);
  background-image: repeating-linear-gradient(
    180deg,
    var(--console-corner) 0 1px,
    transparent 1px 12px
  );
  background-size: 3px 100%;
  background-repeat: no-repeat;
  opacity: 0.7;
}
.nav-list > li {
  position: relative;
  min-width: 0;
}
/* A square node on the rail for the page on screen, filled in the accent. */
.nav-list > li[data-active="true"]::before {
  content: "";
  position: absolute;
  top: 11px;
  left: -16px;
  width: 7px;
  height: 7px;
  background: var(--console-accent);
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 5px 0;
  font-family: var(--font-sans);
  font-size: 13.5px;
  line-height: 1.4;
  color: var(--ui-text-muted);
  transition: color 0.15s ease;
}
.nav-icon {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--ui-text-dimmed);
  transition: color 0.15s ease;
}
.nav-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-link:hover {
  color: var(--ui-text-highlighted);
}
.nav-link:hover .nav-icon {
  color: var(--ui-text-muted);
}
.nav-link[aria-current="page"] {
  color: var(--ui-text-highlighted);
}
.nav-link[aria-current="page"] .nav-icon {
  color: var(--console-accent);
}
.nav-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
/* A page with pages under it: the children sit past the icon column, a short tick each. */
.nav-sublist {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin: 0 0 4px;
  padding: 0 0 0 24px;
  list-style: none;
}
.nav-sub {
  position: relative;
  padding: 3px 0 3px 12px;
  font-size: 13px;
}
.nav-sub::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  width: 6px;
  height: 1px;
  background: var(--console-line);
}
.nav-sub[aria-current="page"]::before {
  background: var(--console-accent);
}
@media (prefers-reduced-motion: reduce) {
  .nav-link,
  .nav-icon {
    transition: none;
  }
}
</style>
