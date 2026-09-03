import type { ContentDetails, DiffDetails, SnapshotDetails } from "@agntn/archives/tool-operations";
import type { ApiResult } from "../utils/capture";
import {
  LANDING_CONTENT,
  LANDING_DIFF,
  LANDING_SNAPSHOTS,
  LANDING_TARGETS,
  type ContentSample,
  type DiffSample,
  type SnapshotSample,
} from "../utils/landing-fixtures";


const INTERVAL = 3600;

/**
 * Drives every live panel on the landing from one clock.
 *
 * The page renders with samples recorded through the library, then swaps each
 * panel to a fresh answer from the docs worker as it arrives. Nothing here
 * talks to an archive directly: the worker runs the same executors the MCP
 * server does, so the numbers on the page are the numbers an agent would get.
 */
export function useLandingArchive() {
  const targets = LANDING_TARGETS;
  const tick = ref(0);
  const paused = ref(false);
  const snapshots = ref<Record<string, SnapshotSample>>({ ...LANDING_SNAPSHOTS });
  const contents = ref<readonly ContentSample[]>(LANDING_CONTENT);
  const diff = ref<DiffSample>(LANDING_DIFF);

  const index = computed(() => tick.value % targets.length);
  const target = computed(() => targets[index.value]!);
  const current = computed(() => snapshots.value[target.value]);
  const content = computed(() => contents.value[tick.value % contents.value.length]!);

  let timer: number | undefined;

  function step(delta: number) {
    tick.value = (tick.value + delta + targets.length * 1000) % (targets.length * 1000);
  }

  function stopWalk() {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  }

  function startWalk() {
    stopWalk();
    if (!import.meta.client || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    timer = window.setInterval(() => {
      if (!paused.value && !document.hidden) {
        step(1);
      }
    }, INTERVAL);
  }

  /** Swaps a panel to the live answer; a failed fetch leaves the recorded sample and its label in place. */
  async function refreshSnapshots(name: string) {
    try {
      const result = await $fetch<ApiResult<SnapshotDetails>>("/api/snapshots", {
        retry: 0,
        query: { target: name, provider: "all", limit: 50 },
      });
      if (!result.details.response.success || result.details.response.pages.length === 0) {
        return;
      }
      snapshots.value = {
        ...snapshots.value,
        [name]: { target: name, text: result.text, details: result.details, fetchedAt: result.fetchedAt, live: true },
      };
    } catch {
      return;
    }
  }

  /** Same as {@link refreshSnapshots} for one recorded read. */
  async function refreshContent(sample: ContentSample, position: number) {
    try {
      const result = await $fetch<ApiResult<ContentDetails>>("/api/content", {
        retry: 0,
        query: { target: sample.target, provider: sample.provider, timestamp: sample.timestamp, maxChars: 400 },
      });
      if (!result.details.response.content) {
        return;
      }
      const next = [...contents.value];
      next[position] = { ...sample, text: result.text, details: result.details, fetchedAt: result.fetchedAt, live: true };
      contents.value = next;
    } catch {
      return;
    }
  }

  /** Same as {@link refreshSnapshots} for the recorded diff. */
  async function refreshDiff() {
    try {
      const sample = diff.value;
      const result = await $fetch<ApiResult<DiffDetails>>("/api/diff", {
        retry: 0,
        query: {
          target: sample.target,
          provider: sample.provider,
          before: sample.before,
          after: sample.after,
          maxChars: 4000,
        },
      });
      if (!result.details.success) {
        return;
      }
      diff.value = { ...sample, text: result.text, details: result.details, fetchedAt: result.fetchedAt, live: true };
    } catch {
      return;
    }
  }

  onMounted(() => {
    startWalk();
    for (const name of targets) {
      void refreshSnapshots(name);
    }
    contents.value.forEach((sample, position) => {
      void refreshContent(sample, position);
    });
    void refreshDiff();
  });

  onUnmounted(stopWalk);

  return { targets, target, index, tick, paused, current, content, diff, step };
}
