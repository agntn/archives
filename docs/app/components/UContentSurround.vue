<script setup lang="ts">
/**
 * Previous and next pages as two small instruments, overriding the Nuxt UI surround that Docus renders
 * under every page: a hatched strip with the direction's arrow, then the clipped shell with a bar (the
 * direction as a boxed tag, the page title, the hatched mark), the ruler, the description and the path.
 */
interface SurroundLink {
  readonly title?: string;
  readonly description?: string;
  readonly path?: string;
}

const props = defineProps<{ surround?: readonly (SurroundLink | null | undefined)[] }>();

const links = computed(() =>
  (["previous", "next"] as const).map((direction, index) => ({
    direction,
    link: props.surround?.[index] ?? undefined,
    icon: direction === "previous" ? "i-lucide-arrow-left" : "i-lucide-arrow-right",
  })),
);
</script>

<template>
  <nav v-if="surround" class="surround" aria-label="Previous and next page">
    <template v-for="item in links" :key="item.direction">
      <NuxtLink
        v-if="item.link?.path"
        :to="item.link.path"
        class="surround-card"
        :data-direction="item.direction"
      >
        <span class="console-cross surround-cross-tl" aria-hidden="true">+</span>
        <span class="console-cross surround-cross-br" aria-hidden="true">+</span>
        <span class="surround-strip" aria-hidden="true">
          <span class="surround-glyph"><UIcon :name="item.icon" /></span>
        </span>
        <span class="surround-main">
          <span class="surround-bar">
            <span class="surround-tag">{{ item.direction }}</span>
            <span class="surround-title">{{ item.link.title }}</span>
            <span class="console-mark" aria-hidden="true" />
          </span>
          <span class="console-ruler" aria-hidden="true" />
          <span class="surround-body">
            <span v-if="item.link.description" class="surround-about">{{
              item.link.description
            }}</span>
            <span class="surround-path">{{ item.link.path }}</span>
          </span>
        </span>
      </NuxtLink>
      <span v-else class="surround-empty" aria-hidden="true" />
    </template>
  </nav>
</template>

<style scoped>
.surround {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.surround-card {
  --surround-edge: var(--console-line);
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  padding: 1px;
  color: inherit;
}
.surround-card[data-direction="next"] {
  grid-template-columns: minmax(0, 1fr) 40px;
}
.surround-card[data-direction="next"] .surround-strip {
  order: 2;
  border-right: 0;
  border-left: 1px solid var(--console-line);
}
/* The shell: an outer line and an inner fill, both corners cut; the line turns toward the accent on hover. */
.surround-card::before,
.surround-card::after {
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
.surround-card::before {
  inset: 0;
  z-index: -2;
  background: var(--surround-edge);
  transition: background 0.15s ease;
}
.surround-card::after {
  inset: 1px;
  z-index: -1;
  background: var(--ui-bg);
}
.surround-card:hover {
  --surround-edge: color-mix(in srgb, var(--console-accent) 50%, var(--console-line));
}
.surround-card:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 3px;
}
.surround-cross-tl {
  top: -7px;
  left: -7px;
}
.surround-cross-br {
  right: -7px;
  bottom: -7px;
}
/* The strip: hatching and the arrow boxed at the top, like the callout's kind strip. */
.surround-strip {
  position: relative;
  border-right: 1px solid var(--console-line);
  background: repeating-linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-text-muted) 30%, transparent) 0 1px,
    transparent 1px 5px
  );
}
.surround-card[data-direction="previous"] .surround-strip {
  clip-path: polygon(0 0, 100% 0, 100% 100%, 11px 100%, 0 calc(100% - 11px));
}
.surround-glyph {
  position: absolute;
  top: 8px;
  left: 50%;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  transform: translateX(-50%);
  color: var(--ui-text-muted);
  background: var(--ui-bg);
  box-shadow: inset 0 0 0 1px var(--console-line);
  transition: color 0.15s ease;
}
.surround-glyph > * {
  width: 14px;
  height: 14px;
}
.surround-card:hover .surround-glyph {
  color: var(--console-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--console-accent) 55%, transparent);
}
.surround-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
/* The bar: the direction as a boxed tag, the page title in the instrument's title face, the hatched mark. */
.surround-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 8px 20px 8px 14px;
  background: color-mix(in srgb, var(--ui-text-muted) 5%, var(--ui-bg));
}
.surround-card[data-direction="previous"] .surround-bar {
  clip-path: polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%);
}
.surround-tag {
  flex: none;
  padding: 1px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.surround-title {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.surround-card:hover .surround-title {
  color: var(--console-accent);
}
.surround-bar > .console-mark {
  width: 28px;
  margin-left: auto;
}
.surround-body {
  display: grid;
  gap: 8px;
  padding: 12px 16px 14px;
}
.surround-about {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
.surround-path {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--ui-text-dimmed);
}
@media (width < 640px) {
  .surround {
    grid-template-columns: minmax(0, 1fr);
  }
  .surround-empty {
    display: none;
  }
  .surround-bar > .console-mark {
    display: none;
  }
}
</style>
