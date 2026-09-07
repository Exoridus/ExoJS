/**
 * Single source of truth for the lockstep-released ExoJS packages.
 *
 * Every release script derives its package list from here - `manifest.ts`
 * (PUBLISH_ORDER), `prepare.ts` (officialPackages), `cut.ts` (bump targets),
 * `run.ts` (build set), `external-consumers.ts` (offline smoke set), and the
 * `verify-*` gates. Adding the N-th package is a single entry in this array
 * instead of a hand-edit across ~10 files.
 *
 * NOT derivable from here (different runtimes - kept in sync manually, guarded
 * by `verify:release-matrix` where possible):
 *   - `.github/workflows/release.yml` build steps (YAML, enumerated
 *     `--filter`s, asserted by `verify:release-matrix`). The root
 *     `build:packages` / `typecheck:packages` scripts select by workspace
 *     directory instead and need no edit.
 *   - `scripts/ci/select-lanes.ts` RUNTIME_PACKAGES (dependency-free ESM that
 *     runs before any install, so it cannot import this TS module).
 *   - `site/scripts/sync-exo-vendor.ts` / `full-zip.ts` vendor tree - a smaller,
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
   * Whether the package participates in the offline external-consumer smoke
   * (`npm install --offline` + Node/TS import in a throwaway project). `react`
   * is excluded: its `react`/`react-dom` peers are not resolvable offline.
   */
  readonly inOfflineSmoke: boolean;
}

export const LOCKSTEP_PACKAGES = [
  { name: '@codexo/exojs', dir: '.', isExtension: false, inOfflineSmoke: true },
  { name: '@codexo/exojs-particles', dir: 'packages/exojs-particles', isExtension: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-tilemap', dir: 'packages/exojs-tilemap', isExtension: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-tiled', dir: 'packages/exojs-tiled', isExtension: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-physics', dir: 'packages/exojs-physics', isExtension: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-audio-fx', dir: 'packages/exojs-audio-fx', isExtension: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-aseprite', dir: 'packages/exojs-aseprite', isExtension: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-ldtk', dir: 'packages/exojs-ldtk', isExtension: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-react', dir: 'packages/exojs-react', isExtension: true, inOfflineSmoke: false },
  { name: '@codexo/exojs-tilemap-physics', dir: 'packages/exojs-tilemap-physics', isExtension: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-lighting', dir: 'packages/exojs-lighting', isExtension: true, inOfflineSmoke: true },
  { name: '@codexo/exojs-pathfinding', dir: 'packages/exojs-pathfinding', isExtension: true, inOfflineSmoke: true },
] as const satisfies readonly LockstepPackage[];

/**
 * Published packages that are deliberately NOT on the engine's lockstep version
 * line, with the reason each one is off it.
 *
 * A package belongs here when its version means something different from "the
 * engine release this goes with": build tooling a consumer keeps in
 * `devDependencies` across engine upgrades, and the app scaffolder, which is
 * installed once and never pinned. Enumerating them is what lets
 * `verify:release-matrix` assert the independence instead of silently ignoring
 * whatever is missing from `LOCKSTEP_PACKAGES`.
 */
export interface IndependentPackage {
  /** npm package name. */
  readonly name: string;
  /** Package directory relative to the repo root. */
  readonly dir: string;
  /** Why this package is not on the lockstep line. */
  readonly reason: string;
}

export const INDEPENDENT_PACKAGES = [
  {
    name: '@codexo/exojs-build',
    dir: 'packages/exojs-build',
    reason: 'build-time tooling; a consumer keeps one version across engine upgrades and it depends on no engine API',
  },
  {
    name: 'create-exo-app',
    dir: 'packages/create-exo-app',
    reason: 'app scaffolder; run once via npx, never pinned to an engine version',
  },
  {
    name: '@codexo/exojs-cli',
    dir: 'packages/exojs-cli',
    reason: 'project tooling; installed once via npx and never pinned to an engine version, and it depends on no engine API',
  },
  {
    name: '@codexo/eslint-plugin-exojs',
    dir: 'packages/eslint-plugin-exojs',
    reason: 'lint tooling; a consumer keeps one version in devDependencies across engine upgrades and its rules read source text, not engine API',
  },
] as const satisfies readonly IndependentPackage[];

/**
 * The independent packages judged against the published-tooling policy profile
 * (`verifyToolingPackage`): a library published from this repository that ships
 * `dist/esm`, is imported rather than executed, and depends on no engine API.
 *
 * `create-exo-app` and `@codexo/exojs-cli` are deliberately absent. Both are
 * `bin` entry points rather than libraries, so the profile's `exports`,
 * `sideEffects` and no-engine-dependency expectations do not describe them -
 * the CLI legitimately depends on the engine to read back what it packs.
 */
const TOOLING_PACKAGE_NAMES = new Set<string>(['@codexo/exojs-build', '@codexo/eslint-plugin-exojs']);

export const TOOLING_PACKAGES = INDEPENDENT_PACKAGES.filter(p => TOOLING_PACKAGE_NAMES.has(p.name));

/** Union of the official package names (literal type, preserved for `OfficialPackageName`). */
export type OfficialPackageName = (typeof LOCKSTEP_PACKAGES)[number]['name'];

/** The extension subset (everything except Core). */
export const EXTENSION_PACKAGES = LOCKSTEP_PACKAGES.filter(p => p.isExtension);
