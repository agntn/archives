<script setup lang="ts">
/**
 * The page header's copy controls, overriding Docus: the same actions, drawn as boxed segments with the
 * top right corner cut, and the menu in the tooltip's grammar (`.archives-menu` in app.css).
 */
import { useClipboard } from "@vueuse/core";
import { withTrailingSlash } from "ufo";

const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const appBaseURL = runtimeConfig.app?.baseURL || "/";

const { copy, copied } = useClipboard();
const { t } = useDocusI18n();

const markdownLink = computed(
  () => `${window?.location?.origin}${withTrailingSlash(appBaseURL)}raw${route.path}.md`,
);
const items = computed(() => [
  [
    {
      label: t("docs.copy.link"),
      icon: "i-lucide-link",
      onSelect() {
        void copy(markdownLink.value);
      },
    },
    {
      label: t("docs.copy.view"),
      icon: "i-simple-icons:markdown",
      target: "_blank",
      to: markdownLink.value,
    },
    {
      label: t("docs.copy.gpt"),
      icon: "i-simple-icons:openai",
      target: "_blank",
      to: `https://chatgpt.com/?hints=search&q=${encodeURIComponent(`Read ${markdownLink.value} so I can ask questions about it.`)}`,
    },
    {
      label: t("docs.copy.claude"),
      icon: "i-simple-icons:anthropic",
      target: "_blank",
      to: `https://claude.ai/new?q=${encodeURIComponent(`Read ${markdownLink.value} so I can ask questions about it.`)}`,
    },
  ],
]);

/** The menu in the instrument grammar: classes only, the look lives in app.css because the menu is portalled. */
const MENU_UI = {
  content: "archives-menu",
  group: "archives-menu-group",
  separator: "archives-menu-separator",
  item: "archives-menu-item",
  itemLeadingIcon: "archives-menu-icon",
  itemTrailingIcon: "archives-menu-icon",
};

async function copyPage() {
  const page = await $fetch<string>(`/raw${route.path}.md`);
  await copy(page);
}
</script>

<template>
  <div class="page-links">
    <button
      type="button"
      class="page-link"
      :data-copied="copied"
      :aria-label="copied ? 'Copied' : t('docs.copy.page')"
      @click="copyPage"
    >
      <span class="page-link-cell" aria-hidden="true"
        ><UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3.5"
      /></span>
      <span class="page-link-label">{{ copied ? "Copied" : t("docs.copy.page") }}</span>
    </button>
    <UDropdownMenu
      size="sm"
      :items="items"
      :ui="MENU_UI"
      :content="{ align: 'end', side: 'bottom', sideOffset: 8 }"
    >
      <button
        type="button"
        class="page-link page-link-more"
        aria-label="More ways to read this page"
      >
        <span class="page-link-cell" aria-hidden="true"
          ><UIcon name="i-lucide-chevron-down" class="size-3.5"
        /></span>
      </button>
    </UDropdownMenu>
  </div>
</template>

<style scoped>
/* Two boxed segments that read as one control: the copy action and the menu, the group's top right corner cut. */
.page-links {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  padding: 1px;
}
.page-links::before,
.page-links::after {
  content: "";
  position: absolute;
  pointer-events: none;
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
}
.page-links::before {
  inset: 0;
  z-index: -2;
  background: var(--console-line);
}
.page-links::after {
  inset: 1px;
  z-index: -1;
  background: color-mix(in srgb, var(--ui-text-muted) 5%, var(--ui-bg));
}
.page-link {
  display: inline-flex;
  align-items: stretch;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-highlighted);
  cursor: pointer;
}
.page-link-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  color: var(--ui-text-muted);
  box-shadow: inset -1px 0 0 var(--console-line);
}
.page-link-label {
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
}
.page-link-more {
  box-shadow: inset 1px 0 0 var(--console-line);
}
.page-link-more .page-link-cell {
  box-shadow: none;
  padding-right: 4px;
}
.page-link:hover .page-link-cell,
.page-link[data-state="open"] .page-link-cell,
.page-link[data-copied="true"] .page-link-cell {
  color: var(--console-accent);
}
.page-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
</style>
