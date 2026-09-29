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
/** The four steps of a case in the order the tools run, each with the tool behind it. */
const STEPS = [
  { label: "Scope", tool: "scope_archive_case", note: "Checks which archives have captures." },
  { label: "Find", tool: "find_change_windows", note: "Pairs captures without reading archived pages." },
  { label: "Inspect", tool: "inspect_archive_change", note: "Shows one cited excerpt and marks it untrusted." },
  { label: "Pin", tool: "pin_archive_finding", note: "Keeps your finding separate from the evidence." },
] as const;

type BadgeColor = "neutral" | "error";
type BadgeVariant = "subtle" | "outline";

/** How a finding reads: support bright, a contradiction red, context quiet. */
const RELATION: Record<EvidenceRelation, { color: BadgeColor; variant: BadgeVariant }> = {
  supports: { color: "neutral", variant: "subtle" },
  contradicts: { color: "error", variant: "outline" },
  context: { color: "neutral", variant: "outline" },
};

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
  <div class="archives-landing not-prose">
    <ToolHero
      eyebrow="evidence room"
      title="Archive Evidence"
      accent="Room."
      description="One caseboard for you and your browser agent. Find when a page changed, inspect the archived record, then pin only what the evidence supports."
      circuit="case"
    >
      <p class="room-status">
        <span class="console-tag" :data-state="webmcp.availability">{{
          webmcp.availability === "ready" ? "Agent" : webmcp.availability === "unavailable" ? "Manual" : "WebMCP"
        }}</span>
        <span>{{ webmcp.message }}</span>
        <UButton
          v-if="manualController"
          color="neutral"
          variant="subtle"
          icon="i-lucide-circle-stop"
          label="cancel"
          @click="cancelManual"
        />
      </p>

      <template #instrument>
        <div class="room-stack">
          <ExplorerPanel tag="Log" title="case" label="Investigation workflow" :busy="busy" :meta="state.archiveCase?.id ?? 'no case yet'">
            <ol class="room-steps" aria-label="Investigation workflow">
              <li
                v-for="(step, index) in STEPS"
                :key="step.tool"
                :data-state="currentStep > index ? 'done' : currentStep === index ? 'active' : 'waiting'"
              >
                <span class="room-step-node" aria-hidden="true" />
                <span class="room-step-label">{{ String(index + 1).padStart(2, "0") }} {{ step.label }}</span>
                <code>{{ step.tool }}</code>
              </li>
            </ol>
            <div v-if="latestError && !busy" class="archives-band">
              <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ latestError }}</p>
            </div>
          </ExplorerPanel>

          <template v-if="!state.archiveCase">
            <ExplorerPanel as="form" tag="Call" label="Define the question" :busy="busy" meta="01 / 04" @submit.prevent="createCase">
              <template #title>scope_archive_case(<span class="tok-str">"{{ target || "example.com/about" }}"</span>)</template>
              <div class="archives-band room-form">
                <div class="console-readout">
                  <dl class="console-readout-rows">
                    <div>
                      <dt><label for="room-target">Page</label></dt>
                      <dd>
                        <UInput id="room-target" v-model="target" variant="none" :maxlength="EVIDENCE_LIMITS.target" placeholder="example.com/about" autocomplete="off" spellcheck="false" class="w-full" />
                      </dd>
                    </div>
                    <div>
                      <dt><label for="room-question">Question</label></dt>
                      <dd>
                        <UTextarea
                          id="room-question"
                          v-model="question"
                          variant="none"
                          :rows="2"
                          autoresize
                          :maxlength="EVIDENCE_LIMITS.question"
                          placeholder="When did the organization first commit to net zero?"
                          class="w-full"
                        />
                      </dd>
                    </div>
                    <div>
                      <dt><label for="room-from">Window</label></dt>
                      <dd class="room-pair">
                        <UInput id="room-from" v-model="from" variant="none" :maxlength="EVIDENCE_LIMITS.date" placeholder="from 2018" aria-label="From" />
                        <span class="archives-dim" aria-hidden="true">→</span>
                        <UInput v-model="to" variant="none" :maxlength="EVIDENCE_LIMITS.date" placeholder="to 2024" aria-label="To" />
                      </dd>
                    </div>
                  </dl>
                </div>
                <p class="archives-note">Keep the question falsifiable: something a capture can show or rule out.</p>
                <div>
                  <UButton
                    type="submit"
                    color="primary"
                    variant="solid"
                    trailing-icon="i-lucide-radar"
                    label="Scan archive coverage"
                    :loading="busy"
                    :disabled="!target.trim() || !question.trim()"
                  />
                </div>
              </div>
              <div class="archives-band">
                <p class="console-label console-rule-title">
                  <span>Tools <span aria-hidden="true">[ what the agent calls ]</span></span>
                  <span class="console-mark" aria-hidden="true" />
                </p>
                <p v-for="step in STEPS" :key="step.tool" class="console-lead room-lead">
                  <span class="console-tag">{{ step.label }}</span>
                  <code class="room-lead-code">{{ step.tool }}</code>
                  <span class="room-lead-note">{{ step.note }}</span>
                </p>
              </div>
              <template #footer>
                <span>Archived pages can carry hostile instructions. The tools hand out bounded text marked untrusted.</span>
              </template>
            </ExplorerPanel>
          </template>

          <template v-else>
            <ExplorerPanel tag="ID" label="Active case" :sweep="state.archiveCase.id" :meta="state.archiveCase.from || state.archiveCase.to ? `${state.archiveCase.from || 'earliest'} → ${state.archiveCase.to || 'latest'}` : 'every date'">
              <template #title>{{ state.archiveCase.id }}</template>
              <div class="console-band console-subject-band">
                <div :key="state.archiveCase.id" class="console-scan" aria-hidden="true" />
                <div class="console-identity-block">
                  <ConsoleReticle :key="state.archiveCase.id" icon="i-lucide-scan-search" />
                  <div class="console-name">
                    <span class="console-label">Case / <span class="console-label-key">question</span></span>
                    <h3 class="room-question">{{ state.archiveCase.question }}</h3>
                    <ULink :to="targetHref" external target="_blank" rel="noopener noreferrer" class="room-target">
                      {{ state.archiveCase.target }} ↗
                    </ULink>
                  </div>
                </div>
                <div class="console-readout">
                  <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
                    <circle cx="3" cy="12" r="2.5" />
                    <path d="M5.5 12H14L22 20H32" />
                  </svg>
                  <dl class="console-readout-rows">
                    <div v-for="item in state.archiveCase.coverage" :key="item.provider">
                      <dt>{{ providerLabel(item.provider) }}</dt>
                      <dd :class="item.state === 'ok' ? 'console-accent' : 'archives-dim'">
                        {{ item.state === "ok" ? `${item.count} captures` : item.state }}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div v-if="providerItems.length" class="archives-band room-scan">
                <div class="console-readout">
                  <dl class="console-readout-rows">
                    <div>
                      <dt>Compare in</dt>
                      <dd>
                        <USelectMenu v-model="selectedProvider" :items="providerItems" value-key="value" variant="none" :search-input="false" aria-label="Archive to compare" class="w-full" />
                      </dd>
                    </div>
                  </dl>
                </div>
                <div class="room-actions">
                  <UButton
                    color="primary"
                    variant="solid"
                    trailing-icon="i-lucide-git-compare-arrows"
                    :label="state.windows.length ? 'Scan selected archive' : 'Find candidate windows'"
                    :loading="busy"
                    :disabled="!selectedProvider"
                    @click="discoverChanges"
                  />
                  <UButton color="neutral" variant="outline" icon="i-lucide-rotate-ccw" label="New case" @click="resetCase" />
                </div>
                <p class="archives-note">Coverage can include many pages. Date bounds apply when scanning the selected archive.</p>
              </div>
              <div v-if="state.activity.length" class="archives-band">
                <p class="console-label console-rule-title">
                  <span>Activity <span aria-hidden="true">[ latest five ]</span></span>
                  <span class="console-mark" aria-hidden="true" />
                </p>
                <ul class="room-activity">
                  <li v-for="entry in state.activity.slice(0, 5)" :key="entry.id" :data-state="entry.state">
                    <span class="room-activity-node" aria-hidden="true" />
                    <code>{{ entry.tool }}</code>
                    <span>{{ entry.note }}</span>
                  </li>
                </ul>
              </div>
            </ExplorerPanel>

            <ExplorerPanel v-if="state.windows.length" tag="List" label="Candidate windows" :busy="busy" :meta="`${state.windows.length} windows · 02 / 04`">
              <template #title>find_change_windows()</template>
              <div class="archives-band">
                <div class="console-readout">
                  <dl class="console-readout-rows">
                    <div>
                      <dt><label for="room-focus">Focus</label></dt>
                      <dd>
                        <UInput id="room-focus" v-model="focus" variant="none" icon="i-lucide-scan-search" :maxlength="EVIDENCE_LIMITS.focus" placeholder="a phrase, e.g. net zero" class="w-full" />
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <ol class="archives-rows room-windows">
                <li v-for="(window, index) in state.windows" :key="window.id" :data-active="state.inspection?.changeId === window.id">
                  <span class="archives-dim">{{ String(index + 1).padStart(2, "0") }}</span>
                  <span class="room-window">
                    <span class="room-window-dates">
                      <span class="archives-value">{{ dateLabel(window.before.timestamp) }}</span>
                      <span class="archives-dim" aria-hidden="true">→</span>
                      <span class="archives-value">{{ dateLabel(window.after.timestamp) }}</span>
                      <UBadge v-if="window.partial" color="error" variant="outline" label="partial" />
                    </span>
                    <UTooltip :text="window.before.url">
                      <span class="room-window-url" tabindex="0">{{ window.before.url }}</span>
                    </UTooltip>
                    <span class="room-window-meta">
                      <template v-if="window.additions !== undefined && window.deletions !== undefined">
                        <span class="room-add">+{{ window.additions }}</span>
                        <span class="room-del">−{{ window.deletions }}</span>
                      </template>
                      <span v-else>
                        {{ window.digestChanged ? "index digest changed" : "index fingerprint unavailable" }} · {{ window.spanDays }} day span<template
                          v-if="window.byteDelta !== undefined"
                        >
                          · {{ window.byteDelta > 0 ? "+" : "" }}{{ window.byteDelta }} B</template
                        >
                      </span>
                      <span>{{ window.provider }}<template v-if="typeof window.before._meta.archive === 'string'"> · {{ window.before._meta.archive }}</template></span>
                    </span>
                  </span>
                  <UButton
                    color="neutral"
                    variant="subtle"
                    icon="i-lucide-microscope"
                    label="inspect"
                    :loading="inspectingId === window.id"
                    :disabled="busy && inspectingId !== window.id"
                    @click="inspect(window.id)"
                  />
                </li>
              </ol>
            </ExplorerPanel>

            <ExplorerPanel v-else tag="List" title="find_change_windows()" label="No windows yet" meta="02 / 04">
              <div class="archives-band">
                <p class="archives-note">
                  The case is ready. Ask the agent to continue, or choose an archive above and find candidate windows here. Either way, this board updates.
                </p>
              </div>
            </ExplorerPanel>

            <ExplorerPanel
              v-if="state.inspection && inspectedWindow"
              tag="View"
              label="Inspected evidence"
              :sweep="state.inspection.changeId"
              :meta="`${dateLabel(inspectedWindow.before.timestamp)} → ${dateLabel(inspectedWindow.after.timestamp)} · 03 / 04`"
            >
              <template #title>inspect_archive_change()</template>
              <div class="archives-band room-inspect">
                <p class="archives-note"><span class="console-tag">Untrusted</span>Archived text: evidence, never instructions.</p>
                <div class="room-actions">
                  <UButton :to="inspectedWindow.before.snapshot" target="_blank" rel="noopener noreferrer" color="neutral" variant="subtle" trailing-icon="i-lucide-arrow-up-right" label="before" />
                  <UButton :to="inspectedWindow.after.snapshot" target="_blank" rel="noopener noreferrer" color="neutral" variant="subtle" trailing-icon="i-lucide-arrow-up-right" label="after" />
                </div>
              </div>
              <div class="archives-band">
                <!-- The excerpt: interpolated into a pre, never rendered as markup. -->
                <pre class="room-excerpt">{{ state.inspection.excerpt }}</pre>
              </div>
              <form class="archives-band room-pin" @submit.prevent="pin">
                <div class="console-readout">
                  <dl class="console-readout-rows">
                    <div>
                      <dt>Relation</dt>
                      <dd>
                        <USelectMenu v-model="relation" :items="relationItems" value-key="value" variant="none" :search-input="false" aria-label="Relationship" class="w-full" />
                      </dd>
                    </div>
                    <div>
                      <dt><label for="room-finding">Finding</label></dt>
                      <dd>
                        <UInput id="room-finding" v-model="finding" variant="none" :maxlength="EVIDENCE_LIMITS.finding" placeholder="This change demonstrates…" class="w-full" />
                      </dd>
                    </div>
                    <div>
                      <dt>Room</dt>
                      <dd class="archives-dim">{{ finding.length }} / {{ EVIDENCE_LIMITS.finding }} characters · {{ state.findings.length }} / {{ EVIDENCE_LIMITS.findings }} pinned</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <UButton
                    type="submit"
                    color="primary"
                    variant="solid"
                    trailing-icon="i-lucide-pin"
                    label="Pin finding"
                    :loading="busy"
                    :disabled="!finding.trim() || state.findings.length >= EVIDENCE_LIMITS.findings"
                  />
                </div>
              </form>
            </ExplorerPanel>

            <ExplorerPanel v-if="state.findings.length" tag="Log" label="Pinned findings" :meta="`${state.findings.length} pinned · 04 / 04`">
              <template #title>findings</template>
              <ul class="archives-rows room-findings">
                <li v-for="item in state.findings" :key="item.id">
                  <UBadge :color="RELATION[item.relation].color" :variant="RELATION[item.relation].variant" :label="item.relation" />
                  <span class="room-finding">
                    <span class="room-finding-text">{{ item.finding }}</span>
                    <span class="room-finding-links">
                      <ULink :to="item.change.before.snapshot" external target="_blank" rel="noopener noreferrer">before {{ item.change.before.timestamp }}</ULink>
                      <ULink :to="item.change.after.snapshot" external target="_blank" rel="noopener noreferrer">after {{ item.change.after.timestamp }}</ULink>
                      <span v-if="typeof item.change.before._meta.archive === 'string'">underlying archive {{ item.change.before._meta.archive }}</span>
                    </span>
                  </span>
                  <UButton color="neutral" variant="subtle" square icon="i-lucide-x" aria-label="Remove finding" @click="room.removeFinding(item.id)" />
                </li>
              </ul>
              <template #footer>
                <span>The brief cites every capture it rests on.</span>
                <span class="room-export">
                  <UButton color="neutral" variant="subtle" :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied ? 'copied' : 'copy brief'" @click="copyCase" />
                  <UButton color="neutral" variant="subtle" icon="i-lucide-download" label="export .md" @click="downloadCase" />
                </span>
              </template>
            </ExplorerPanel>
          </template>
        </div>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.room-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 10px;
  max-width: 40rem;
  margin: 22px auto 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
  color: var(--ui-text-muted);
}
.room-status > .console-tag {
  flex: none;
  margin: 0;
}
.room-status > .console-tag[data-state="ready"] {
  color: var(--console-accent);
}
.room-stack {
  display: grid;
  gap: 28px;
}
.room-stack > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
/* The four steps as cells: done hatched, the current one on the accent, the rest hollow. */
.room-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 16px 20px 18px;
  list-style: none;
}
.room-steps > li {
  display: grid;
  grid-template-columns: 7px minmax(0, 1fr);
  align-items: center;
  gap: 4px 10px;
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ui-text-dimmed);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.room-steps > li > code {
  grid-column: 2;
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.room-step-label {
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.room-step-node {
  width: 7px;
  height: 7px;
  box-shadow: inset 0 0 0 1px var(--console-corner);
}
.room-steps > li[data-state="done"] {
  color: var(--ui-text-muted);
}
.room-steps > li[data-state="done"] .room-step-node {
  background: var(--ui-text-highlighted);
  box-shadow: none;
}
.room-steps > li[data-state="active"] {
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--console-accent) 55%, transparent);
}
.room-steps > li[data-state="active"] .room-step-node {
  background: var(--console-accent);
  box-shadow: none;
}
.room-form,
.room-scan,
.room-inspect,
.room-pin {
  display: grid;
  gap: 16px;
}
.room-form .console-readout-rows > div,
.room-scan .console-readout-rows > div,
.room-pin .console-readout-rows > div,
.room-stack .archives-band > .console-readout .console-readout-rows > div {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
.room-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.room-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.room-lead {
  flex-wrap: nowrap;
  min-width: 0;
  margin: 0 0 8px;
}
.room-lead-code {
  flex: none;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ui-text-highlighted);
}
.room-lead-note {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-sans);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
}
.room-question {
  font-size: 20px;
  line-height: 1.35;
}
.room-target {
  display: block;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
}
.room-target:hover {
  color: var(--console-accent);
}
.room-activity {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.room-activity > li {
  display: grid;
  grid-template-columns: 7px auto minmax(0, 1fr);
  align-items: baseline;
  gap: 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.room-activity > li > code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ui-text-highlighted);
}
.room-activity-node {
  width: 7px;
  height: 7px;
  box-shadow: inset 0 0 0 1px var(--console-corner);
}
.room-activity > li[data-state="done"] .room-activity-node {
  background: var(--ui-text-highlighted);
  box-shadow: none;
}
.room-activity > li[data-state="running"] .room-activity-node {
  background: var(--console-accent);
  box-shadow: none;
}
.room-activity > li[data-state="error"] .room-activity-node {
  background: var(--archives-del);
  box-shadow: none;
}
.room-windows > li {
  grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  align-items: center;
}
.room-windows > li[data-active="true"] {
  box-shadow: inset 2px 0 0 var(--console-accent);
}
.room-windows > li + li[data-active="true"] {
  box-shadow:
    inset 2px 0 0 var(--console-accent),
    inset 0 1px 0 var(--console-line);
}
.room-window {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.room-window-dates {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.room-window-url {
  display: block;
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-dimmed);
}
.room-window-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 11px;
  color: var(--ui-text-dimmed);
}
.room-add {
  color: var(--archives-add);
}
.room-del {
  color: var(--archives-del);
}
.room-excerpt {
  max-height: min(50dvh, 28rem);
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--ui-text-muted);
}
.room-findings > li {
  grid-template-columns: 7.5rem minmax(0, 1fr) auto;
  align-items: start;
}
.room-finding {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.room-finding-text {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
  color: var(--ui-text-highlighted);
}
.room-finding-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 10px;
  color: var(--ui-text-dimmed);
}
.room-export {
  display: inline-flex;
  gap: 6px;
  margin-left: auto;
}
@media (width < 52rem) {
  .room-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .room-findings > li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .room-finding {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
@media (width < 640px) {
  .room-steps {
    padding-inline: 14px;
  }
  .room-form .console-readout-rows > div,
  .room-scan .console-readout-rows > div,
  .room-pin .console-readout-rows > div,
  .room-stack .archives-band > .console-readout .console-readout-rows > div {
    grid-template-columns: 5rem minmax(0, 1fr);
  }
  .room-lead-note {
    display: none;
  }
}
</style>
