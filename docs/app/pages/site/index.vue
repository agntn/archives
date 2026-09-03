<script setup lang="ts">
definePageMeta({ layout: "default" });
useSeoMeta({ title: "Site coverage · @agntn/archives", description: "Which archives hold a domain, and when." });

const router = useRouter();
const domain = ref("");
const demos = ["example.com", "mozilla.org", "nuxt.com"] as const;

function go(value = domain.value) {
  const host = value.trim().replace(/^https?:\/\//u, "").replace(/\/.*$/u, "");
  if (host) {
    void router.push(`/site/${encodeURIComponent(host)}`);
  }
}
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero
      eyebrow="coverage"
      title="One domain."
      accent="Every archive's holdings."
      description="Seven archives asked in parallel: how many captures each one has, the first and the last, and a year by year heatmap of where the history actually lives."
    />
    <section class="archives-section">
      <div class="mx-auto w-full max-w-3xl px-8 py-12 sm:px-12">
        <form class="archives-frame overflow-hidden rounded-xl" @submit.prevent="go()">
          <div class="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end">
            <label class="flex-1">
              <span class="archives-label">domain</span>
              <input v-model="domain" type="text" class="archives-field font-mono" placeholder="example.com" autocomplete="off" spellcheck="false" />
            </label>
            <UButton type="submit" color="primary" icon="i-lucide-map">Show coverage</UButton>
          </div>
          <div class="flex flex-wrap items-center gap-2 border-t border-muted px-5 py-3">
            <span class="font-mono text-[11px] text-dimmed">warm:</span>
            <button v-for="demo in demos" :key="demo" type="button" class="archives-btn h-7 px-2 font-mono text-xs" @click="go(demo)">{{ demo }}</button>
          </div>
        </form>
      </div>
    </section>
  </div>
</template>
