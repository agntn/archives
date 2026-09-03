<script setup lang="ts">
import type { EvidenceRelation } from "../composables/useEvidenceRoom";
import {
  EVIDENCE_LIMITS,
  EVIDENCE_PROVIDER_SLUGS,
  type EvidenceProvider as ContentProvider,
} from "../utils/webmcp";
import { providerLabel } from "../utils/providers";

const room = useEvidenceRoom();
const { state, webmcp } = room;
const target = ref("");
const question = ref("");
const from = ref("");
const to = ref("");
const focus = ref("");
const relation = ref<EvidenceRelation>("supports");
const finding = ref("");
const selectedProvider = ref<ContentProvider>();
const copied = ref(false);
const inspectingId = ref<string>();
const manualController = shallowRef<AbortController>();

const busy = computed(() => state.value.activity.some((entry) => entry.state === "running"));
const latestError = computed(() => {
  const latest = state.value.activity[0];
  return latest?.state === "error" ? latest.note : undefined;
});
const inspectedWindow = computed(() =>
  state.value.windows.find((window) => window.id === state.value.inspection?.changeId),
);
const targetHref = computed(() => {
  const value = state.value.archiveCase?.target;
  if (!value) return undefined;
  return new URL(value.includes("://") ? value : `https://${value}`).href;
});
const currentStep = computed(() => {
  if (state.value.findings.length) return 4;
  if (state.value.inspection) return 3;
  if (state.value.windows.length) return 2;
  if (state.value.archiveCase) return 1;
  return 0;
});
const providerCatalog: ReadonlyArray<{ label: string; value: ContentProvider }> =
  EVIDENCE_PROVIDER_SLUGS.map((value) => ({ label: providerLabel(value), value }));
const providerItems = computed(() => {
  const available = new Set(
    state.value.archiveCase?.coverage
      .filter((item) => item.state === "ok")
      .map((item) => item.provider) ?? [],
  );
  return providerCatalog.filter((provider) => available.has(provider.value));
});
const relationItems = [
  { label: "Supports the question", value: "supports" },
  { label: "Contradicts the question", value: "contradicts" },
  { label: "Adds context", value: "context" },
];

watch(
  () => state.value.archiveCase?.id,
  () => {
    selectedProvider.value = state.value.archiveCase?.recommendedProvider;
  },
  { immediate: true },
);

useSeoMeta({
  title: "Archive Evidence Room",
  description:
    "A shared WebMCP workspace where browser agents and people investigate historical changes together.",
});

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function runManual<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  manualController.value?.abort(
    new DOMException("Superseded by another manual action", "AbortError"),
  );
  const controller = new AbortController();
  manualController.value = controller;
  try {
    return await operation(controller.signal);
  } finally {
    if (manualController.value === controller) manualController.value = undefined;
  }
}

function cancelManual() {
  manualController.value?.abort(new DOMException("Cancelled by the user", "AbortError"));
  manualController.value = undefined;
}

function resetCase() {
  cancelManual();
  room.reset();
}

onBeforeUnmount(cancelManual);

async function createCase() {
  await runManual((signal) =>
    room.scopeCase(
      {
        target: target.value,
        question: question.value,
        from: from.value || undefined,
        to: to.value || undefined,
      },
      signal,
    ),
  );
}

async function discoverChanges() {
  const archiveCase = state.value.archiveCase;
  if (!archiveCase) return;
  await runManual((signal) =>
    room.findChanges(
      {
        caseId: archiveCase.id,
        provider: selectedProvider.value,
        maxCaptures: EVIDENCE_LIMITS.defaultCaptures,
      },
      signal,
    ),
  );
}

async function inspect(changeId: string) {
  const archiveCase = state.value.archiveCase;
  if (!archiveCase) return;
  inspectingId.value = changeId;
  try {
    await runManual((signal) =>
      room.inspectChange(
        { caseId: archiveCase.id, changeId, focus: focus.value || undefined },
        signal,
      ),
    );
  } finally {
    if (inspectingId.value === changeId) inspectingId.value = undefined;
  }
}

async function pin() {
  const archiveCase = state.value.archiveCase;
  const inspection = state.value.inspection;
  if (!archiveCase || !inspection) return;
  const result = await room.pinFinding({
    caseId: archiveCase.id,
    changeId: inspection.changeId,
    relation: relation.value,
    finding: finding.value,
  });
  if (typeof result === "object" && result !== null && "ok" in result && result.ok === true) {
    finding.value = "";
  }
}

