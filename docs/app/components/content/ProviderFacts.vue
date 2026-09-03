<script setup lang="ts">
import { providerInfo } from "../../utils/providers";

const props = defineProps<{ slug: string }>();

const info = computed(() => providerInfo(props.slug));

const facts = computed(() => {
  const provider = info.value;
  if (!provider) {
    return [];
  }
  return [
    { label: "factory", value: provider.factory, mono: true },
    { label: "index", value: provider.index, mono: true },
    { label: "reads bodies", value: provider.content ? "yes" : "no", mono: true },
    {
      label: "provider=all",
      value: provider.inAll ? "included" : provider.needs ? `no · needs ${provider.needs}` : "no",
      mono: true,
    },
  ];
});
</script>

<template>
  <dl class="archives-frame not-prose my-6 grid grid-cols-2 overflow-hidden rounded-xl sm:grid-cols-4">
    <div
      v-for="(fact, index) in facts"
      :key="fact.label"
      class="border-muted px-4 py-3.5"
      :class="{ 'border-t sm:border-t-0': index >= 2, 'border-l': index % 2 === 1, 'sm:border-l': index > 0 }"
    >
      <dt class="font-mono text-[10px] tracking-[0.12em] text-dimmed uppercase">{{ fact.label }}</dt>
      <dd class="mt-1 text-sm text-highlighted" :class="{ 'font-mono text-[13px]': fact.mono }">{{ fact.value }}</dd>
    </div>
  </dl>
</template>
