<script setup lang="ts">
import { highlightJson, highlightShell, highlightTs } from "../../utils/highlight";

const props = defineProps<{ code: string; lang: "json" | "ts" | "shell" }>();

/** Markup produced from escaped text by our own tokenizer; nothing from an archive passes through here. */
const html = computed(() => {
  switch (props.lang) {
    case "json":
      return highlightJson(props.code);
    case "ts":
      return highlightTs(props.code);
    default:
      return highlightShell(props.code);
  }
});
</script>

<template>
  <pre class="archives-snippet"><code v-html="html" /></pre>
</template>
