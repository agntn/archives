import { loadConfig } from "c12";
import type { ArchivesConfig, ResolveConfigOptions } from "./config.ts";

/** Where a server reads config when its host pinned no root. */
export { homedir as homeDirectory } from "node:os";

/**
 * Reads `archives.config.ts`, `.archives` and the `archives` key in `package.json` through c12.
 *
 * @param options - Where to look and which layers go above and below the files
 * @param defaults - The library defaults, merged in last
 * @returns {Promise<ArchivesConfig>} Every layer merged, before `postProcessConfig`
 */
export async function discoverConfig(
  options: ResolveConfigOptions,
  defaults: ArchivesConfig,
): Promise<ArchivesConfig> {
  const { config } = await loadConfig({
    name: "archives",
    defaults,
    defaultConfig: options.defaults ?? undefined,
    overrides: options.overrides ?? undefined,
    envName: options.envName ?? process.env.NODE_ENV,
    cwd: options.cwd,
    configFile: options.configFile,
    rcFile: options.rcFile ?? ".archives",
    packageJson: true,
  });
  return config as ArchivesConfig;
}
