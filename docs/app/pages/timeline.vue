<script setup lang="ts">
definePageMeta({ layout: "default" });

useSeoMeta({
  title: "Timeline · @agntn/archives",
  description: "Query ten web archives for a domain, open any capture in place, and diff two versions, live.",
});
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero
      eyebrow="timeline"
      title="Timeline."
      accent="Ask every archive."
      description="Type a domain or a URL. The docs worker fans the query out through @agntn/archives, lists what each archive holds and opens any capture: played back by the archive, drawn from the archived bytes, or as text. Tick two to diff them."
      circuit="snapshots()"
    >
      <p class="timeline-note">
        <span class="console-tag">Note</span>
        <span>Archived bodies are recordings of other people's pages. They are shown as data and never executed. Queries hit public archives, so be gentle with them.</span>
      </p>
      <template #instrument>
        <TimelineExplorer />
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.timeline-note {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  max-width: 40rem;
  margin: 22px auto 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
  text-align: left;
  color: var(--ui-text-muted);
}
.timeline-note > .console-tag {
  flex: none;
  margin: 0;
}
</style>
