import { createArchive, providers } from "@agntn/archives";

const archive = createArchive(
  providers.commoncrawl({
    timeout: 60_000,
  }),
);

export default defineEventHandler(async () => {
  const snapshots = await archive.snapshots("example.com");

  return snapshots;
});
