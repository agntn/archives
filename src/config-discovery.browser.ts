import type { ArchivesConfig, ConfigLayer, ResolveConfigOptions } from "./config.ts";

type Section = Readonly<Record<string, unknown>> | undefined;

/**
 * Lists the keys of `section` that hold a value, the way c12 skips `undefined` while merging.
 *
 * @param section - One layer's `performance`
 * @returns {[string, unknown][]} The keys that are set, with their values
 */
function setEntries(section: Section): [string, unknown][] {
  return Object.entries(section ?? {}).filter(([, value]) => value !== undefined && value !== null);
}

/**
 * Merges the `performance` section of every layer, the first layer winning.
 *
 * @param layers - Overrides, then caller defaults, then library defaults
 * @returns {Record<string, unknown>} The merged section
 */
function mergePerformance(layers: readonly (ConfigLayer | undefined)[]): Record<string, unknown> {
  return Object.fromEntries(layers.toReversed().flatMap((layer) => setEntries(layer?.performance)));
}

/**
 * Stands in for c12 in browsers and Workers, where there are no config files to find.
 *
 * @param options - The overrides and defaults to merge; file options have nothing to read
 * @param defaults - The library defaults, merged in last
 * @returns {Promise<ArchivesConfig>} Overrides over caller defaults over library defaults
 */
export async function discoverConfig(
  options: ResolveConfigOptions,
  defaults: ArchivesConfig,
): Promise<ArchivesConfig> {
  const layers = [options.overrides, options.defaults, defaults];
  return { performance: mergePerformance(layers) };
}
