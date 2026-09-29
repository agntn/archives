<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <ArchivesCallout kind="tip" :title="title"><slot mdc-unwrap="p" /></ArchivesCallout>
</template>
