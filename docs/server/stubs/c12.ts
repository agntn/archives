/**
 * Stand-in for `c12` on the docs worker.
 *
 * The library discovers `archives.config.ts`, `.archives` and `package.json`
 * through c12, which walks the filesystem. A Worker has no filesystem and the
 * docs site has no config files, so discovery is replaced by the defaults the
 * library passes in, merged with any explicit overrides.
 */
interface LoadConfigOptions<T> {
  defaults?: T;
  defaultConfig?: Partial<T>;
  overrides?: Partial<T>;
}

export async function loadConfig<T extends object>(options: LoadConfigOptions<T>) {
  const config = { ...(options.defaults ?? {}), ...(options.defaultConfig ?? {}), ...(options.overrides ?? {}) } as T;
  return { config, layers: [], cwd: "/", configFile: undefined, meta: {} };
}
