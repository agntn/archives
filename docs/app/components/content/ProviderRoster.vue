<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { PROVIDERS, type ProviderInfo } from "../../utils/providers";
import { ROSTER_CLASS, ROSTER_TABLE_UI } from "../../utils/roster";

/** Empty until a header is clicked: the rows then keep the order of the provider table. */
const sorting = ref<{ id: string; desc: boolean }[]>([]);

const roster = useTemplateRef<HTMLElement>("roster");
useRosterFlip(
  () => roster.value,
  () => sorting.value,
);

/** What a provider does, in the order the operations are always named. */
function operations(row: ProviderInfo): string {
  if (row.index === "none") return "nothing to list";
  return row.content ? "list · read · diff" : "list only";
}

const rows = PROVIDERS.map((provider) => ({ ...provider, can: operations(provider) }));
type Row = (typeof rows)[number];

const columns: TableColumn<Row>[] = [
  {
    accessorKey: "label",
    header: "Provider",
    sortingFn: "text",
    meta: { class: { th: "w-[12rem]" } },
  },
  /* Narrow, the row reads name and operations first, then the index, then the sentence. */
  {
    accessorKey: "index",
    header: "Index",
    enableSorting: false,
    meta: { class: { th: "w-[9rem]", td: "@max-[52rem]/roster:order-2" } },
  },
  {
    accessorKey: "about",
    header: "What it talks to",
    enableSorting: false,
    meta: { class: { td: "@max-[52rem]/roster:order-3" } },
  },
  {
    accessorKey: "can",
    header: "Can",
    sortingFn: "text",
    meta: {
      class: {
        th: "w-[10rem]",
        td: "@max-[52rem]/roster:order-1 @max-[52rem]/roster:col-span-1! @max-[52rem]/roster:justify-self-end",
      },
    },
  },
];

const order = computed(() => {
  const [first] = sorting.value;
  if (first === undefined) return "table order";
  const label = columns.find((column) => "accessorKey" in column && column.accessorKey === first.id)?.header;
  return `by ${String(label).toLowerCase()} ${first.desc ? "descending" : "ascending"}`;
});
</script>

<template>
  <section ref="roster" class="roster not-prose my-6" aria-label="Providers">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>
    <header :class="ROSTER_CLASS.bar">
      <span :class="ROSTER_CLASS.title">providers</span>
      <span :class="ROSTER_CLASS.meta">{{ PROVIDERS.length }} providers · {{ order }}</span>
    </header>
    <div class="roster-ruler" aria-hidden="true" />
    <UTable
      v-model:sorting="sorting"
      :data="rows"
      :columns="columns"
      :get-row-id="(row) => row.slug"
      :ui="ROSTER_TABLE_UI"
    >
      <template #label-header="{ column }"><RosterSort :column="column" label="Provider" /></template>
      <template #can-header="{ column }"><RosterSort :column="column" label="Can" /></template>
      <template #label-cell="{ row }">
        <NuxtLink :to="row.original.to" :class="[ROSTER_CLASS.name, 'items-baseline']">
          <UIcon :name="row.original.icon" class="relative top-0.5 size-3.5 flex-none" aria-hidden="true" />
          <span>{{ row.original.label }}</span>
        </NuxtLink>
      </template>
      <template #index-cell="{ row }">
        <span :class="row.original.index === 'none' ? 'text-dimmed' : 'text-muted'">{{ row.original.index }}</span>
      </template>
      <template #about-cell="{ row }">
        <span :class="ROSTER_CLASS.about">{{ row.original.about }}</span>
      </template>
      <template #can-cell="{ row }">
        <span :class="ROSTER_CLASS.count"
          ><span :class="ROSTER_CLASS.leader" aria-hidden="true" /><span
            class="whitespace-nowrap"
            :class="row.original.content ? 'text-highlighted' : 'text-dimmed'"
            >{{ row.original.can }}</span
          ></span
        >
      </template>
    </UTable>
    <footer :class="ROSTER_CLASS.footer">
      <span>{{ PROVIDERS.filter((provider) => provider.inAll).length }} in providers.all() / no network</span>
      <span :class="ROSTER_CLASS.meta">createArchive(providers.&lt;name&gt;()) loads one</span>
    </footer>
  </section>
</template>
