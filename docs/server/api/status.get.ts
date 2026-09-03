import { listArchiveProviders, snapshotArchives } from "@agntn/archives/tool-operations";

const TTL = 60 * 10;
const PROBE_TARGET = "example.com";
const PROBE_TIMEOUT = 15_000;

export interface ProviderProbe {
  provider: string;
  state: "ok" | "empty" | "unsupported" | "failed" | "needs-config";
  ms: number;
  note: string;
  reason?: string;
}

/** One small listing per provider, timed; providers that need a collection, a user or a key are reported, not probed. */
export default defineCachedEventHandler(
  async (event) => {
    const statuses = listArchiveProviders().details.providers.filter((status) => status.name !== "all");
    const probes = await Promise.all(
      statuses.map(async (status): Promise<ProviderProbe> => {
        const needsConfig = /\{/u.test(status.factory) || status.requiresApiKey;
        if (needsConfig) {
          return { provider: status.name, state: "needs-config", ms: 0, note: status.note };
        }
        const started = Date.now();
        try {
          const result = await snapshotArchives({ target: PROBE_TARGET, provider: status.name, limit: 1, timeout: PROBE_TIMEOUT });
          const response = result.details.response;
          const ms = Date.now() - started;
          if (response.unsupported) {
            return { provider: status.name, state: "unsupported", ms, note: status.note, reason: response.unsupportedReason };
          }
          if (!response.success) {
            return { provider: status.name, state: "failed", ms, note: status.note, reason: response.error };
          }
          return { provider: status.name, state: response.pages.length ? "ok" : "empty", ms, note: status.note };
        } catch (error) {
          return {
            provider: status.name,
            state: "failed",
            ms: Date.now() - started,
            note: status.note,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    markPublic(event, TTL);
    return { target: PROBE_TARGET, probes, fetchedAt: new Date().toISOString() };
  },
  { maxAge: TTL, swr: true, getKey: () => "status" },
);
