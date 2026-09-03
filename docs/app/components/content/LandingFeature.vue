<script setup lang="ts">
defineProps<{
  eyebrow: string;
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
        <p class="archives-eyebrow">{{ eyebrow }}</p>
        <h2 class="mt-3 text-2xl font-medium tracking-tight text-highlighted sm:text-[1.75rem]">
          {{ title }}
        </h2>
        <p class="mt-4 max-w-md text-sm leading-6 text-muted">
          <slot />
        </p>
        <ul class="mt-6 space-y-2.5">
          <li v-for="check in checks" :key="check" class="flex items-start gap-2.5 text-sm text-muted">
            <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{{ check }}</span>
          </li>
        </ul>
        <NuxtLink :to="to" class="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          {{ link }}
          <UIcon name="i-lucide-arrow-right" class="size-4" />
        </NuxtLink>
      </div>
      <div class="min-w-0" :class="reverse ? 'lg:order-1' : ''">
        <slot name="visual" />
      </div>
    </div>
  </section>
</template>
