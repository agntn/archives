<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <ArchivesCallout kind="caution" :title="title"><slot mdc-unwrap="p" /></ArchivesCallout>
</template>
