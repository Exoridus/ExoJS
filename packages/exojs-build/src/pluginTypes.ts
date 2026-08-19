// The plugin surface these plugins actually use, declared structurally rather
// than imported from `rollup`.
//
// Only `resolveId` and `load` are involved, and both bundlers implement them
// identically; `enforce` is read by Vite and ignored by Rollup. Declaring the
// shape here keeps `rollup` out of this package's dependency graph and out of
// its published declarations, so a consumer that has only Vite installed still
// type-checks. The resulting object is structurally assignable to Rollup's
// `Plugin` and to Vite's `PluginOption`.

/** The subset of the bundler plugin context a `load` hook may rely on here. */
export interface PluginLoadContext {
  /**
   * Registers an extra file as a dependency of the module being loaded.
   * Present in Rollup and Vite watch mode, absent in some minimal harnesses,
   * which is why callers feature-detect it.
   */
  addWatchFile?: (id: string) => void;
}

/**
 * A Rollup/Vite plugin that resolves an import query to a bundled source
 * string.
 */
export interface InlineSourcePlugin {
  /** Plugin name, as it appears in bundler diagnostics. */
  name: string;
  /**
   * Vite plugin ordering. `'pre'` puts the hooks ahead of Vite's own resolver
   * and TypeScript pipeline, which would otherwise claim the `.ts` id first.
   */
  enforce: 'pre';
  /** Claims ids carrying this plugin's import query and resolves them to an absolute path. */
  resolveId(source: string, importer?: string): string | null;
  /** Bundles a claimed id and returns it as a module with a default-exported string. */
  load(this: PluginLoadContext, id: string): string | null;
}
