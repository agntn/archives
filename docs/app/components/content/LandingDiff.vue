<script setup lang="ts">
import type { DiffSample } from "../../utils/landing-fixtures";
import { bareHost, dateOnly } from "../../utils/format";
import { providerInfo, providerLabel } from "../../utils/providers";
import { fencedBody } from "../../utils/timeline";

const props = defineProps<{ diff: DiffSample }>();

const result = computed(() => props.diff.details.result);
/** The hunks alone: the `---` and `+++` header lines repeat the two dates the row above already shows. */
const patch = computed(() =>
  fencedBody(props.diff.text)
    .split("\n")
    .filter((line) => !line.startsWith("--- ") && !line.startsWith("+++ "))
    .join("\n"),
);
const digest = computed(() => props.diff.details.digest?.slice(0, 12) ?? "");
const call = computed(
  () => `archives_diff({ target: "${props.diff.target}", before: "${props.diff.before}", after: "${props.diff.after}" })`,
);
</script>

<template>
  <section class="tool-console landing-diff" aria-label="Two captures compared">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="call">
        <span class="console-title" tabindex="0"
          ><span class="console-tag">Call</span>archives_diff(<span class="tok-str">"{{ bareHost(diff.target) }}"</span>)</span
        >
      </UTooltip>
      <span class="console-meta">{{ diff.live ? "live" : `recorded ${dateOnly(diff.fetchedAt)}` }}</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true"><span class="console-cursor" /></div>

    <div class="archives-band diff-band">
      <p class="console-label console-rule-title">
        <span
          >Patch
          <span aria-hidden="true"
            >[ {{ dateOnly(result?.before.timestamp ?? "") }} → {{ dateOnly(result?.after.timestamp ?? "") }} ]</span
          ></span
        >
        <span class="console-mark" aria-hidden="true" />
      </p>
      <DiffLines :patch="patch" :max="6" class="diff-lines" />
    </div>

    <ConsoleResponse
      :title="`archives_diff(&quot;${diff.target}&quot;)`"
      :text="diff.text"
      source="content[0].text"
      description="The tool text an agent receives: the resolved dates, the patch fenced as untrusted data, the digest."
    />

    <footer class="console-footer console-footer-plain">
      <span class="diff-foot">
        <UIcon :name="providerInfo(diff.provider)?.icon ?? 'i-lucide-archive'" class="diff-foot-glyph" aria-hidden="true" />
        <span class="diff-add">+{{ result?.additions ?? 0 }}</span>
        <span class="diff-del">−{{ result?.deletions ?? 0 }}</span>
        <span>{{ providerLabel(diff.provider) }} on both sides</span>
      </span>
      <span v-if="digest" class="console-meta">sha256 {{ digest }}…</span>
    </footer>
  </section>
</template>

<style scoped>
.diff-add {
  color: var(--archives-add);
}
.diff-del {
  color: var(--archives-del);
}
.diff-band {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.diff-band > .console-rule-title {
  margin-bottom: 10px;
}
.diff-foot {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.diff-foot-glyph {
  width: 13px;
  height: 13px;
  color: var(--ui-text-dimmed);
}
</style>
