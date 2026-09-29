<script setup lang="ts">
/** The instrument around one subject's glyph. Key it by the record so the lock arcs turn on a change. */
defineProps<{ icon: string }>();
</script>

<template>
  <div class="console-reticle" aria-hidden="true">
    <svg viewBox="0 0 120 120" fill="none">
      <path class="reticle-frame" d="M24 5H5V24M96 5H115V24M115 96V115H96M24 115H5V96" />
      <circle class="reticle-ticks" cx="60" cy="60" r="49" />
      <path
        class="reticle-sectors"
        d="M39 10H49M71 10H81M110 39V49M110 71V81M81 110H71M49 110H39M10 81V71M10 49V39"
      />
      <path class="reticle-lock" d="M60 18A42 42 0 0 1 102 60M60 102A42 42 0 0 1 18 60" />
      <path
        class="reticle-axis"
        d="M60 0V12M108 60H120M60 108V120M0 60H12M30 60H38M82 60H90M60 30V38M60 82V90"
      />
      <path class="reticle-diamond" d="M60 24L96 60L60 96L24 60Z" />
    </svg>
    <UIcon :name="icon" class="console-chain-icon" />
  </div>
</template>
