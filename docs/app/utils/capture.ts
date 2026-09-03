import type { ArchivedPage } from "@agntn/archives";
import { canFrame, providerInfo } from "./providers";

export type ViewMode = "replay" | "source" | "text";

/** One executor answer as the docs API returns it. */
export interface ApiResult<TDetails> {
  readonly text: string;
  readonly details: TDetails;
  readonly fetchedAt: string;
}

export function pageKey(page: ArchivedPage): string {
  return `${page._meta.provider}:${page.snapshot}`;
}

/** The provider argument that reads a page: the tool spelling of its `_meta.provider`. */
export function providerArgument(page: ArchivedPage): string {
  const meta = typeof page._meta.provider === "string" ? page._meta.provider : "";
  return providerInfo(meta)?.slug ?? meta;
}

/** The archive's own stamp when it kept one, so a read lands on this exact capture. */
export function captureStamp(page: ArchivedPage): string {
  const raw = page._meta.timestamp;
  return typeof raw === "string" && /^\d{4,14}$/u.test(raw) ? raw : page.timestamp;
}

export function servesBodies(page: ArchivedPage): boolean {
  return providerInfo(providerArgument(page))?.content ?? false;
}

export function defaultMode(page: ArchivedPage): ViewMode {
  if (canFrame(page)) {
    return "replay";
  }
  return servesBodies(page) ? "source" : "text";
}

export function modeAvailable(page: ArchivedPage, mode: ViewMode): boolean {
  return mode === "replay" ? canFrame(page) : servesBodies(page);
}

/** Permalink of one capture: provider slug, archive stamp, and the original URL as one encoded segment. */
export function captureLink(page: ArchivedPage): string {
  return `/capture/${providerArgument(page)}/${encodeURIComponent(captureStamp(page))}/${encodeURIComponent(page.url)}`;
}

export function compareLink(before: ArchivedPage, after: ArchivedPage): string {
  const query = new URLSearchParams({
    target: before.url,
    provider: providerArgument(before),
    before: captureStamp(before),
    after: captureStamp(after),
  });
  return `/compare?${query.toString()}`;
}

/** The failure text the executor wrote when there is one, otherwise the HTTP error. */
export function errorText(error: unknown): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: { data?: { text?: string }; statusMessage?: string; message?: string } }).data;
    const message = data?.data?.text ?? data?.statusMessage ?? data?.message;
    if (message) {
      return message;
    }
  }
  return error instanceof Error ? error.message : "Request failed";
}

/** A citation with the provenance an agent or a footnote needs. */
export function citation(page: ArchivedPage): string {
  const provider = providerInfo(providerArgument(page))?.label ?? providerArgument(page);
  const digest = typeof page._meta.digest === "string" ? ` · digest ${page._meta.digest}` : "";
  return `${page.url} - archived by ${provider} on ${page.timestamp} - ${page.snapshot}${digest}`;
}

export function sortChronological(pages: readonly ArchivedPage[]): ArchivedPage[] {
  return [...pages].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export { resourceKey, sameResource } from "#shared/utils/resource";
