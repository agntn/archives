<script setup lang="ts">
import type { ArchivedPage } from "@agntn/archives";
import type { ContentDetails } from "@agntn/archives/tool-operations";
import {
  captureLink,
  captureStamp,
  citation,
  defaultMode,
  errorText,
  modeAvailable,
  pageKey,
  providerArgument,
  servesBodies,
  type ApiResult,
  type ViewMode,
} from "../../utils/capture";
import { formatBytes, shortStamp } from "../../utils/format";
import { canFrame, providerInfo, providerLabel } from "../../utils/providers";
import { fencedBody } from "../../utils/timeline";

const props = withDefaults(
  defineProps<{
    page: ArchivedPage;
    /** Captures in chronological order; enables previous and next. */
    pages?: readonly ArchivedPage[];
    mode?: ViewMode;
    /** Provider extras such as a collection, forwarded to the reads. */
    extra?: Readonly<Record<string, string>>;
    closable?: boolean;
    keyboard?: boolean;
    /** Frame height as CSS; the permalink page uses the whole viewport. */
    height?: string;
  }>(),
  { pages: () => [], mode: undefined, extra: () => ({}), closable: true, keyboard: true, height: undefined },
);

const emit = defineEmits<{
  select: [page: ArchivedPage];
  "update:mode": [mode: ViewMode];
  close: [];
}>();

const SOURCE_CHARS = 200_000;
const TEXT_CHARS = 6000;

const mode = ref<ViewMode>(props.mode ?? defaultMode(props.page));
const loading = ref(false);
const error = ref<string>();
const result = ref<ApiResult<ContentDetails>>();
const copied = ref<"cite" | "link" | undefined>();

const { has, toggle } = useShelf();

const key = computed(() => pageKey(props.page));
const index = computed(() => props.pages.findIndex((page) => pageKey(page) === key.value));
const previousPage = computed(() => (index.value > 0 ? props.pages[index.value - 1] : undefined));
const nextPage = computed(() =>
  index.value >= 0 && index.value < props.pages.length - 1 ? props.pages[index.value + 1] : undefined,
);
const label = computed(() => providerLabel(providerArgument(props.page)));
const caveat = computed(() => providerInfo(providerArgument(props.page))?.caveat);
const capture = computed(() => result.value?.details.response.content);
const body = computed(() => (result.value ? fencedBody(result.value.text) : ""));
const throttled = computed(() => Boolean(error.value && /\b429\b/u.test(error.value)));
const saved = computed(() => has(props.page));
const frameStyle = computed(() => (props.height ? { height: props.height } : undefined));

const modes = computed(() => {
  const bodies = servesBodies(props.page);
  return [
    { id: "replay" as const, label: "Replay", icon: "i-lucide-play", enabled: canFrame(props.page), why: "This archive does not allow its playback to be framed" },
    { id: "source" as const, label: "Source", icon: "i-lucide-code", enabled: bodies, why: "This archive serves no capture bodies" },
    { id: "text" as const, label: "Text", icon: "i-lucide-file-text", enabled: bodies, why: "This archive serves no capture bodies" },
  ];
});

/** The modes as tabs; one the archive can't serve stays visible but disabled, with the reason under it. */
const tabItems = computed(() =>
  modes.value.map((option) => ({ label: option.label, value: option.id, icon: option.icon, disabled: !option.enabled })),
);
const unavailable = computed(() => modes.value.filter((option) => !option.enabled));

/**
 * The archived markup as a document the browser can draw without running it.
 *
 * The frame is sandboxed with no scripts and no origin, the policy admits only
 * images, styles, fonts and media from the archive's own host, and `<base>` makes
 * relative assets resolve inside the capture instead of on the live web.
 */
