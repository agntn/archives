/** Vercel AI SDK tools over the same definitions MCP, Pi, OMP and the CLI read. */

import { toAiTools } from "@agntn/tools/ai";
import type { Tool } from "ai";
import { archivesTools } from "./tools.ts";

/** The name each archive tool answers to, the same on every host. */
export type ArchivesToolName =
  | "archives_snapshots"
  | "archives_content"
  | "archives_diff"
  | "archives_providers";

/** Every archive tool for the AI SDK under its MCP name. Executors load on the first call. */
export const archivesAiTools: Readonly<Record<ArchivesToolName, Tool>> = toAiTools(
  archivesTools,
) as Record<ArchivesToolName, Tool>;
