<script setup lang="ts">
/**
 * Code blocks in the instrument grammar, overriding the Nuxt UI one: the clipped shell, a bar with the
 * language as a boxed tag, the filename and the copy button, the ruler, then the lines with numbers in
 * a gutter like the landing's snippets. The props mirror Nuxt UI's so markdown and MDC keep working.
 */
const props = withDefaults(
  defineProps<{
    code?: string;
    language?: string;
    filename?: string;
    highlights?: number[];
    hideHeader?: boolean;
    meta?: string;
    copy?: boolean | object;
    class?: string;
  }>(),
  { copy: true },
);

/** Short names for the tag: what a reader calls the language, not the grammar's id. */
const LANGUAGES: Readonly<Record<string, string>> = {
  typescript: "ts",
  javascript: "js",
  bash: "shell",
  sh: "shell",
  zsh: "shell",
  shell: "shell",
  shellscript: "shell",
  console: "shell",
};
const language = computed(() => {
  const value = props.language ?? "";
  return LANGUAGES[value] ?? (value === "" ? "text" : value);
});

const pre = useTemplateRef<HTMLPreElement>("pre");
const { copied, copy: copyText } = useCopied();

function copyCode() {
  void copyText("code", props.code ?? pre.value?.textContent ?? "");
}
</script>

<template>
  <div class="archives-pre">
    <header v-if="!hideHeader" class="pre-bar">
      <span class="pre-tag">{{ language }}</span>
      <span v-if="filename" class="pre-filename">{{ filename }}</span>
      <span class="console-mark" aria-hidden="true" />
      <button
        v-if="props.copy"
        type="button"
        class="console-button"
        :aria-label="copied === 'code' ? 'Copied' : 'Copy code'"
        :data-copied="copied === 'code'"
        @click="copyCode"
      >
        <UIcon
          :name="copied === 'code' ? 'i-lucide-check' : 'i-lucide-copy'"
          class="size-3"
          aria-hidden="true"
        />
        {{ copied === "code" ? "copied" : "copy" }}
      </button>
    </header>
    <div v-if="!hideHeader" class="console-ruler" aria-hidden="true" />
    <pre ref="pre" :class="['pre-body', props.class]" v-bind="$attrs"><slot /></pre>
  </div>
</template>

<style scoped>
.archives-pre {
  position: relative;
  isolation: isolate;
  margin-block: 20px;
  padding: 1px;
}
/* The shell: an outer line and an inner fill, the top right and bottom left corners cut. */
.archives-pre::before,
.archives-pre::after {
  content: "";
  position: absolute;
  pointer-events: none;
  clip-path: polygon(
    0 0,
    calc(100% - 12px) 0,
    100% 12px,
    100% 100%,
    12px 100%,
    0 calc(100% - 12px)
  );
}
.archives-pre::before {
  inset: 0;
  z-index: -2;
  background: var(--console-line);
}
.archives-pre::after {
  inset: 1px;
  z-index: -1;
  background: var(--ui-bg);
}
/* The bar: the language as a boxed tag, the filename in the title face, the hatched mark and the copy button. */
.pre-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 6px 20px 6px 16px;
  background: color-mix(in srgb, var(--ui-text-muted) 5%, var(--ui-bg));
  clip-path: polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%);
}
.pre-tag {
  flex: none;
  padding: 1px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.pre-filename {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.pre-bar > .console-mark {
  width: 28px;
  margin-left: auto;
}
/* The lines: numbers in a gutter, a wrapped line continues past the gutter, never under its number. */
.pre-body {
  margin: 0;
  padding: 14px 18px 16px 0;
  overflow-x: auto;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.75;
  color: var(--ui-text-highlighted);
  counter-reset: line;
}
/* Plain text has no lines to number, so it starts under the tag instead of at the shell's edge. */
.pre-body:not(.shiki) {
  padding-left: 16px;
}
.pre-body :deep(code) {
  display: grid;
  min-width: max-content;
  background: transparent;
}
.pre-body :deep(.line) {
  position: relative;
  display: block;
  min-height: 1.75em;
  padding-left: 3.25rem;
  counter-increment: line;
}
.pre-body :deep(.line)::before {
  content: counter(line);
  position: absolute;
  left: 0;
  width: 2.25rem;
  text-align: right;
  font-size: 11px;
  color: var(--ui-text-dimmed);
  user-select: none;
}
.pre-body :deep(.line.highlight) {
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
  box-shadow: inset 2px 0 0 var(--console-accent);
}
@media (width < 640px) {
  .pre-bar > .console-mark {
    display: none;
  }
  .pre-bar > .console-button {
    margin-left: auto;
  }
  .pre-body :deep(.line) {
    padding-left: 2.5rem;
  }
  .pre-body :deep(.line)::before {
    width: 1.75rem;
  }
}
</style>
