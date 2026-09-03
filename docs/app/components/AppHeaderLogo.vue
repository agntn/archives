<script setup lang="ts">
import { version } from "../../../package.json";
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <span class="font-mono text-[13px] tracking-tight text-highlighted">@agntn/archives</span>
    <span class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted">v{{ version }}</span>
  </span>
</template>
