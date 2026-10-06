/** `snapshots` for the command line alone: the target is a plain word, not a JSON string. */

import { defineTool, Type } from "@agntn/tools";
import { MAX_SNAPSHOT_TARGETS, MAX_TARGET_LENGTH } from "./tool-contract.ts";
import { loadOperations, snapshotsTool } from "./tools.ts";

/** Room for a JSON list of the most targets at full length, quotes and commas included. */
const MAX_TARGET_WORD = MAX_SNAPSHOT_TARGETS * (MAX_TARGET_LENGTH + 3) + 2;

export const snapshotsCommand = defineTool({
  ...snapshotsTool,
  input: Type.Object(
    {
      target: Type.String({
        description: `Domain or URL to look up, or a JSON list of up to ${MAX_SNAPSHOT_TARGETS} of them looked up with the same options`,
        minLength: 1,
        maxLength: MAX_TARGET_WORD,
      }),
      ...Type.Omit(snapshotsTool.input, ["target"]).properties,
    },
    { additionalProperties: false },
  ),
  cli: { positional: ["target"], description: "List the captures of a domain or URL" },
  execute: async (params, { signal }) =>
    (await loadOperations()).snapshotBatchArchives(params, signal),
});
