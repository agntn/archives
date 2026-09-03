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
  <div class="archives-frame overflow-hidden rounded-xl">
    <div class="archives-viewer-bar">
      <span class="inline-flex items-center gap-2">
        <UIcon :name="providerInfo(providerArgument(page))?.icon ?? 'i-lucide-archive'" class="size-4 text-primary" />
        <span class="text-sm font-medium text-highlighted">{{ label }}</span>
      </span>
      <span class="font-mono text-xs text-highlighted">{{ shortStamp(page.timestamp) }}</span>
      <span class="archives-viewer-url" :title="page.url">{{ page.url }}</span>
      <span v-if="pages.length > 1" class="inline-flex items-center gap-1">
        <button type="button" class="archives-btn h-7 px-2" :disabled="!previousPage" :title="previousPage ? `Previous: ${shortStamp(previousPage.timestamp)}` : 'Oldest capture here'" aria-label="Previous capture" @click="step(-1)">
          <UIcon name="i-lucide-chevron-left" class="size-4" />
        </button>
        <span class="font-mono text-[11px] text-dimmed">{{ index + 1 }} / {{ pages.length }}</span>
        <button type="button" class="archives-btn h-7 px-2" :disabled="!nextPage" :title="nextPage ? `Next: ${shortStamp(nextPage.timestamp)}` : 'Newest capture here'" aria-label="Next capture" @click="step(1)">
          <UIcon name="i-lucide-chevron-right" class="size-4" />
        </button>
      </span>
      <span class="archives-segmented" role="tablist" aria-label="View mode">
        <button
          v-for="option in modes"
          :key="option.id"
          type="button"
          role="tab"
          class="archives-segment inline-flex items-center gap-1.5"
          :class="{ 'archives-segment-active': mode === option.id }"
          :aria-selected="mode === option.id"
          :disabled="!option.enabled"
          :title="option.enabled ? undefined : option.why"
          @click="setMode(option.id)"
        >
          <UIcon :name="option.icon" class="size-3.5" />
          {{ option.label }}
        </button>
      </span>
      <span class="inline-flex items-center gap-1">
        <button type="button" class="archives-btn h-7 px-2" :class="{ 'text-primary': saved }" :title="saved ? 'Remove from the shelf' : 'Save to the shelf'" :aria-pressed="saved" @click="toggle(page)">
          <UIcon :name="saved ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'" class="size-3.5" />
        </button>
        <button type="button" class="archives-btn h-7 px-2" :title="citation(page)" aria-label="Copy a citation" @click="copy('cite')">
          <UIcon :name="copied === 'cite' ? 'i-lucide-check' : 'i-lucide-quote'" class="size-3.5" />
        </button>
        <NuxtLink :to="captureLink(page)" class="archives-btn h-7 px-2" title="Permalink of this capture" aria-label="Permalink">
          <UIcon name="i-lucide-link" class="size-3.5" />
        </NuxtLink>
        <a :href="page.snapshot" target="_blank" rel="noopener" class="archives-btn h-7 px-2 text-xs" title="Open the capture in the archive">
          <UIcon name="i-lucide-external-link" class="size-3.5" />
          Open
        </a>
        <button v-if="closable" type="button" class="archives-btn h-7 px-2" aria-label="Close viewer" title="Close (Esc)" @click="emit('close')">
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </span>
    </div>

    <p v-if="caveat" class="flex items-start gap-2 border-b border-muted px-4 py-2 text-xs text-muted">
      <UIcon name="i-lucide-shield-alert" class="mt-0.5 size-3.5 shrink-0 text-primary" />
      <span>{{ caveat }}</span>
    </p>

    <template v-if="mode === 'replay'">
      <iframe
        :key="page.snapshot"
        :src="page.snapshot"
        class="archives-viewer-frame"
        :style="frameStyle"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerpolicy="no-referrer"
        :title="`${label} replay of ${page.url} captured ${shortStamp(page.timestamp)}`"
      />
      <p class="border-t border-muted px-4 py-2 font-mono text-[11px] text-dimmed">
        Played back by the archive itself, in its own frame. Links inside stay in the archive.
      </p>
    </template>

    <template v-else>
      <p v-if="loading" class="flex items-center gap-2 px-5 py-4 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Reading the capture…
      </p>
      <div v-else-if="error && throttled" class="px-5 py-5">
        <p class="flex items-start gap-2 text-sm text-highlighted">
          <UIcon name="i-lucide-shield-alert" class="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            {{ label }} answered <span class="font-mono">429 Too Many Requests</span>.
            It throttles automated readers, so the docs worker cannot fetch this capture right now.
          </span>
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <a :href="page.snapshot" target="_blank" rel="noopener" class="archives-btn">
            <UIcon name="i-lucide-external-link" class="size-4" />
            Open the capture in {{ label }}
          </a>
          <button type="button" class="archives-btn" @click="loadBody()">Try again</button>
        </div>
        <details class="mt-4">
          <summary class="cursor-pointer font-mono text-[11px] text-dimmed">what the executor said</summary>
          <pre class="archives-body px-0" :style="{ color: 'var(--archives-del)' }">{{ error }}</pre>
        </details>
      </div>
      <pre v-else-if="error" class="archives-body" :style="{ color: 'var(--archives-del)' }">{{ error }}</pre>
      <template v-else-if="result">
        <div class="flex flex-wrap gap-x-4 gap-y-1 border-b border-muted px-5 py-2.5 font-mono text-[11px] text-dimmed">
          <span>captured <span class="text-muted">{{ capture?.timestamp }}</span></span>
          <span>type <span class="text-muted">{{ capture?.mime ?? "?" }}</span></span>
          <span>read <span class="text-muted">{{ formatBytes(capture?.bytes ?? 0) }}</span></span>
          <span v-if="mode === 'text'">slice <span class="text-muted">{{ result.details.offset }}..{{ result.details.endOffset }}</span></span>
          <span v-else-if="result.details.hasMore || capture?.truncated" :style="{ color: 'var(--archives-del)' }">truncated: the page is longer than what was rendered</span>
          <a :href="capture?.snapshot" target="_blank" rel="noopener" class="text-primary hover:underline">source</a>
        </div>
        <template v-if="mode === 'source'">
          <iframe
            v-if="sourceDocument"
            :key="`${key}-source`"
            :srcdoc="sourceDocument"
            class="archives-viewer-frame"
            :style="frameStyle"
            sandbox=""
            referrerpolicy="no-referrer"
            :title="`Archived markup of ${page.url} captured ${shortStamp(page.timestamp)}, scripts removed`"
          />
          <pre v-else class="archives-body">{{ body || "(the capture is not text; see the source link)" }}</pre>
          <p class="border-t border-muted px-4 py-2 font-mono text-[11px] text-dimmed">
            The archived bytes, drawn without scripts. Only images, styles and fonts from the archive's own host are allowed to load.
          </p>
        </template>
        <template v-else>
          <pre class="archives-body">{{ body || "(the capture is not text; see the source link)" }}</pre>
          <div v-if="result.details.hasMore" class="border-t border-muted px-5 py-3">
            <button type="button" class="archives-btn" @click="loadBody(result!.details.nextOffset ?? 0)">
              Next slice
              <UIcon name="i-lucide-chevron-right" class="size-4" />
            </button>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
