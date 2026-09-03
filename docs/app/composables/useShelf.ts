import type { ArchivedPage } from "@agntn/archives";
import { captureStamp, citation, pageKey, providerArgument } from "../utils/capture";

export interface ShelfItem {
  readonly key: string;
  readonly provider: string;
  readonly url: string;
  readonly timestamp: string;
  readonly stamp: string;
  readonly snapshot: string;
  readonly digest?: string;
  readonly savedAt: string;
  readonly note?: string;
}

const STORAGE_KEY = "archives:shelf";

const items = ref<ShelfItem[]>([]);
let loaded = false;

function load() {
  if (loaded || !import.meta.client) {
    return;
  }
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    items.value = raw ? (JSON.parse(raw) as ShelfItem[]) : [];
  } catch {
    items.value = [];
  }
}

/** Writes the shelf; when storage is full or blocked the shelf lives for the session only. */
function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value));
  } catch {
    return;
  }
}

/**
 * A research shelf of captures, kept in this browser only.
 *
 * Every entry carries the provenance a citation needs, so an export is usable as
 * a footnote list without going back to the archive.
 */
export function useShelf() {
  onMounted(load);

  function has(page: ArchivedPage): boolean {
    return items.value.some((item) => item.key === pageKey(page));
  }

  function add(page: ArchivedPage, note?: string) {
    if (has(page)) {
      return;
    }
    items.value = [
      {
        key: pageKey(page),
        provider: providerArgument(page),
        url: page.url,
        timestamp: page.timestamp,
        stamp: captureStamp(page),
        snapshot: page.snapshot,
        digest: typeof page._meta.digest === "string" ? page._meta.digest : undefined,
        savedAt: new Date().toISOString(),
        note,
      },
      ...items.value,
    ];
    persist();
  }

  function remove(key: string) {
    items.value = items.value.filter((item) => item.key !== key);
    persist();
  }

  function toggle(page: ArchivedPage) {
    if (has(page)) {
      remove(pageKey(page));
    } else {
      add(page);
    }
  }

  function clear() {
    items.value = [];
    persist();
  }

  function toPage(item: ShelfItem): ArchivedPage {
    return {
      url: item.url,
      timestamp: item.timestamp,
      snapshot: item.snapshot,
      _meta: { provider: item.provider, timestamp: item.stamp, digest: item.digest },
    };
  }

  function exportMarkdown(): string {
    const lines = items.value.map((item, index) => `${index + 1}. ${citation(toPage(item))}${item.note ? ` - ${item.note}` : ""}`);
    return `# Archived captures\n\n${lines.join("\n")}\n`;
  }

  function exportJson(): string {
    return JSON.stringify(items.value, null, 2);
  }

  return { items, has, add, remove, toggle, clear, toPage, exportMarkdown, exportJson };
}
