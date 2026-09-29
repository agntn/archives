<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <ArchivesCallout kind="warning" :title="title"><slot mdc-unwrap="p" /></ArchivesCallout>
</template>
