/**
 * Immutable compile-time build metadata for `@codexo/exojs`.
 *
 * `development` mirrors the `__DEV__` compile-time constant and is statically
 * replaced before tree shaking. `version` is the exact `package.json` version
 * of the Core package at build time. `revision` is the short source-control
 * revision (appended with `-dirty` when uncommitted changes are present) or
 * `"unknown"` when no revision information is available.
 */
export interface BuildInfo {
  readonly version: string;
  readonly revision: string;
  readonly development: boolean;
}

export const buildInfo: BuildInfo = Object.freeze({
  version: __VERSION__,
  revision: __REVISION__,
  development: __DEV__,
});
