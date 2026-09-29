<script setup lang="ts">
/**
 * Markdown tables in the roster grammar, overriding the Nuxt UI one: the clipped shell with its corner
 * crosses, the ruler, the column names as field labels on a tinted band, rows split by a quiet rule.
 */
defineProps<{ class?: string }>();
</script>

<template>
  <div class="archives-table">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>
    <div class="console-ruler" aria-hidden="true" />
    <div class="table-scroll">
      <table :class="['table-base', $props.class]">
        <slot />
      </table>
    </div>
  </div>
</template>

<style scoped>
.archives-table {
  position: relative;
  isolation: isolate;
  margin-block: 24px;
  padding: 1px;
}
/* The shell: an outer line and an inner fill, the top right and bottom left corners cut. */
.archives-table::before,
.archives-table::after {
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
.archives-table::before {
  inset: 0;
  z-index: -2;
  background: var(--console-line);
}
.archives-table::after {
  inset: 1px;
  z-index: -1;
  background: var(--ui-bg);
}
.archives-table > .console-ruler {
  border-top: 0;
  background-color: color-mix(in srgb, var(--ui-text-muted) 5%, var(--ui-bg));
  clip-path: polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%);
}
.table-scroll {
  overflow-x: auto;
}
.table-base {
  width: 100%;
  margin: 0;
  border-collapse: collapse;
}
/* The header: column names as field labels on the tinted band the bars use. */
.table-base :deep(th) {
  padding: 10px 18px;
  border: 0;
  box-shadow: inset 0 -1px 0 var(--console-line);
  background: color-mix(in srgb, var(--ui-text-muted) 5%, var(--ui-bg));
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-align: left;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}
/* Rows: one quiet rule between them, the text in the reading face and colour. */
.table-base :deep(td) {
  padding: 12px 18px;
  border: 0;
  box-shadow: inset 0 -1px 0 var(--console-line);
  vertical-align: top;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--ui-text);
}
.table-base :deep(tr:last-child > td) {
  box-shadow: none;
}
.table-base :deep(tbody tr:hover > td) {
  background: color-mix(in srgb, var(--ui-text-muted) 4%, transparent);
}
.table-base :deep(td p) {
  margin: 0;
}
@media (width < 640px) {
  .table-base :deep(th),
  .table-base :deep(td) {
    padding-inline: 12px;
  }
}
</style>
