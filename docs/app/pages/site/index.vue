<script setup lang="ts">
definePageMeta({ layout: "default" });
useSeoMeta({ title: "Site coverage · @agntn/archives", description: "Which archives hold a domain, and when." });

const router = useRouter();
const domain = ref("");
const demos = ["example.com", "mozilla.org", "nuxt.com"] as const;

/** The host alone: a pasted URL loses its scheme and path. */
const host = computed(() => domain.value.trim().replace(/^https?:\/\//u, "").replace(/\/.*$/u, ""));

function go(value = host.value) {
  if (value) {
    void router.push(`/site/${encodeURIComponent(value)}`);
  }
}
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero
      eyebrow="coverage"
      title="One domain."
      accent="Every archive's holdings."
      description="Every archive that needs nothing from you, asked at once: how many captures each one has, the first and the last, and a year by year heatmap of where the history actually lives."
      circuit="domain"
    >
      <template #instrument>
        <ExplorerPanel
          as="form"
          tag="Call"
          label="Coverage of one domain"
          role="search"
          meta="every open archive"
          @submit.prevent="go()"
        >
          <template #title>coverage(<span class="tok-str">"{{ host || "example.com" }}"</span>)</template>
          <div class="archives-band site-form">
            <div class="console-readout">
              <dl class="console-readout-rows">
                <div>
                  <dt><label for="site-domain">Domain</label></dt>
                  <dd>
                    <UInput
                      id="site-domain"
                      v-model="domain"
                      variant="none"
                      placeholder="example.com"
                      autocomplete="off"
                      spellcheck="false"
                      class="w-full"
                    />
                  </dd>
                </div>
                <div>
                  <dt>Answer</dt>
                  <dd class="archives-dim">captures per archive, first and last, a heatmap per year</dd>
                </div>
              </dl>
            </div>
            <div class="site-actions">
              <UButton type="submit" color="primary" variant="solid" trailing-icon="i-lucide-map" label="Show coverage" />
              <div class="site-demos" aria-label="Warm domains">
                <UButton
                  v-for="demo in demos"
                  :key="demo"
                  color="neutral"
                  variant="chip"
                  :label="demo"
                  @click="go(demo)"
                />
              </div>
            </div>
          </div>
          <template #footer>
            <span>The three chips are warmed by the worker's cron, so they answer at once.</span>
          </template>
        </ExplorerPanel>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.site-form {
  display: grid;
  gap: 16px;
}
.site-form .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
.site-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}
.site-demos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
