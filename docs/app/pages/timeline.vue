<script setup lang="ts">
definePageMeta({ layout: "default" });

useSeoMeta({
  title: "Timeline · @agntn/archives",
  description: "Query ten web archives for a domain, read a capture, and diff two versions, live.",
});
</script>

<template>
  <div class="archives-landing not-prose">
    <header class="archives-hero mx-auto w-full max-w-[var(--ui-container)] px-8 pt-20 pb-14 text-center sm:px-12 lg:px-16">
      <p class="archives-eyebrow justify-center">explorer</p>
      <h1 class="archives-enter mx-auto mt-4 max-w-3xl text-4xl leading-[1.08] font-medium tracking-tight text-highlighted sm:text-5xl lg:text-[3.5rem]">
        Timeline. <span class="text-primary">Ask every archive.</span>
      </h1>
      <p class="archives-enter archives-enter-2 mx-auto mt-6 max-w-xl text-base leading-7 text-muted">
        Type a domain or a URL. The docs worker fans the query out through
        <span class="font-mono text-highlighted">@agntn/archives</span>, lists what each archive holds,
        reads any capture that has a body, and diffs two of them.
      </p>
      <p class="archives-enter archives-enter-3 mx-auto mt-5 inline-flex max-w-xl items-start gap-2 text-left text-sm leading-6 text-dimmed">
        <UIcon name="i-lucide-shield-alert" class="mt-1 size-4 shrink-0 text-primary" />
        <span>
          Archived bodies are recordings of other people's pages. They are shown as data and
          never executed. Queries hit public archives; be gentle with them.
        </span>
      </p>
    </header>

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-14 sm:px-12 lg:px-16">
        <TimelineExplorer />
      </div>
    </section>
  </div>
</template>
