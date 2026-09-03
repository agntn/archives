<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; accent: string; description?: string }>();
</script>

<template>
  <header class="archives-hero mx-auto w-full max-w-[var(--ui-container)] px-8 pt-16 pb-10 text-center sm:px-12 lg:px-16">
    <p class="archives-eyebrow justify-center">{{ eyebrow }}</p>
    <h1 class="archives-enter mx-auto mt-4 max-w-3xl text-3xl leading-[1.1] font-medium tracking-tight text-highlighted sm:text-4xl lg:text-[3rem]">
      {{ title }} <span class="text-primary">{{ accent }}</span>
    </h1>
    <p v-if="description" class="archives-enter archives-enter-2 mx-auto mt-5 max-w-xl text-base leading-7 text-muted">
      {{ description }}
    </p>
    <slot />
    <ExplorerNav />
  </header>
</template>
