<script setup lang="ts">
/**
 * The shell every explorer instrument stands on: crosses, the bar with its tag, title and meta, the
 * ruler whose cursor loops while `busy`, then the page's bands and an optional sentence-case footer.
 * `as="form"` makes the shell the form itself, so a submit button inside it needs no wrapper.
 */
withDefaults(
  defineProps<{
    tag: string;
    title?: string;
    /** The whole call behind a shortened title, shown in a tooltip. */
    call?: string;
    meta?: string;
    busy?: boolean;
    /** Changes whenever the data does, so the cursor sweeps once per answer. */
    sweep?: string | number;
    as?: "section" | "form";
    label?: string;
  }>(),
  { as: "section", title: undefined, call: undefined, meta: undefined, sweep: undefined, label: undefined },
);
</script>

<template>
  <component :is="as" class="tool-console console-wide explorer-panel not-prose" :aria-label="label">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip v-if="call" :text="call">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">{{ tag }}</span><slot name="title">{{ title }}</slot></span
        >
      </UTooltip>
      <span v-else class="console-title"
        ><span class="console-tag">{{ tag }}</span><slot name="title">{{ title }}</slot></span
      >
      <span v-if="meta || $slots.meta" class="console-meta"><slot name="meta">{{ meta }}</slot></span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="sweep" :class="busy ? 'console-cursor console-cursor-busy' : 'console-cursor'" />
    </div>

    <slot />

    <footer v-if="$slots.footer" class="console-footer console-footer-plain">
      <slot name="footer" />
    </footer>
  </component>
</template>

<style scoped>
/* A grid item keeps its min-content width by default; a long capture URL would push the page wide. */
.explorer-panel {
  min-width: 0;
  text-align: left;
}
.explorer-panel + .explorer-panel {
  margin-top: 28px;
}
</style>