const sourceDocument = computed(() => {
  if (mode.value !== "source" || !body.value || !capture.value) {
    return "";
  }
  const base = capture.value.snapshot;
  let origin = "";
  try {
    origin = new URL(base).origin;
  } catch {
    origin = "";
  }
  const policy = `default-src 'none'; img-src ${origin} data:; style-src 'unsafe-inline' ${origin}; font-src ${origin} data:; media-src ${origin}`;
  const head = `<meta http-equiv="Content-Security-Policy" content="${policy}"><base href="${base.replace(/"/gu, "%22")}" target="_blank">`;
  const cleaned = body.value
    .replace(/<script[\s\S]*?<\/script\s*>/giu, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh[^>]*>/giu, "")
    .replace(/<base[^>]*>/giu, "");
  return /<head[^>]*>/iu.test(cleaned) ? cleaned.replace(/<head[^>]*>/iu, (match) => `${match}${head}`) : `${head}${cleaned}`;
});

async function loadBody(offset = 0) {
  if (mode.value === "replay") {
    result.value = undefined;
    error.value = undefined;
    return;
  }
  loading.value = true;
  error.value = undefined;
  try {
    result.value = await $fetch<ApiResult<ContentDetails>>("/api/content", {
      retry: 0,
      query: {
        target: props.page.url,
        timestamp: captureStamp(props.page),
        provider: providerArgument(props.page),
        format: mode.value === "source" ? "raw" : "text",
        maxChars: mode.value === "source" ? SOURCE_CHARS : TEXT_CHARS,
        offset,
        ...props.extra,
      },
    });
  } catch (caught) {
    result.value = undefined;
    error.value = errorText(caught);
  } finally {
    loading.value = false;
  }
}

function setMode(next: ViewMode) {
  if (!modeAvailable(props.page, next)) {
    return;
  }
  mode.value = next;
  emit("update:mode", next);
  void loadBody();
}

function step(delta: -1 | 1) {
  const target = delta < 0 ? previousPage.value : nextPage.value;
  if (target) {
    emit("select", target);
  }
}

/** Copies a citation or the permalink; a blocked clipboard is not an error, the citation sits in the button's title. */
async function copy(kind: "cite" | "link") {
  const text = kind === "cite" ? citation(props.page) : `${window.location.origin}${captureLink(props.page)}`;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = kind;
    setTimeout(() => {
      copied.value = undefined;
    }, 1200);
  } catch {
    return;
  }
}

function onKey(event: KeyboardEvent) {
  if (!props.keyboard) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|SELECT|TEXTAREA)$/u.test(target.tagName)) {
    return;
  }
  if (event.key === "ArrowLeft") {
    step(-1);
  } else if (event.key === "ArrowRight") {
    step(1);
  } else if (event.key === "Escape" && props.closable) {
    emit("close");
  }
}

watch(
  () => props.page,
  (page, previous) => {
    if (previous && pageKey(page) === pageKey(previous)) {
      return;
    }
    if (!modeAvailable(page, mode.value)) {
      mode.value = defaultMode(page);
      emit("update:mode", mode.value);
    }
    void loadBody();
  },
);

watch(
  () => props.mode,
  (next) => {
    if (next && next !== mode.value) {
      setMode(next);
    }
  },
);

