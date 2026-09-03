<script setup lang="ts">
import type { ArchivedPage } from "@agntn/archives";
import { dateOnly } from "../../utils/format";
import { PROVIDERS_IN_ALL, providerLabel } from "../../utils/providers";
import type { ProviderBucket } from "../../utils/timeline";

const props = defineProps<{
  target: string;
  buckets: readonly ProviderBucket[];
  pages: readonly ArchivedPage[];
  total: number;
  tick: number;
}>();

const W = 1200;
const H = 420;
const TARGET = { x: 24, y: 150, w: 250, h: 120 };
const NODE = { x: 470, w: 220, h: 44, gap: 22 };
const MERGED = { x: 900, y: 16, w: 276, h: 388 };
const ROW_H = 50;

const providers = computed(() =>
  PROVIDERS_IN_ALL.map((provider, index) => {
    const bucket = props.buckets.find((row) => row.provider === provider.meta);
    const y = 23 + index * (NODE.h + NODE.gap);
    return { ...provider, bucket, y, ok: bucket?.state === "ok" };
  }),
);

function stateLine(bucket: ProviderBucket | undefined): string {
  if (!bucket) {
    return "waiting";
  }
  if (bucket.state === "ok") {
    const first = bucket.first?.slice(0, 4);
    const last = bucket.last?.slice(0, 4);
    const span = first === last ? first : `${first} to ${last}`;
    return `${bucket.count} capture${bucket.count === 1 ? "" : "s"} · ${span}`;
  }
  if (bucket.state === "failed") {
    return /timeout/iu.test(bucket.reason ?? "") ? "timeout" : "failed";
  }
  return bucket.state === "unsupported" ? "unsupported" : "none in the newest 50";
}

function curvePath(x1: number, y1: number, x2: number, y2: number) {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

const trunkPaths = computed(() =>
  providers.value.map((provider) => ({
    d: curvePath(TARGET.x + TARGET.w, TARGET.y + TARGET.h / 2, NODE.x, provider.y + NODE.h / 2),
    ok: provider.ok,
  })),
);

const branchPaths = computed(() =>
  providers.value.map((provider) => ({
    d: curvePath(NODE.x + NODE.w, provider.y + NODE.h / 2, MERGED.x, MERGED.y + MERGED.h / 2),
    ok: provider.ok,
  })),
);

const rows = computed(() => props.pages.slice(0, 6));
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    class="archives-flow"
    role="img"
    aria-label="One target goes to six archive providers and comes back as one list of captures"
  >
    <g class="archives-flow-wires">
      <path v-for="(path, index) in trunkPaths" :key="`t${index}`" :d="path.d" :class="{ 'archives-flow-wire-dim': !path.ok }" />
      <path v-for="(path, index) in branchPaths" :key="`b${index}`" :d="path.d" :class="{ 'archives-flow-wire-dim': !path.ok }" />
    </g>
    <g :key="tick" class="archives-flow-pulses">
      <template v-for="(path, index) in trunkPaths" :key="`pt${index}`">
        <path v-if="path.ok" :d="path.d" class="archives-flow-pulse" />
      </template>
      <template v-for="(path, index) in branchPaths" :key="`pb${index}`">
        <path v-if="path.ok" :d="path.d" class="archives-flow-pulse archives-flow-pulse-late" />
      </template>
    </g>

    <g class="archives-flow-node">
      <rect :x="TARGET.x" :y="TARGET.y" :width="TARGET.w" :height="TARGET.h" rx="10" />
      <text :x="TARGET.x + 18" :y="TARGET.y + 30" class="archives-flow-label">target</text>
      <text :x="TARGET.x + 18" :y="TARGET.y + 66" class="archives-flow-domain archives-flow-accent">
        <tspan :key="target" class="archives-derive">{{ target }}</tspan>
      </text>
      <text :x="TARGET.x + 18" :y="TARGET.y + 96" class="archives-flow-mono">provider=all · limit 50</text>
    </g>

    <g v-for="provider in providers" :key="provider.slug" class="archives-flow-node" :class="{ 'archives-flow-dim': !provider.ok }">
      <rect :x="NODE.x" :y="provider.y" :width="NODE.w" :height="NODE.h" rx="8" />
      <text :x="NODE.x + 14" :y="provider.y + 18" class="archives-flow-title">{{ provider.label }}</text>
      <text :x="NODE.x + 14" :y="provider.y + 34" class="archives-flow-label">
        <tspan :key="`${target}-${stateLine(provider.bucket)}`" class="archives-derive">{{ stateLine(provider.bucket) }}</tspan>
      </text>
    </g>

    <g class="archives-flow-node">
      <rect :x="MERGED.x" :y="MERGED.y" :width="MERGED.w" :height="MERGED.h" rx="10" />
      <text :x="MERGED.x + 18" :y="MERGED.y + 28" class="archives-flow-label">pages · newest first</text>
      <text :x="MERGED.x + MERGED.w - 18" :y="MERGED.y + 28" text-anchor="end" class="archives-flow-mono">
        <tspan :key="total" class="archives-derive">{{ total }}</tspan>
      </text>
      <line
        :x1="MERGED.x + 1"
        :x2="MERGED.x + MERGED.w - 1"
        :y1="MERGED.y + 44"
        :y2="MERGED.y + 44"
        class="archives-flow-rule"
      />
      <g v-for="(page, index) in rows" :key="`${page.snapshot}`" class="archives-derive">
        <text :x="MERGED.x + 18" :y="MERGED.y + 74 + index * ROW_H" class="archives-flow-title">{{ dateOnly(page.timestamp) }}</text>
        <text :x="MERGED.x + 18" :y="MERGED.y + 92 + index * ROW_H" class="archives-flow-label">
          {{ providerLabel(String(page._meta.provider ?? "")) }}
        </text>
        <text :x="MERGED.x + MERGED.w - 18" :y="MERGED.y + 74 + index * ROW_H" text-anchor="end" class="archives-flow-mono">
          {{ page.timestamp.slice(11, 16) }}
        </text>
      </g>
    </g>
  </svg>
</template>
