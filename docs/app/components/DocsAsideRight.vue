<script setup lang="ts">
/**
 * The page's table of contents, overriding Docus on wide screens: a section title like the instruments',
 * a rail of ticks on the left, numbered sections, and a square node in the accent on the headings in view.
 * Below `lg` the Nuxt UI toc and the Docus mobile bar stay, so the collapsible behaviour doesn't change.
 */
import type { DocsCollectionItem } from "@nuxt/content";

interface TocLink {
  readonly id: string;
  readonly text: string;
  readonly children?: readonly TocLink[];
}

const props = defineProps<{ page?: DocsCollectionItem | null }>();

const links = computed(() => props.page?.body?.toc?.links ?? []);

const appConfig = useAppConfig();
const { t } = useDocusI18n();
const contentTocVariants = useUIConfig("contentToc");

const { activeHeadings, updateHeadings } = useScrollspy();
const nuxtApp = useNuxtApp();

/** Every heading the toc points at, top level and nested, for the scrollspy to observe. */
function refreshHeadings() {
  const ids = links.value.flatMap((link) => [link.id, ...(link.children ?? []).map((c) => c.id)]);
  if (ids.length === 0) {
    updateHeadings([]);
    return;
  }
  const selector = ids.map((id) => `#${CSS.escape(id)}`).join(", ");
  updateHeadings([...document.querySelectorAll<HTMLElement>(selector)]);
}

onMounted(refreshHeadings);
watch(links, () => nextTick(refreshHeadings));
const offLoadingEnd = nuxtApp.hooks.hook("page:loading:end", refreshHeadings);
const offTransitionFinish = nuxtApp.hooks.hook("page:transition:finish", refreshHeadings);
onUnmounted(() => {
  offLoadingEnd();
  offTransitionFinish();
});

const active = computed(() => new Set(activeHeadings.value));

/**
 * A section counts as active when it or one of its subsections is in view.
 *
 * @param {TocLink} link - A top level entry of the toc.
 * @returns {boolean} Whether the section or one of its subsections is in view.
 */
function sectionActive(link: TocLink): boolean {
  return (
    active.value.has(link.id) || (link.children ?? []).some((child) => active.value.has(child.id))
  );
}
</script>

<template>
  <div class="docs-aside">
    <nav v-if="links.length" class="docs-toc">
      <div class="toc-wide">
        <p class="console-label console-rule-title toc-title">
          <span>{{ appConfig.toc?.title || t("docs.toc") }}</span>
          <span class="console-mark" aria-hidden="true" />
        </p>
        <ol class="toc-list">
          <li v-for="(link, index) in links" :key="link.id" :data-active="sectionActive(link)">
            <a
              :href="`#${link.id}`"
              class="toc-link"
              :aria-current="active.has(link.id) ? 'location' : undefined"
            >
              <span class="toc-index">{{ String(index + 1).padStart(2, "0") }}</span>
              <span class="toc-text">{{ link.text }}</span>
            </a>
            <ol v-if="link.children?.length" class="toc-sublist">
              <li v-for="child in link.children" :key="child.id">
                <a
                  :href="`#${child.id}`"
                  class="toc-link toc-sub"
                  :data-active="active.has(child.id)"
                  :aria-current="active.has(child.id) ? 'location' : undefined"
                >
                  <span class="toc-text">{{ child.text }}</span>
                </a>
              </li>
            </ol>
          </li>
        </ol>
        <DocsAsideRightBottom />
      </div>
      <div class="toc-narrow">
        <UContentToc
          :highlight="contentTocVariants.highlight ?? true"
          :highlight-color="contentTocVariants.highlightColor"
          :highlight-variant="contentTocVariants.highlightVariant ?? 'circuit'"
          :color="contentTocVariants.color"
          :title="appConfig.toc?.title || t('docs.toc')"
          :links="links"
        />
      </div>
    </nav>

    <DocsAsideMobileBar :links="links" />
  </div>
</template>

<style scoped>
.toc-narrow {
  display: block;
}
.toc-wide {
  display: none;
}
/* The root sits in the page's right column, which spans the whole page, so it is the one that sticks. */
@media (width >= 64rem) {
  .docs-aside {
    position: sticky;
    top: var(--ui-header-height);
    max-height: calc(100vh - var(--ui-header-height));
    overflow-y: auto;
    scrollbar-width: none;
  }
  .toc-narrow {
    display: none;
  }
  .toc-wide {
    display: block;
    padding-block: 32px;
  }
}
.toc-title {
  margin: 0 0 14px;
}
.toc-title > .console-mark {
  width: 22px;
}
/* The rail: a column of ticks every 12 px, like the ruler turned upright, the nodes sit on it. */
.toc-list {
  position: relative;
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0 0 0 16px;
  list-style: none;
}
.toc-list::before {
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
.toc-list > li {
  position: relative;
}
/* A square node on the rail for the section in view, filled in the accent. */
.toc-list > li::before {
  content: "";
  position: absolute;
  top: 9px;
  left: -16px;
  width: 7px;
  height: 7px;
  background: var(--ui-bg);
  box-shadow: inset 0 0 0 1px var(--console-line);
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;
}
.toc-list > li[data-active="true"]::before {
  background: var(--console-accent);
  box-shadow: none;
}
.toc-link {
  display: grid;
  grid-template-columns: 1.6rem minmax(0, 1fr);
  align-items: baseline;
  gap: 6px;
  padding: 4px 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text-muted);
  transition: color 0.15s ease;
}
.toc-index {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ui-text-dimmed);
}
.toc-link:hover,
.toc-list > li[data-active="true"] > .toc-link {
  color: var(--ui-text-highlighted);
}
.toc-list > li[data-active="true"] > .toc-link > .toc-index {
  color: var(--console-accent);
}
.toc-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
/* Subsections: indented past the index column, a short tick instead of a number, the one in view in the accent. */
.toc-sublist {
  display: grid;
  margin: 0 0 4px;
  padding: 0 0 0 calc(1.6rem + 6px);
  list-style: none;
}
.toc-sub {
  position: relative;
  display: block;
  padding: 3px 0 3px 12px;
  font-size: 12.5px;
}
.toc-sub::before {
  content: "";
  position: absolute;
  top: 0.95em;
  left: 0;
  width: 6px;
  height: 1px;
  background: var(--console-line);
}
.toc-sub[data-active="true"] {
  color: var(--ui-text-highlighted);
}
.toc-sub[data-active="true"]::before {
  background: var(--console-accent);
}
@media (prefers-reduced-motion: reduce) {
  .toc-list > li::before,
  .toc-link {
    transition: none;
  }
}
</style>
