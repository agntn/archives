/** `http://www.example.com:80/` and `https://example.com` name the same resource for a compare or a history. */
export function resourceKey(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/^[^/@]+@/u, "")
    .replace(/^www\./u, "")
    .replace(/:(?:80|443)(?=\/|$)/u, "")
    .replace(/\/+$/u, "");
}

export function sameResource(a: string, b: string): boolean {
  return resourceKey(a) === resourceKey(b);
}