onMounted(() => {
  window.addEventListener("keydown", onKey);
  void loadBody();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <ExplorerPanel tag="View" :label="`Capture viewer: ${label}`" :sweep="key" :meta="pages.length > 1 ? `${index + 1} / ${pages.length}` : undefined">
    <template #title>{{ label }}<span class="console-file">{{ shortStamp(page.timestamp) }}</span></template>

    <div class="viewer-controls">
      <UTabs
        :model-value="mode"
        :items="tabItems"
        :content="false"
        variant="link"
        class="viewer-tabs"
        aria-label="View mode"
        @update:model-value="setMode($event as ViewMode)"
      />
      <div class="viewer-actions">
        <template v-if="pages.length > 1">
          <UTooltip :text="previousPage ? `Previous: ${shortStamp(previousPage.timestamp)}` : 'Oldest capture here'">
            <UButton color="neutral" variant="subtle" square icon="i-lucide-chevron-left" aria-label="Previous capture" :disabled="!previousPage" @click="step(-1)" />
          </UTooltip>
          <UTooltip :text="nextPage ? `Next: ${shortStamp(nextPage.timestamp)}` : 'Newest capture here'">
            <UButton color="neutral" variant="subtle" square icon="i-lucide-chevron-right" aria-label="Next capture" :disabled="!nextPage" @click="step(1)" />
          </UTooltip>
        </template>
        <UTooltip :text="saved ? 'Remove from the shelf' : 'Save to the shelf'">
          <UButton
            color="neutral"
            variant="subtle"
            square
            :icon="saved ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
            :aria-label="saved ? 'Remove from the shelf' : 'Save to the shelf'"
            :aria-pressed="saved"
            @click="toggle(page)"
          />
        </UTooltip>
        <UTooltip :text="citation(page)">
          <UButton color="neutral" variant="subtle" square :icon="copied === 'cite' ? 'i-lucide-check' : 'i-lucide-quote'" aria-label="Copy a citation" @click="copy('cite')" />
        </UTooltip>
        <UTooltip text="Permalink of this capture">
          <UButton :to="captureLink(page)" color="neutral" variant="subtle" square icon="i-lucide-link" aria-label="Permalink" />
        </UTooltip>
        <UButton :to="page.snapshot" target="_blank" rel="noopener" color="neutral" variant="subtle" trailing-icon="i-lucide-arrow-up-right" label="open" aria-label="Open the capture in the archive" />
        <UTooltip v-if="closable" text="Close (Esc)">
          <UButton color="neutral" variant="subtle" square icon="i-lucide-x" aria-label="Close viewer" @click="emit('close')" />
        </UTooltip>
      </div>
    </div>

    <div class="viewer-url">
      <span class="console-tag">URL</span>
      <UTooltip :text="page.url">
        <span class="viewer-url-text" tabindex="0">{{ page.url }}</span>
      </UTooltip>
    </div>

    <div v-if="caveat || unavailable.length" class="archives-band viewer-notes">
      <p v-if="caveat" class="archives-note"><span class="console-tag">Note</span>{{ caveat }}</p>
      <p v-for="option in unavailable" :key="option.id" class="archives-note">
        <span class="console-tag">{{ option.label }}</span>{{ option.why }}.
      </p>
    </div>

    <template v-if="mode === 'replay'">
      <iframe
        :key="page.snapshot"
        :src="page.snapshot"
        class="viewer-frame"
        :style="frameStyle"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerpolicy="no-referrer"
        :title="`${label} replay of ${page.url} captured ${shortStamp(page.timestamp)}`"
      />
    </template>

    <template v-else>
      <div v-if="loading" class="archives-band">
        <p class="archives-note">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
          Reading the capture…
        </p>
      </div>
      <div v-else-if="error && throttled" class="archives-band viewer-throttled">
        <p class="archives-error" role="alert">
          <span class="console-tag">429</span>{{ label }} throttles automated readers, so the docs worker can't fetch this capture right now.
        </p>
        <div class="viewer-retry">
          <UButton :to="page.snapshot" target="_blank" rel="noopener" color="neutral" variant="outline" icon="i-lucide-external-link" :label="`Open in ${label}`" />
          <UButton color="neutral" variant="subtle" icon="i-lucide-rotate-cw" label="Try again" @click="loadBody()" />
        </div>
        <details class="viewer-details">
          <summary>what the executor said</summary>
          <pre class="viewer-body viewer-body-error">{{ error }}</pre>
        </details>
      </div>
      <div v-else-if="error" class="archives-band">
        <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ error }}</p>
      </div>
      <template v-else-if="result">
        <p class="viewer-meta">
          <span>captured <span class="archives-value">{{ capture?.timestamp }}</span></span>
          <span>type <span class="archives-value">{{ capture?.mime ?? "?" }}</span></span>
          <span>read <span class="archives-value">{{ formatBytes(capture?.bytes ?? 0) }}</span></span>
          <span v-if="mode === 'text'">slice <span class="archives-value">{{ result.details.offset }}..{{ result.details.endOffset }}</span></span>
          <span v-else-if="result.details.hasMore || capture?.truncated" class="viewer-cut">cut: the page is longer than what was rendered</span>
          <a :href="capture?.snapshot" target="_blank" rel="noopener" class="viewer-source">source ↗</a>
        </p>
        <template v-if="mode === 'source'">
          <iframe
            v-if="sourceDocument"
            :key="`${key}-source`"
            :srcdoc="sourceDocument"
            class="viewer-frame"
            :style="frameStyle"
            sandbox=""
            referrerpolicy="no-referrer"
            :title="`Archived markup of ${page.url} captured ${shortStamp(page.timestamp)}, scripts removed`"
          />
          <pre v-else class="viewer-body">{{ body || "(the capture isn't text; see the source link)" }}</pre>
        </template>
        <template v-else>
          <pre class="viewer-body">{{ body || "(the capture isn't text; see the source link)" }}</pre>
          <div v-if="result.details.hasMore" class="archives-band viewer-next">
            <UButton color="neutral" variant="outline" trailing-icon="i-lucide-chevron-right" label="Next slice" @click="loadBody(result!.details.nextOffset ?? 0)" />
          </div>
        </template>
      </template>
    </template>

    <template #footer>
      <span v-if="mode === 'replay'">Played back by the archive itself, in its own frame. Links inside stay in the archive.</span>
      <span v-else-if="mode === 'source'">The archived bytes, drawn without scripts. Only images, styles and fonts from the archive's host load.</span>
      <span v-else>The archived body as text, read through the executor the MCP server runs.</span>
    </template>
  </ExplorerPanel>
