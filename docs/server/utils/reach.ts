interface Unreachable {
  /** Every spelling a request may pass as `provider`. */
  readonly names: readonly string[];
  /** The slug that opens each of its lines in `_meta.errors`. */
  readonly slug: string;
  readonly reason: string;
  /** Hosts it answers from, so a request there fails before it leaves the worker. */
  readonly hosts: RegExp;
}

/** Archives that never answer a connection from Cloudflare Workers, where this site runs. */
const UNREACHABLE: readonly Unreachable[] = [
  {
    names: ["archiveToday", "archive-today"],
    slug: "archive-today",
    reason:
      "Archive.today doesn't answer connections from Cloudflare Workers, where this site runs, so the worker skips it. Query it from your own machine with providers.archiveToday().",
    hosts: /^archive\.(?:fo|is|li|md|ph|today|vn)$/iu,
  },
];

/** Why the worker skips this provider, or nothing when it can ask it. */
export function unreachableReason(provider: string | undefined): string | undefined {
  if (provider === undefined) return undefined;
  return UNREACHABLE.find((entry) => entry.names.includes(provider))?.reason;
}

/** Refuses an unreachable provider before the cache, the rate limit and a 20 s wait for a 522. */
export function assertReachable(provider: string | undefined): void {
  const reason = unreachableReason(provider);
  if (reason) throw createError({ statusCode: 502, statusMessage: reason });
}

/** True when a provider the worker can reach failed, so the answer gets the short TTL. */
export function hasReachableFailure(errors: unknown): boolean {
  if (!Array.isArray(errors)) return false;
  return errors.some(
    (error) => !UNREACHABLE.some((entry) => typeof error === "string" && error.startsWith(`${entry.slug}: `)),
  );
}

/** Wraps `fetch` so a request to an unreachable archive fails now, not after a 30 s `522`. */
export function refuseUnreachable(fetchImpl: typeof fetch): typeof fetch {
  return (input, init) => {
    const target = input instanceof Request ? input.url : String(input);
    const host = URL.parse(target)?.hostname;
    const entry = host === undefined ? undefined : UNREACHABLE.find(({ hosts }) => hosts.test(host));
    return entry ? Promise.reject(new TypeError(entry.reason)) : fetchImpl(input, init);
  };
}
