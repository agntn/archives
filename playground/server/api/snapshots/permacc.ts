import { defineEventHandler } from "h3";
import type { NitroRuntimeConfig } from "nitropack";
import { useRuntimeConfig } from "nitropack/runtime";
import { createArchive, providers } from "@agntn/archives";

interface RuntimeConfig extends NitroRuntimeConfig {
  permacc: { apiKey: string };
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig<RuntimeConfig>(event);

  const archive = createArchive(
    providers.permacc({
      apiKey: config.permacc.apiKey,
    }),
  );

  const snapshots = await archive.snapshots("example.com");

  return snapshots;
});
