<script setup lang="ts">
/**
 * A callout in the instrument grammar: a hatched strip with the kind's glyph on the left, then the
 * clipped shell with a bar (the kind as a boxed tag, the title, the hatched mark), the ruler and the
 * text in the reading face. The four prose overrides pass their kind; `title` comes from the markdown.
 */
const props = defineProps<{ kind: "warning" | "caution" | "note" | "tip"; title?: string }>();

const appConfig = useAppConfig();
/** Nuxt UI keeps the note's glyph under `info`; the other kinds use their own name. */
const ICON_KEYS = { warning: "warning", caution: "caution", note: "info", tip: "tip" } as const;
const icon = computed(() => appConfig.ui.icons[ICON_KEYS[props.kind]]);
</script>

<template>
  <aside class="archives-callout" :data-kind="kind">
    <span class="console-cross callout-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross callout-cross-br" aria-hidden="true">+</span>
    <div class="callout-strip" aria-hidden="true">
      <span class="callout-glyph"><UIcon :name="icon" /></span>
    </div>
    <div class="callout-main">
      <header class="callout-bar">
        <span class="callout-tag">{{ kind }}</span>
        <span v-if="title" class="callout-title">{{ title }}</span>
        <span class="console-mark" aria-hidden="true" />
      </header>
      <div class="console-ruler" aria-hidden="true" />
      <div class="callout-body"><slot mdc-unwrap="p" /></div>
    </div>
  </aside>
</template>

<style scoped>
.archives-callout {
  --callout-kind: var(--ui-text-muted);
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  margin-block: 24px;
  padding: 1px;
}
.archives-callout[data-kind="warning"] {
  --callout-kind: var(--console-accent);
}
.archives-callout[data-kind="caution"] {
  --callout-kind: var(--archives-del);
}
.archives-callout[data-kind="tip"] {
  --callout-kind: var(--ui-success);
}
/* The shell: an outer line and an inner fill, the top right and bottom left corners cut like every instrument. */
.archives-callout::before,
.archives-callout::after {
  content: "";
  position: absolute;
  pointer-events: none;
  clip-path: polygon(
    0 0,
    calc(100% - 12px) 0,
    100% 12px,
    100% 100%,
    12px 100%,
    0 calc(100% - 12px)
  );
}
.archives-callout::before {
  inset: 0;
  z-index: -2;
  background: var(--console-line);
}
.archives-callout::after {
  inset: 1px;
  z-index: -1;
  background: var(--ui-bg);
}
.callout-cross-tl {
  top: -7px;
  left: -7px;
}
.callout-cross-br {
  right: -7px;
  bottom: -7px;
}
/* The strip: hatching in the kind's colour, the glyph boxed at the top. It carries the kind at a glance. */
.callout-strip {
  position: relative;
  border-right: 1px solid var(--console-line);
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--callout-kind) 40%, transparent) 0 1px,
    transparent 1px 5px
  );
  clip-path: polygon(0 0, 100% 0, 100% 100%, 11px 100%, 0 calc(100% - 11px));
}
.callout-glyph {
  position: absolute;
  top: 8px;
  left: 50%;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  transform: translateX(-50%);
  color: var(--callout-kind);
  background: var(--ui-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--callout-kind) 55%, transparent);
}
.callout-glyph > * {
  width: 14px;
  height: 14px;
}
.callout-main {
  min-width: 0;
}
/* The bar: the kind as a boxed tag, the title in the instrument's title face, the hatched mark before the cut. */
.callout-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 8px 64px 8px 16px;
  background: color-mix(in srgb, var(--ui-text-muted) 5%, var(--ui-bg));
  clip-path: polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%);
}
.callout-bar > .console-mark {
  position: absolute;
  top: 50%;
  right: 22px;
  transform: translateY(-50%);
}
.callout-tag {
  flex: none;
  padding: 1px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--callout-kind);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--callout-kind) 55%, transparent);
}
.callout-title {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ui-text-highlighted);
}
.callout-body {
  padding: 12px 18px 16px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.65;
  color: var(--ui-text);
}
.callout-body :deep(strong) {
  color: var(--ui-text-highlighted);
}
.callout-body :deep(a) {
  color: var(--ui-text-highlighted);
  text-decoration: underline;
  text-decoration-color: var(--callout-kind);
  text-underline-offset: 3px;
}
.callout-body :deep(code) {
  font-size: 12px;
  color: var(--ui-text-highlighted);
}
.callout-body :deep(p) {
  margin: 0;
}
.callout-body :deep(p + p) {
  margin-top: 8px;
}
@media (width < 640px) {
  .archives-callout {
    grid-template-columns: 32px minmax(0, 1fr);
  }
  .callout-glyph {
    width: 22px;
    height: 22px;
  }
  .callout-bar {
    flex-wrap: wrap;
    gap: 6px 10px;
    padding-right: 24px;
  }
  .callout-bar > .console-mark {
    display: none;
  }
}
</style>
