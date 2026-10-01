import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sanitizeLine } from "@agntn/tools";
import { registerPiTools, type PiRenderers } from "@agntn/tools/pi";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type * as ArchivesTools from "../../../dist/tools.d.mts";

interface WaybackResponseSummary {
  readonly success: boolean;
  readonly pages: readonly unknown[];
}

interface CommandNotice {
  message: string;
  level: "error" | "warning";
}

const sourceModuleUrl = new URL("../../../src/tools.ts", import.meta.url);
const distributionModuleUrl = new URL("../../../dist/tools.mjs", import.meta.url);

/**
 * Loads the tool definitions, from the source in a checkout and the build in the package.
 *
 * @returns {Promise<typeof ArchivesTools>} The definitions and the executor loader.
 */
function loadTools(): Promise<typeof ArchivesTools> {
  return import(
    existsSync(fileURLToPath(sourceModuleUrl)) ? sourceModuleUrl.href : distributionModuleUrl.href
  ) as Promise<typeof ArchivesTools>;
}

function archiveCommandNotice(
  response: WaybackResponseSummary,
  target: string,
  failureMessage: string,
): CommandNotice | undefined {
  if (!response.success) {
    return { message: `archives failed: ${failureMessage}`, level: "error" };
  }
  if (response.pages.length === 0) {
    return {
      message: `No archived snapshots for "${sanitizeLine(target)}" via Wayback.`,
      level: "warning",
    };
  }
  return undefined;
}

/**
 * Registers the tools and commands. Failures return as `isError`, which Pi counts from 0.99 on.
 *
 * @param pi - Pi extension API.
 */
export default async function archivesExtension(pi: ExtensionAPI): Promise<void> {
  const { archivesTools, describeCall, loadOperations } = await loadTools();
  const renderers = Object.fromEntries(
    archivesTools.map((tool): [string, PiRenderers] => [
      tool.name,
      {
        renderCall(args, theme) {
          const summary = describeCall(tool.name, args as Readonly<Record<string, unknown>>);
          const title = theme.fg("toolTitle", theme.bold(tool.name));
          return new Text(summary ? `${title} ${theme.fg("dim", summary)}` : title, 0, 0);
        },
      },
    ]),
  );
  registerPiTools(pi, archivesTools, { failures: "return", renderers });

  pi.registerCommand("archive", {
    description: "Search web archives with archives: /archive [domain-or-url]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const initial = args.trim();
      const target =
        initial || (await ctx.ui.input("Search web archives", "Enter a domain or URL"));
      if (!target?.trim()) return;

      const trimmed = target.trim();
      let operations;
      let response;
      try {
        // Loading the executors is part of the work this handler reports on:
        // hoisting it above the try turned a missing build into an opaque
        // extension crash instead of a message the user can act on.
        operations = await loadOperations();
        response = await operations.waybackSnapshots(trimmed);
      } catch (error) {
        ctx.ui.notify(`archives failed: ${plainErrorMessage(error)}`, "error");
        return;
      }
      const { formatPage, responseFailureMessage } = operations;

      const notice = archiveCommandNotice(response, trimmed, responseFailureMessage(response));
      if (notice) {
        ctx.ui.notify(notice.message, notice.level);
        return;
      }

      const labels = response.pages.map((page) => formatPage(page));
      const selected = await ctx.ui.select(`archives — ${sanitizeLine(trimmed)}`, labels);
      if (!selected) return;

      const picked = response.pages[labels.indexOf(selected)];
      if (!picked) return;

      const safeSnapshot = sanitizeLine(picked.snapshot);
      ctx.ui.pasteToEditor(safeSnapshot);
      ctx.ui.notify(`Pasted ${safeSnapshot}`, "info");
    },
  });

  pi.registerCommand("archive-providers", {
    description: "List archives providers",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      try {
        const { listArchiveProviders } = await loadOperations();
        ctx.ui.notify(listArchiveProviders().content[0].text, "info");
      } catch (error) {
        ctx.ui.notify(`archives failed: ${plainErrorMessage(error)}`, "error");
      }
    },
  });
}

/* Usable when the executors themselves failed to load, so it cannot come from them. */
function plainErrorMessage(error: unknown): string {
  return sanitizeLine(error instanceof Error ? error.message : String(error));
}
