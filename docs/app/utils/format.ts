/** `2002-01-20T14:25:10Z` → `2002-01-20 14:25`. */
export function shortStamp(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/u.exec(iso);
  return match ? `${match[1]} ${match[2]}` : iso;
}

/** `2002-01-20T14:25:10Z` → `2002-01-20`. */
export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Keeps the start and the end of a long URL: `https://arquivo.pt/wayback/2010…example.com/`. */
export function shortUrl(url: string, max = 56): string {
  if (url.length <= max) {
    return url;
  }
  const head = Math.ceil((max - 1) * 0.6);
  const tail = max - 1 - head;
  return `${url.slice(0, head)}…${url.slice(-tail)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Strips the scheme and a trailing slash for display: `https://example.com/` → `example.com`. */
export function bareHost(target: string): string {
  return target.replace(/^https?:\/\//u, "").replace(/\/$/u, "");
}
