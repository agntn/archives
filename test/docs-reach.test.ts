import { describe, expect, it } from "vite-plus/test";
import { hasReachableFailure, unreachableReason } from "../docs/server/utils/reach";

/** `_meta.errors` of a live `provider=all` listing from the docs worker, 2026-10-01. */
const WORKER_ERRORS = [
  'webarchiv: [GET] "https://webarchiv.onb.ac.at/web/cdx?url=http:%2F%2Fexample.org%2F&limit=3": 503 Service Unavailable',
  'archive-today: [GET] "https://archive.is/timemap/http://example.org": 522 <none>',
];

describe("docs worker reach", () => {
  it("names Archive.today under either spelling", () => {
    expect(unreachableReason("archiveToday")).toMatch(/Cloudflare Workers/);
    expect(unreachableReason("archive-today")).toBe(unreachableReason("archiveToday"));
  });

  it("leaves every other provider, the default and a typo to the normal path", () => {
    for (const provider of ["wayback", "all", "auto", undefined, "archive.today"]) {
      expect(unreachableReason(provider)).toBeUndefined();
    }
  });

  it("keeps the full TTL when Archive.today is the only failure", () => {
    expect(hasReachableFailure([WORKER_ERRORS[1]])).toBe(false);
    expect(hasReachableFailure([])).toBe(false);
    expect(hasReachableFailure(undefined)).toBe(false);
  });

  it("still shortens the TTL when a reachable archive failed beside it", () => {
    expect(hasReachableFailure(WORKER_ERRORS)).toBe(true);
    expect(hasReachableFailure([{ provider: "archive-today" }])).toBe(true);
  });
});
