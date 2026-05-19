import type { ArchiveOptions } from "./types";

export interface WaybackOptions extends ArchiveOptions {
  collapse?: string;
  filter?: string;
}

export type ArchiveTodayOptions = ArchiveOptions;

export interface PermaccOptions extends ArchiveOptions {
  apiKey: string; // API key is required for Perma.cc
}

export interface CommonCrawlOptions extends ArchiveOptions {
  collection?: string; // Identifier of the crawl collection (e.g. 'CC-MAIN-2023-50' or 'CC-MAIN-latest')
}

export type WebCiteOptions = ArchiveOptions;
