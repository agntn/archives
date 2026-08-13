import { createArchive, providers } from "@agntn/archives";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  const archive = createArchive(
    providers.permacc({
      apiKey: config.permacc.apiKey,
    }),
  );

  const snapshots = await archive.snapshots("example.com");

  return snapshots;
});