async function copyCase() {
  try {
    await navigator.clipboard.writeText(room.exportMarkdown());
  } catch {
    return;
  }
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1600);
}

function downloadCase() {
  const blob = new Blob([room.exportMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.value.archiveCase?.id ?? "archive-evidence"}.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
</script>

<template>
  <main class="evidence-room min-h-screen">
    <div class="evidence-grid pointer-events-none fixed inset-0 opacity-40" />
    <UContainer class="relative py-8 sm:py-12">
      <header class="mb-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <NuxtLink
            to="/"
            class="mb-5 inline-flex items-center gap-2 text-sm text-[var(--ui-text-muted)] transition hover:text-[var(--ui-text)]"
          >
            <UIcon name="i-lucide-arrow-left" class="size-4" />
            Archives
          </NuxtLink>
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <span class="signal-dot" :class="`is-${webmcp.availability}`" />
            <span class="font-mono text-xs uppercase tracking-[0.22em] text-[var(--ui-text-muted)]"
              >WebMCP field lab</span
            >
            <UBadge color="neutral" variant="subtle" size="sm">Experimental</UBadge>
          </div>
          <h1
            class="max-w-4xl text-4xl font-semibold tracking-tight text-[var(--ui-text-highlighted)] sm:text-6xl"
          >
            Archive Evidence <span class="evidence-accent">Room</span>
          </h1>
          <p class="mt-5 max-w-2xl text-base leading-7 text-[var(--ui-text-muted)] sm:text-lg">
            One caseboard for you and your browser agent. Find when a page changed, inspect the
            archived record, then pin only what the evidence supports.
          </p>
        </div>

        <div class="status-console max-w-md rounded-2xl p-4">
          <div class="flex items-start gap-3">
            <div class="mt-0.5 rounded-lg bg-[var(--ui-bg-accented)] p-2">
              <UIcon name="i-lucide-bot" class="size-5 text-[var(--ui-primary)]" />
            </div>
            <div>
              <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">
                {{
                  webmcp.availability === "ready"
                    ? "Agent connected"
                    : webmcp.availability === "unavailable"
                      ? "Manual mode"
                      : "WebMCP status"
                }}
              </p>
              <p class="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{{ webmcp.message }}</p>
              <UButton
                v-if="manualController"
                class="mt-3"
                color="neutral"
                variant="soft"
                size="xs"
                icon="i-lucide-circle-stop"
                @click="cancelManual"
              >
                Cancel manual request
              </UButton>
            </div>
          </div>
        </div>
      </header>

      <ExplorerNav />

      <nav
        class="workflow-rail mt-7 mb-8 overflow-x-auto rounded-2xl p-2"
        aria-label="Investigation workflow"
      >
        <ol class="grid min-w-[680px] grid-cols-4 gap-2">
          <li
            v-for="(step, index) in ['Scope case', 'Find windows', 'Inspect change', 'Pin finding']"
            :key="step"
            class="step-chip"
            :class="{ 'is-complete': currentStep > index, 'is-active': currentStep === index }"
          >
            <span class="step-number">{{ currentStep > index ? "✓" : index + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>
      </nav>

      <p
        v-if="latestError && !busy"
        role="alert"
        class="mb-6 rounded-xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-600 dark:text-rose-300"
      >
        {{ latestError }}
      </p>

      <section v-if="!state.archiveCase" class="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <form class="case-panel rounded-3xl p-6 sm:p-8" @submit.prevent="createCase">
          <div class="mb-7 flex items-start justify-between gap-4">
            <div>
              <p class="eyebrow">01 / Brief the investigation</p>
              <h2 class="mt-2 text-2xl font-semibold text-[var(--ui-text-highlighted)]">
                What are we trying to prove?
              </h2>
            </div>
            <UIcon name="i-lucide-crosshair" class="size-7 text-[var(--ui-primary)]" />
          </div>
          <div class="grid gap-5">
            <UFormField label="Page URL or domain" required>
              <UInput
                v-model="target"
                size="xl"
                :maxlength="EVIDENCE_LIMITS.target"
                placeholder="example.com/about"
                icon="i-lucide-globe-2"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Historical question" required hint="Keep it falsifiable">
              <UTextarea
                v-model="question"
                :rows="3"
                :maxlength="EVIDENCE_LIMITS.question"
                autoresize
                placeholder="When did the organization first commit to net zero?"
                class="w-full"
              />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="From" hint="Optional">
                <UInput
                  v-model="from"
                  :maxlength="EVIDENCE_LIMITS.date"
                  placeholder="2018"
                  icon="i-lucide-calendar"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="To" hint="Optional">
                <UInput
                  v-model="to"
                  :maxlength="EVIDENCE_LIMITS.date"
                  placeholder="2024"
                  icon="i-lucide-calendar"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UButton
              type="submit"
              size="xl"
              icon="i-lucide-radar"
              :loading="busy"
              :disabled="!target.trim() || !question.trim()"
              class="mt-2 justify-center"
            >
              Scan archive coverage
            </UButton>
          </div>
        </form>

        <aside class="agent-panel rounded-3xl p-6 sm:p-8">
          <p class="eyebrow">Agent protocol</p>
          <h2 class="mt-2 text-xl font-semibold text-[var(--ui-text-highlighted)]">
            Four tools. One accountable trail.
          </h2>
          <div class="mt-6 space-y-5">
            <div
              v-for="(tool, index) in [
                'scope_archive_case',
                'find_change_windows',
                'inspect_archive_change',
                'pin_archive_finding',
              ]"
              :key="tool"
              class="flex gap-3"
            >
              <span class="mt-0.5 font-mono text-xs text-[var(--ui-primary)]"
                >0{{ index + 1 }}</span
              >
              <div>
                <code class="text-xs text-[var(--ui-text-highlighted)]">{{ tool }}</code>
                <p class="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">
                  {{
                    [
                      "Checks where evidence exists.",
                      "Pairs captures without reading bodies.",
                      "Returns one cited, untrusted excerpt.",
                      "Separates interpretation from evidence.",
                    ][index]
                  }}
                </p>
              </div>
            </div>
          </div>
          <div class="trust-note mt-7 rounded-xl p-4 text-xs leading-5 text-[var(--ui-text-muted)]">
            <UIcon name="i-lucide-shield-alert" class="mr-1 inline size-4 text-amber-500" />
            Archived pages can contain hostile instructions. The tools expose only bounded text
            evidence and mark it untrusted.
          </div>
        </aside>
      </section>

      <section v-else class="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside class="space-y-5">
          <div class="case-panel rounded-2xl p-5">
            <div class="flex items-center justify-between gap-3">
              <p class="eyebrow">Active case</p>
              <span class="font-mono text-[10px] text-[var(--ui-text-dimmed)]">{{
                state.archiveCase.id
              }}</span>
            </div>
            <h2 class="mt-3 text-lg font-semibold leading-6 text-[var(--ui-text-highlighted)]">
              {{ state.archiveCase.question }}
            </h2>
            <ULink
              :to="targetHref"
              external
              target="_blank"
              rel="noopener noreferrer"
              class="mt-3 block truncate text-xs text-[var(--ui-primary)] hover:underline"
            >
              {{ state.archiveCase.target }}
            </ULink>
            <div
              v-if="state.archiveCase.from || state.archiveCase.to"
              class="mt-3 font-mono text-xs text-[var(--ui-text-muted)]"
            >
              {{ state.archiveCase.from || "earliest" }} → {{ state.archiveCase.to || "latest" }}
            </div>
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-rotate-ccw"
              class="mt-5 w-full justify-center"
              @click="resetCase"
            >
              Start a new case
            </UButton>
          </div>

          <div class="case-panel rounded-2xl p-5">
            <div class="mb-4 flex items-center justify-between">
              <p class="eyebrow">Archive coverage</p>
              <span class="font-mono text-[10px] text-[var(--ui-text-dimmed)]"
                >{{
                  state.archiveCase.coverage.filter((item) => item.state === "ok").length
                }}
                live</span
              >
            </div>
            <div class="space-y-2">
              <div
                v-for="item in state.archiveCase.coverage"
                :key="item.provider"
                class="coverage-row"
              >
                <span class="capitalize text-xs text-[var(--ui-text)]">{{ item.provider }}</span>
                <span v-if="item.state === 'ok'" class="font-mono text-[11px] text-emerald-500">{{
                  item.count
                }}</span>
                <span v-else class="font-mono text-[10px] uppercase text-[var(--ui-text-dimmed)]">{{
                  item.state
                }}</span>
              </div>
            </div>
            <p class="mt-4 text-[11px] leading-4 text-[var(--ui-text-dimmed)]">
              Coverage is broad. Your date bounds apply to the selected change scan.
            </p>
            <UFormField v-if="providerItems.length" label="Archive to compare" class="mt-4">
              <USelect
                v-model="selectedProvider"
                :items="providerItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UButton
              v-if="providerItems.length"
              size="md"
              icon="i-lucide-git-compare-arrows"
              :loading="busy"
              :disabled="!selectedProvider"
              class="mt-4 w-full justify-center"
              @click="discoverChanges"
            >
              {{ state.windows.length ? "Scan selected archive" : "Find candidate windows" }}
            </UButton>
          </div>

          <div v-if="state.activity.length" class="case-panel rounded-2xl p-5">
            <p class="eyebrow mb-4">Live trace</p>
            <div class="space-y-4">
              <div v-for="entry in state.activity.slice(0, 5)" :key="entry.id" class="activity-row">
                <span class="activity-state" :class="`is-${entry.state}`" />
                <div class="min-w-0">
                  <p class="truncate font-mono text-[10px] text-[var(--ui-text)]">
                    {{ entry.tool }}
                  </p>
                  <p class="mt-1 text-[11px] leading-4 text-[var(--ui-text-dimmed)]">
                    {{ entry.note }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div class="space-y-6">
          <section v-if="state.windows.length" class="case-panel rounded-3xl p-6 sm:p-8">
            <div class="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p class="eyebrow">02 / Candidate windows</p>
                <h2 class="mt-2 text-2xl font-semibold text-[var(--ui-text-highlighted)]">
                  Capture pairs with intact provenance
                </h2>
              </div>
              <UInput
                v-model="focus"
                :maxlength="EVIDENCE_LIMITS.focus"
                placeholder="Focus phrase, e.g. net zero"
                icon="i-lucide-scan-search"
                class="w-full sm:w-64"
              />
            </div>
            <div class="mt-6 grid gap-3">
              <article
                v-for="(window, index) in state.windows"
                :key="window.id"
                class="change-row"
                :class="{ 'is-selected': state.inspection?.changeId === window.id }"
              >
                <div class="rank">{{ String(index + 1).padStart(2, "0") }}</div>
                <div class="min-w-0 flex-1">
                  <div
                    class="flex flex-wrap items-center gap-2 text-sm text-[var(--ui-text-highlighted)]"
                  >
                    <span>{{ dateLabel(window.before.timestamp) }}</span>
                    <UIcon
                      name="i-lucide-arrow-right"
                      class="size-3.5 text-[var(--ui-text-dimmed)]"
                    />
                    <span>{{ dateLabel(window.after.timestamp) }}</span>
                    <UBadge v-if="window.partial" color="warning" variant="subtle" size="sm"
                      >partial</UBadge
                    >
                  </div>
                  <p class="mt-1 break-all font-mono text-[11px] text-[var(--ui-text-dimmed)]">
                    {{ window.before.url }}
                  </p>
                  <p class="mt-2 font-mono text-xs">
                    <template
                      v-if="window.additions !== undefined && window.deletions !== undefined"
                    >
                      <span class="text-emerald-500">+{{ window.additions }}</span>
                      <span class="ml-3 text-rose-500">−{{ window.deletions }}</span>
                    </template>
                    <span v-else class="text-[var(--ui-text-dimmed)]">
                      {{
                        window.digestChanged
                          ? "index digest changed"
                          : "index fingerprint unavailable"
                      }}
                      · {{ window.spanDays }} day span
                      <template v-if="window.byteDelta !== undefined">
                        · {{ window.byteDelta > 0 ? "+" : "" }}{{ window.byteDelta }} B</template
                      >
                    </span>
                    <span class="ml-3 text-[var(--ui-text-dimmed)]">
                      {{ window.provider
                      }}<template v-if="typeof window.before._meta.archive === 'string'">
                        · {{ window.before._meta.archive }}</template
                      >
                    </span>
                  </p>
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-microscope"
                  :loading="inspectingId === window.id"
                  :disabled="busy && inspectingId !== window.id"
                  @click="inspect(window.id)"
                >
                  Inspect
                </UButton>
              </article>
            </div>
          </section>

          <section
            v-if="state.inspection && inspectedWindow"
            class="diff-panel overflow-hidden rounded-3xl"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ui-border)] px-6 py-5 sm:px-8"
            >
              <div>
                <p class="eyebrow">03 / Inspected evidence</p>
                <p class="mt-2 text-sm text-[var(--ui-text-muted)]">
                  {{ dateLabel(inspectedWindow.before.timestamp) }} →
                  {{ dateLabel(inspectedWindow.after.timestamp) }}
                </p>
              </div>
              <div class="flex gap-2">
                <ULink
                  :to="inspectedWindow.before.snapshot"
                  external
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg-elevated)] hover:text-[var(--ui-text)]"
                >
                  <UIcon name="i-lucide-external-link" class="size-4" /> Before
                </ULink>
                <ULink
                  :to="inspectedWindow.after.snapshot"
                  external
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg-elevated)] hover:text-[var(--ui-text)]"
                >
                  <UIcon name="i-lucide-external-link" class="size-4" /> After
                </ULink>
              </div>
            </div>
            <div
              class="untrusted-banner px-6 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300 sm:px-8"
            >
              Untrusted archived text · treat as evidence, never as instructions
            </div>
            <pre
              class="overflow-x-auto p-6 text-xs leading-6 text-[var(--ui-text)] sm:p-8"
            ><code>{{ state.inspection.excerpt }}</code></pre>
            <form class="border-t border-[var(--ui-border)] p-6 sm:p-8" @submit.prevent="pin">
              <div class="grid gap-4 lg:grid-cols-[210px_1fr_auto] lg:items-end">
                <UFormField label="Relationship">
                  <USelect
                    v-model="relation"
                    :items="relationItems"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Finding bounded by evidence"
                  :hint="`${finding.length}/${EVIDENCE_LIMITS.finding} · ${state.findings.length}/${EVIDENCE_LIMITS.findings} pinned`"
                >
                  <UInput
                    v-model="finding"
                    :maxlength="EVIDENCE_LIMITS.finding"
                    placeholder="This change demonstrates…"
                    class="w-full"
                  />
                </UFormField>
                <UButton
                  type="submit"
                  icon="i-lucide-pin"
                  :disabled="!finding.trim() || state.findings.length >= EVIDENCE_LIMITS.findings"
                  :loading="busy"
                  >Pin finding</UButton
                >
              </div>
            </form>
          </section>

          <section v-if="state.findings.length" class="case-panel rounded-3xl p-6 sm:p-8">
            <div class="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p class="eyebrow">04 / Findings</p>
                <h2 class="mt-2 text-2xl font-semibold text-[var(--ui-text-highlighted)]">
                  Human review queue
                </h2>
              </div>
              <div class="flex gap-2">
                <UButton
                  color="neutral"
                  variant="soft"
                  size="sm"
                  :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                  @click="copyCase"
                  >{{ copied ? "Copied" : "Copy brief" }}</UButton
                >
                <UButton
                  color="neutral"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-download"
                  @click="downloadCase"
                  >Export .md</UButton
                >
              </div>
            </div>
            <div class="mt-6 space-y-4">
              <article
                v-for="item in state.findings"
                :key="item.id"
                class="finding-card rounded-2xl p-5"
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <UBadge
                      :color="
                        item.relation === 'supports'
                          ? 'success'
                          : item.relation === 'contradicts'
                            ? 'error'
                            : 'neutral'
                      "
                      variant="subtle"
                      size="sm"
                      class="capitalize"
                      >{{ item.relation }}</UBadge
                    >
                    <p class="mt-3 text-sm leading-6 text-[var(--ui-text-highlighted)]">
                      {{ item.finding }}
                    </p>
                  </div>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-x"
                    aria-label="Remove finding"
                    @click="room.removeFinding(item.id)"
                  />
                </div>
                <div
                  class="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--ui-border)] pt-4 font-mono text-[10px] text-[var(--ui-text-dimmed)]"
                >
                  <ULink
                    :to="item.change.before.snapshot"
                    external
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hover:text-[var(--ui-primary)]"
                    >before {{ item.change.before.timestamp }}</ULink
                  >
                  <ULink
                    :to="item.change.after.snapshot"
                    external
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hover:text-[var(--ui-primary)]"
                    >after {{ item.change.after.timestamp }}</ULink
                  >
                  <span v-if="typeof item.change.before._meta.archive === 'string'"
                    >underlying archive {{ item.change.before._meta.archive }}</span
                  >
                </div>
              </article>
            </div>
          </section>

          <section
            v-if="!state.windows.length"
            class="empty-stage rounded-3xl p-10 text-center sm:p-16"
          >
            <div
              class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--ui-bg-accented)]"
            >
              <UIcon name="i-lucide-git-compare-arrows" class="size-7 text-[var(--ui-primary)]" />
            </div>
            <h2 class="mt-5 text-xl font-semibold text-[var(--ui-text-highlighted)]">
              The case is scoped
            </h2>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ui-text-muted)]">
              Ask the agent to continue, or run the next bounded step from the coverage panel. The
              board will update for both of you.
            </p>
          </section>
        </div>
      </section>
    </UContainer>
  </main>
