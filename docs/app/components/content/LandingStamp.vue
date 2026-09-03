<script setup lang="ts">
const props = defineProps<{ value: string }>();

const GLYPHS = "0123456789abcdefghjkmnpqrstuvwxyz";
const DURATION = 480;

const shown = ref(props.value);
let frame: number | undefined;

function cancel() {
  if (frame !== undefined) {
    cancelAnimationFrame(frame);
    frame = undefined;
  }
}

/** Settles character by character; punctuation and spaces stay put so the shape reads during the scramble. */
function settle(target: string) {
  cancel();
  if (!import.meta.client || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    shown.value = target;
    return;
  }
  const start = performance.now();
  const run = (now: number) => {
    const progress = Math.min(1, Math.max(0, (now - start) / DURATION));
    const resolved = Math.floor(target.length * progress);
    let next = target.slice(0, resolved);
    for (let index = resolved; index < target.length; index += 1) {
      const char = target[index]!;
      next += /[0-9a-z]/iu.test(char) ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : char;
    }
    shown.value = next;
    if (progress < 1) {
      frame = requestAnimationFrame(run);
    } else {
      frame = undefined;
    }
  };
  frame = requestAnimationFrame(run);
}

watch(() => props.value, settle);
onUnmounted(cancel);
</script>

<template>
  <span class="archives-stamp">{{ shown }}</span>
</template>
