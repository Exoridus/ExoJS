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
 * A Rollup/Vite plugin that loads a module as a default-exported source string.
 *
 * The two ways of claiming one are deliberately different, which is why this
 * type carries `resolveId` and `enforce` as optional: a shader is claimed by
 * the file's own extension, a worklet or worker by an import query on a `.ts`
 * module that also has an ordinary meaning.
 */
export interface SourcePlugin {
  /** Plugin name, as it appears in bundler diagnostics. */
  name: string;
  /**
   * Vite plugin ordering, read by Vite and ignored by Rollup.
   *
   * `'pre'` puts the hooks ahead of Vite's own resolver and TypeScript
   * pipeline, which would otherwise claim a `.ts` id first. It is required for
   * the query-keyed plugins and deliberately absent from the shader plugin,
   * which has to stay behind Vite's own `?raw`/`?url` handling.
   */
  enforce?: 'pre';
  /**
   * Claims ids carrying this plugin's import query and resolves them to an
   * absolute path. Absent where the imported file is itself the module.
   */
  resolveId?(source: string, importer?: string): string | null;
  /** Loads a claimed id and returns it as a module with a default-exported string. */
  load(this: PluginLoadContext, id: string): string | null;
}

/**
 * A {@link SourcePlugin} keyed on an import query rather than on a file
 * extension, which is what makes both hooks mandatory: the query has to be
 * claimed during resolution before the id can be loaded.
 */
export interface InlineSourcePlugin extends SourcePlugin {
  enforce: 'pre';
  resolveId(source: string, importer?: string): string | null;
}
