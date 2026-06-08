/**
 * Immutable compile-time build metadata for `@codexo/exojs-tiled`.
 *
 * `development` mirrors the `__DEV__` compile-time constant and is statically
 * replaced before tree shaking. `version` is the exact `package.json` version
 * of the Tiled package at build time. `revision` is the short
 * source-control revision (appended with `-dirty` when uncommitted changes are
 * present) or `"unknown"` when no revision information is available.
 */
export interface TiledBuildInfo {
  readonly version: string;
  readonly revision: string;
  readonly development: boolean;
}

export const tiledBuildInfo: TiledBuildInfo = Object.freeze({
  version: __VERSION__,
  revision: __REVISION__,
  development: __DEV__,
});