</template>

<style scoped>
.evidence-room {
  --room-line: color-mix(in srgb, var(--ui-border) 78%, transparent);
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 10% 0%,
      color-mix(in srgb, var(--ui-primary) 12%, transparent),
      transparent 34rem
    ),
    radial-gradient(circle at 90% 28%, rgba(245, 158, 11, 0.08), transparent 30rem), var(--ui-bg);
}
.evidence-grid {
  background-image:
    linear-gradient(var(--room-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--room-line) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: linear-gradient(to bottom, black, transparent 72%);
}
.evidence-accent {
  color: var(--ui-primary);
}
.status-console,
.case-panel,
.workflow-rail,
.agent-panel,
.empty-stage,
.diff-panel {
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-bg) 88%, transparent);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(18px);
}
.agent-panel {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--ui-primary) 9%, var(--ui-bg)),
    color-mix(in srgb, var(--ui-bg) 94%, transparent)
  );
}
.signal-dot,
.activity-state {
  display: inline-block;
  flex: none;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--ui-text-dimmed);
}
.signal-dot.is-ready,
.activity-state.is-done {
  background: #10b981;
  box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.1);
}
.signal-dot.is-checking,
.activity-state.is-running {
  background: #f59e0b;
  box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.1);
  animation: pulse 1.6s infinite;
}
.signal-dot.is-error,
.activity-state.is-error {
  background: #f43f5e;
  box-shadow: 0 0 0 5px rgba(244, 63, 94, 0.1);
}
.step-chip {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  border-radius: 0.75rem;
  padding: 0.75rem 0.9rem;
  color: var(--ui-text-dimmed);
  font-size: 0.75rem;
}
.step-chip.is-active {
  background: var(--ui-bg-accented);
  color: var(--ui-text-highlighted);
}
.step-chip.is-complete {
  color: var(--ui-primary);
}
.step-number {
  display: grid;
  width: 1.6rem;
  height: 1.6rem;
  place-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  font-family: monospace;
  font-size: 0.65rem;
}
.is-active .step-number,
.is-complete .step-number {
  border-color: color-mix(in srgb, var(--ui-primary) 55%, transparent);
  background: color-mix(in srgb, var(--ui-primary) 12%, transparent);
}
.eyebrow {
  font-family: monospace;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.17em;
  text-transform: uppercase;
  color: var(--ui-primary);
}
.trust-note,
.finding-card {
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-bg-muted) 75%, transparent);
}
.coverage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--ui-border);
  padding: 0.55rem 0;
}
.coverage-row:last-child {
  border-bottom: 0;
}
.activity-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
}
.activity-state {
  margin-top: 0.2rem;
  width: 0.42rem;
  height: 0.42rem;
}
.change-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 1rem;
  padding: 1rem;
  transition:
    border-color 160ms ease,
    transform 160ms ease,
    background 160ms ease;
}
.change-row:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ui-primary) 35%, var(--ui-border));
}
.change-row.is-selected {
  border-color: color-mix(in srgb, var(--ui-primary) 55%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 5%, transparent);
}
.rank {
  font-family: monospace;
  font-size: 0.68rem;
  color: var(--ui-text-dimmed);
}
.diff-panel {
  background: color-mix(in srgb, var(--ui-bg) 94%, transparent);
}
.diff-panel pre {
  max-height: 31rem;
  background: color-mix(in srgb, var(--ui-bg-elevated) 55%, transparent);
}
.untrusted-banner {
  border-bottom: 1px solid color-mix(in srgb, #f59e0b 24%, var(--ui-border));
  background: rgba(245, 158, 11, 0.08);
}
.empty-stage {
  border-style: dashed;
}
@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .signal-dot,
  .activity-state {
    animation: none !important;
  }
  .change-row {
    transition: none;
  }
}
</style>
