<script setup lang="ts">
defineProps<{
  title: string;
  to: string;
  link: string;
  checks: readonly string[];
  reverse?: boolean;
}>();
</script>

<template>
  <section class="archives-section">
    <div
      class="mx-auto grid w-full max-w-[var(--ui-container)] items-center gap-10 px-8 py-20 sm:px-12 lg:grid-cols-2 lg:gap-16 lg:px-16"
    >
      <div :class="reverse ? 'lg:order-2' : ''">
        <h2 class="text-2xl font-medium tracking-tight text-highlighted sm:text-[1.75rem]">
          {{ title }}
        </h2>
        <p class="mt-4 max-w-md text-sm leading-6 text-muted">
          <slot />
        </p>
        <!-- The points on a rail with a node each, like the sidebar; the link like the instruments' footers. -->
        <ul class="feature-checks">
          <li v-for="check in checks" :key="check">{{ check }}</li>
        </ul>
        <NuxtLink :to="to" class="feature-link">
          <span class="console-tag">Read</span>
          {{ link }}
          <UIcon name="i-lucide-arrow-right" class="feature-link-icon" aria-hidden="true" />
        </NuxtLink>
      </div>
      <div
        class="feature-visual min-w-0"
        :class="reverse ? 'lg:order-1' : ''"
        :data-side="reverse ? 'left' : 'right'"
      >
        <slot name="visual" />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The instrument sits on the container's outer edge, so every section shares the same left and right line. */
@media (width >= 64rem) {
  .feature-visual[data-side="right"] :deep(.tool-console) {
    margin-inline: auto 0;
  }
  .feature-visual[data-side="left"] :deep(.tool-console) {
    margin-inline: 0 auto;
  }
}
.feature-checks {
  position: relative;
  display: grid;
  gap: 12px;
  max-width: 28rem;
  margin: 24px 0 0;
  padding: 0 0 0 20px;
  list-style: none;
}
.feature-checks::before {
  content: "";
  position: absolute;
  top: 6px;
  bottom: 6px;
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
.feature-checks > li {
  position: relative;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
.feature-checks > li::before {
  content: "";
  position: absolute;
  top: 8px;
  left: -20px;
  width: 7px;
  height: 7px;
  background: var(--ui-bg);
  box-shadow: inset 0 0 0 1px var(--console-corner);
}
.feature-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 26px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--ui-text-highlighted);
}
.feature-link > .console-tag {
  margin: 0;
  color: var(--console-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--console-accent) 55%, transparent);
}
.feature-link-icon {
  width: 14px;
  height: 14px;
  color: var(--console-accent);
  transition: transform 0.15s ease;
}
.feature-link:hover {
  color: var(--console-accent);
}
.feature-link:hover .feature-link-icon {
  transform: translateX(2px);
}
.feature-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .feature-link-icon {
    transition: none;
  }
}
</style>
