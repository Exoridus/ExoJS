/**
 * Single source of truth for the lockstep-released ExoJS packages.
 *
 * Every release script derives its package list from here — `manifest.ts`
 * (PUBLISH_ORDER), `prepare.ts` (officialPackages), `cut.ts` (bump targets),
 * `run.ts` (build set), `external-consumers.ts` (offline smoke set), and the
 * `verify-*` gates. Adding the N-th package is a single entry in this array
 * instead of a hand-edit across ~10 files.
 *
 * NOT derivable from here (different runtimes — kept in sync manually, guarded
 * by `verify:release-matrix` where possible):
 *   - `.github/workflows/release.yml` / `_ci-checks.yml` build/typecheck/pack
 *     steps (YAML, enumerated `--filter`s; release.yml build lines are asserted
 *     by `verify:release-matrix`).
 *   - `scripts/ci/select-lanes.mjs` RUNTIME_PACKAGES (dependency-free ESM that
 *     runs before any install, so it cannot import this TS module).
 *   - `site/scripts/sync-exo-vendor.ts` / `full-zip.ts` vendor tree — a smaller,
 *     site-owned set (the offline examples site only embeds packages it uses).
 */

/** Order is canonical PUBLISH_ORDER: Core first (peer of every extension), then extensions. */
export interface LockstepPackage {
  /** npm package name. */
  readonly name: string;
  /** Package directory relative to the repo root (`.` for Core). */
  readonly dir: string;
  /** Core is `false`; every opt-in package is an extension. */
  readonly isExtension: boolean;
  /**
   * Package-policy shape: `true` ships a `/register` side-effect entry
   * (`particles`/`tilemap`/`tiled`/`aseprite`/`ldtk`); `false` is a library that
   * ships `sideEffects: false` (`physics`/`audio-fx`/`react`). Ignored for Core.
   */
  readonly hasRegister: boolean;
  /**
   * Whether the package participates in the offline external-consumer smoke
   * (`npm install --offline` + Node/TS import in a throwaway project). `react`
   * is excluded: its `react`/`react-dom` peers are not resolvable offline.
   */
  readonly inOfflineSmoke: boolean;
}

export const LOCKSTEP_PACKAGES = [
  { name: '@codexo/exojs', dir: '.', isExtension: false, hasRegister: false, inOfflineSmoke: true },
  { name: '@codexo/exojs-particles', dir: 'packages/exojs-particles', isExtension: true, hasRegister: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-tilemap', dir: 'packages/exojs-tilemap', isExtension: true, hasRegister: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-tiled', dir: 'packages/exojs-tiled', isExtension: true, hasRegister: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-physics', dir: 'packages/exojs-physics', isExtension: true, hasRegister: false, inOfflineSmoke: true },
  { name: '@codexo/exojs-audio-fx', dir: 'packages/exojs-audio-fx', isExtension: true, hasRegister: false, inOfflineSmoke: true },
  { name: '@codexo/exojs-aseprite', dir: 'packages/exojs-aseprite', isExtension: true, hasRegister: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-ldtk', dir: 'packages/exojs-ldtk', isExtension: true, hasRegister: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-react', dir: 'packages/exojs-react', isExtension: true, hasRegister: false, inOfflineSmoke: false },
] as const satisfies readonly LockstepPackage[];

/** Union of the official package names (literal type, preserved for `OfficialPackageName`). */
export type OfficialPackageName = (typeof LOCKSTEP_PACKAGES)[number]['name'];

/** The extension subset (everything except Core). */
export const EXTENSION_PACKAGES = LOCKSTEP_PACKAGES.filter(p => p.isExtension);