</template>

<style scoped>
.viewer-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 4px 20px 0;
}
.viewer-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.viewer-url {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  padding: 12px 20px;
  font-family: var(--font-mono);
  font-size: 12px;
  border-bottom: 1px solid var(--console-line);
}
.viewer-url > .console-tag {
  flex: none;
  margin: 0;
}
.viewer-url-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.viewer-notes {
  display: grid;
  gap: 6px;
  padding-block: 12px;
  border-bottom: 1px solid var(--console-line);
}
.viewer-notes > .archives-note > .console-tag {
  flex: none;
  margin: 0;
}
.viewer-frame {
  display: block;
  width: 100%;
  height: min(70dvh, 44rem);
  border: 0;
  background: #fff;
}
.viewer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 10px 20px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ui-text-dimmed);
  border-bottom: 1px solid var(--console-line);
}
.viewer-cut {
  color: var(--archives-del);
}
.viewer-source {
  color: var(--ui-text-muted);
}
.viewer-source:hover {
  color: var(--console-accent);
}
/* Archived text: interpolated into a pre, never rendered as markup; it scrolls inside, never the page. */
.viewer-body {
  max-height: min(60dvh, 36rem);
  margin: 0;
  padding: 16px 20px;
  overflow: auto;
  overscroll-behavior: contain;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--ui-text-muted);
}
.viewer-body-error {
  padding: 8px 0 0;
  color: var(--archives-del);
}
.viewer-throttled {
  display: grid;
  gap: 14px;
}
.viewer-retry {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.viewer-details > summary {
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ui-text-dimmed);
}
.viewer-next {
  border-top: 1px solid var(--console-line);
}
@media (width < 640px) {
  .viewer-controls,
  .viewer-url,
  .viewer-meta {
    padding-inline: 14px;
  }
  .viewer-tabs :deep([data-slot="leadingIcon"]) {
    display: none;
  }
}
</style>
