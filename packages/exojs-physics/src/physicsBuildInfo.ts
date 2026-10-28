/**
 * Immutable compile-time build metadata for `@codexo/exojs-physics`.
 *
 * `development` mirrors the `__DEV__` compile-time constant and is statically
 * replaced before tree shaking. `version` is the Core package's `package.json`
 * version at build time: this module is compiled inside the Core build, whose
 * defines supply it. `revision` is the short source-control revision (appended
 * with `-dirty` when uncommitted changes are present) or
 * `"unknown"` when no revision information is available.
 */
export interface PhysicsBuildInfo {
  readonly version: string;
  readonly revision: string;
  readonly development: boolean;
}

export const physicsBuildInfo: PhysicsBuildInfo = Object.freeze({
  version: __VERSION__,
  revision: __REVISION__,
  development: __DEV__,
});
