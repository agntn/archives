<script setup lang="ts">
/**
 * A roster's column header that sorts its rows. A click steps through the column's first
 * direction, the other one, and back to the order the rows came in.
 */
const props = defineProps<{
  /** The table column from the header slot; only its sort state is read. */
  column: { getIsSorted(): false | "asc" | "desc"; toggleSorting(): void };
  label: string;
}>();

const sorted = computed(() => props.column.getIsSorted());
const name = computed(() => {
  if (sorted.value === "asc") return `${props.label}, sorted ascending`;
  if (sorted.value === "desc") return `${props.label}, sorted descending`;
  return `${props.label}, sort`;
});
const icon = computed(() => {
  if (sorted.value === "asc") return "i-lucide-arrow-up";
  if (sorted.value === "desc") return "i-lucide-arrow-down";
  return "i-lucide-chevrons-up-down";
});
</script>

<template>
  <button
    type="button"
    class="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-highlighted focus-visible:text-highlighted focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--console-accent) data-sorted:text-(--console-accent)"
    :data-sorted="sorted || undefined"
    :aria-label="name"
    @click="column.toggleSorting()"
  >
    {{ label }}
    <UIcon :name="icon" class="size-3" :class="{ 'opacity-50': !sorted }" aria-hidden="true" />
  </button>
</template>
