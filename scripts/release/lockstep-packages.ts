/**
 * Single source of truth for the ExoJS release matrix: which workspace package
 * plays which role, which ones are released on the engine's lockstep line, and
 * which runtime modules the Core build compiles into its own tarball.
 *
 * Every release script derives its package list from here - `manifest.ts`
 * (PUBLISH_ORDER), `prepare.ts` (officialPackages), `cut.ts` (bump targets),
 * `run.ts` (build set), `external-consumers.ts` (offline smoke set),
 * `scripts/build.ts` (the runtime modules built into Core), and the `verify-*`
 * gates. Adding the N-th package is a single entry in one of these arrays
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
 *   - `site/scripts/sync-exo-vendor.ts` vendor tree - a smaller, site-owned
 *     set (the offline examples site only embeds packages it uses).
 */

/**
 * What a workspace package is to the release, which decides how it is built,
 * checked and published:
 *
 * - `core`: `@codexo/exojs` itself, built at the repository root.
 * - `runtime-module`: an optional engine module whose sources live in their own
 *   workspace directory but ship inside the Core tarball as a subpath export.
 *   Never published under its own name.
 * - `adapter`: a separately published library loaded by a running engine; it
 *   declares the engine as a peer and its built tree is vendored into the
 *   offline full-zip release.
 * - `tooling`: build, lint, project and scaffolding tools.
 * - `content`: optional data packages with no engine code of their own.
 * - `legacy-shim`: a forwarding package that keeps a retired name importable.
 *   Not part of the supported product set: it is versioned and published only
 *   when its forwarders change (`releasesWithEveryCut`).
 */
export type PackageRole = 'core' | 'runtime-module' | 'adapter' | 'tooling' | 'content' | 'legacy-shim';

/** Roles whose packages are libraries loaded by a running engine and therefore declare it as a peer. */
const ENGINE_PEER_ROLES: ReadonlySet<PackageRole> = new Set(['adapter', 'legacy-shim']);

/** Whether a package declares `@codexo/exojs` as a peer and is vendored as an engine extension. */
export const isEngineExtension = (pkg: { readonly role: PackageRole }): boolean => ENGINE_PEER_ROLES.has(pkg.role);

/** Order is canonical PUBLISH_ORDER: Core first (peer of every extension), then extensions. */
export interface LockstepPackage {
  /** npm package name. */
  readonly name: string;
  /** Package directory relative to the repo root (`.` for Core). */
  readonly dir: string;
  /**
   * Release role. Being on the engine's version line is a separate question:
   * Core is on the line but is not an extension, and so is the app scaffolder,
   * which moves with the engine release but is a command that writes a project
   * rather than a library the engine loads, so it declares no engine peer and
   * has no vendored runtime tree.
   */
  readonly role: Exclude<PackageRole, 'runtime-module'>;
  /**
   * Whether the package participates in the offline external-consumer smoke
   * (`npm install --offline` + Node/TS import in a throwaway project). `react`
   * is excluded: its `react`/`react-dom` peers are not resolvable offline.
   */
  readonly inOfflineSmoke: boolean;
  /**
   * How the package-policy gate judges the package. A lockstep package is
   * normally an imported library; `create-exo-app` ships a command-line
   * executable, so the runtime profile's `dist/esm` expectations do not describe
   * it.
   */
  readonly profile?: 'runtime' | 'cli';
}

export const LOCKSTEP_PACKAGES = [
  { name: '@codexo/exojs', dir: '.', role: 'core', inOfflineSmoke: true },
  { name: '@codexo/exojs-tiled', dir: 'packages/exojs-tiled', role: 'adapter', inOfflineSmoke: true },
  { name: '@codexo/exojs-aseprite', dir: 'packages/exojs-aseprite', role: 'adapter', inOfflineSmoke: true },
  { name: '@codexo/exojs-ldtk', dir: 'packages/exojs-ldtk', role: 'adapter', inOfflineSmoke: true },
  { name: '@codexo/exojs-react', dir: 'packages/exojs-react', role: 'adapter', inOfflineSmoke: false },
  // The app scaffolder. It is on the engine's line because the version it
  // scaffolds is its own: `create-exo-app@0.19` writes a project that asks for
  // `@codexo/exojs@0.19.x`. The template source carries no engine version, so a
  // scaffolder-only patch never needs a template edit. It is not an extension -
  // see `role`.
  { name: 'create-exo-app', dir: 'packages/create-exo-app', role: 'tooling', inOfflineSmoke: false, profile: 'cli' },
] as const satisfies readonly LockstepPackage[];

/**
 * An optional engine module compiled into the Core package. Its sources stay in
 * their own workspace directory; the Core build emits them under
 * `dist/esm/<subpath>/` and the Core manifest exports them as
 * `@codexo/exojs/<subpath>`, so every consumer shares the one Core instance the
 * root entry loads.
 */
export interface RuntimeModule {
  /** Workspace package name of the source package. Private; never published. */
  readonly name: string;
  /** Source package directory relative to the repo root. */
  readonly dir: string;
  readonly role: 'runtime-module';
  /** Subpath under `@codexo/exojs` and directory under `dist/esm/`. */
  readonly subpath: string;
  /** The npm name the module was published under before it moved into Core. */
  readonly legacyName: string;
}

export const RUNTIME_MODULES = [
  {
    name: '@codexo/exojs-module-tilemap',
    dir: 'packages/exojs-tilemap',
    role: 'runtime-module',
    subpath: 'tilemap',
    legacyName: '@codexo/exojs-tilemap',
  },
  {
    name: '@codexo/exojs-module-particles',
    dir: 'packages/exojs-particles',
    role: 'runtime-module',
    subpath: 'particles',
    legacyName: '@codexo/exojs-particles',
  },
  {
    name: '@codexo/exojs-module-audio-fx',
    dir: 'packages/exojs-audio-fx',
    role: 'runtime-module',
    subpath: 'audio-fx',
    legacyName: '@codexo/exojs-audio-fx',
  },
  {
    name: '@codexo/exojs-module-physics',
    dir: 'packages/exojs-physics',
    role: 'runtime-module',
    subpath: 'physics',
    legacyName: '@codexo/exojs-physics',
  },
  {
    name: '@codexo/exojs-module-tilemap-physics',
    dir: 'packages/exojs-tilemap-physics',
    role: 'runtime-module',
    subpath: 'tilemap-physics',
    legacyName: '@codexo/exojs-tilemap-physics',
  },
  {
    name: '@codexo/exojs-module-lighting',
    dir: 'packages/exojs-lighting',
    role: 'runtime-module',
    subpath: 'lighting',
    legacyName: '@codexo/exojs-lighting',
  },
  {
    name: '@codexo/exojs-module-pathfinding',
    dir: 'packages/exojs-pathfinding',
    role: 'runtime-module',
    subpath: 'pathfinding',
    legacyName: '@codexo/exojs-pathfinding',
  },
] as const satisfies readonly RuntimeModule[];

/** The npm names the runtime modules were published under before they moved into Core. */
export type LegacyShimName = (typeof RUNTIME_MODULES)[number]['legacyName'];

/**
 * The one release line the legacy shims serve. Their Core peer is this line's
 * `.x` range: a later Core line is not promised to keep the forwarded surface,
 * so the shims are never moved onto it.
 */
export const LEGACY_SHIM_LINE = '0.20';

/** One export of a legacy shim package. */
export interface LegacyShimEntry {
  /** Export key in the shim manifest (`.` or `./<name>`). */
  readonly entry: string;
  /** The Core specifier whose bindings the entry forwards. */
  readonly target: string;
  /**
   * The bindings forwarded, where the target is wider than the retired entry it
   * replaces. Absent: the target's whole surface is forwarded.
   */
  readonly names?: { readonly values: readonly string[]; readonly types: readonly string[] };
}

/**
 * A retired runtime package name kept importable on {@link LEGACY_SHIM_LINE}.
 * The package holds forwarders only - every binding is the object the Core
 * subpath exports - and peers on Core alone.
 */
export interface LegacyShim {
  readonly name: LegacyShimName;
  /** Package directory relative to the repo root. */
  readonly dir: string;
  readonly role: 'legacy-shim';
  /** The Core subpath that replaced the package. */
  readonly subpath: string;
  readonly line: string;
  readonly entries: readonly LegacyShimEntry[];
}

/** Entries a retired package had beyond its root, keyed by runtime module subpath. */
const LEGACY_EXTRA_ENTRIES: Readonly<Record<string, readonly LegacyShimEntry[]>> = {
  physics: [
    {
      entry: './debug',
      target: '@codexo/exojs/debug',
      names: { values: ['PhysicsDebugDraw'], types: ['PhysicsDebugDrawOptions'] },
    },
  ],
};

export const LEGACY_SHIMS: readonly LegacyShim[] = RUNTIME_MODULES.map(module => ({
  name: module.legacyName,
  // Below `packages/legacy/` rather than beside the module sources: the source
  // directories keep the old names, and every discovery that walks the direct
  // children of `packages/` treats what it finds as an active product.
  dir: `packages/legacy/${module.legacyName.slice('@codexo/'.length)}`,
  role: 'legacy-shim',
  subpath: module.subpath,
  line: LEGACY_SHIM_LINE,
  entries: [{ entry: '.', target: `@codexo/exojs/${module.subpath}` }, ...(LEGACY_EXTRA_ENTRIES[module.subpath] ?? [])],
}));

/**
 * Whether a coordinated release gives the package a new version every time.
 * A legacy shim's files name Core subpaths rather than a Core version, so an
 * unchanged shim keeps serving every Core patch on its line: it gets a new
 * version only when the forwarders it publishes change (see
 * `legacy-shims.ts#planShimCut`), and is published only in the release that
 * sets that version.
 */
export const releasesWithEveryCut = (pkg: { readonly role: PackageRole }): boolean => pkg.role !== 'legacy-shim';

/**
 * Published packages that are deliberately NOT on the engine's lockstep version
 * line, with the reason each one is off it.
 *
 * A package belongs here when its version means something different from "the
 * engine release this goes with": build tooling a consumer keeps in
 * `devDependencies` across engine upgrades, and command-line utilities a
 * consumer runs without pinning to an engine release. Enumerating them is what
 * lets `verify:release-matrix` assert the independence instead of silently
 * ignoring whatever is missing from `LOCKSTEP_PACKAGES`.
 */
export interface IndependentPackage {
  /** npm package name. */
  readonly name: string;
  /** Package directory relative to the repo root. */
  readonly dir: string;
  readonly role: 'tooling' | 'content';
  /** Why this package is not on the lockstep line. */
  readonly reason: string;
}

export const INDEPENDENT_PACKAGES = [
  {
    name: '@codexo/exojs-build',
    dir: 'packages/exojs-build',
    role: 'tooling',
    reason: 'build-time tooling; a consumer keeps one version across engine upgrades and it depends on no engine API',
  },
  {
    name: '@codexo/exojs-cli',
    dir: 'packages/exojs-cli',
    role: 'tooling',
    reason: 'project tooling; installed once via npx and never pinned to an engine version, and it depends on no engine API',
  },
  {
    name: '@codexo/eslint-plugin-exojs',
    dir: 'packages/eslint-plugin-exojs',
    role: 'tooling',
    reason:
      'lint tooling; a consumer keeps one version in devDependencies across engine upgrades and its rules read source text, not engine API',
  },
] as const satisfies readonly IndependentPackage[];

/**
 * The independent packages judged against the published-tooling policy profile
 * (`verifyToolingPackage`): a library published from this repository that ships
 * `dist/esm`, is imported rather than executed, and depends on no engine API.
 *
 * `@codexo/exojs-cli` is deliberately absent. It is a `bin` entry point rather
 * than a library, so the profile's `exports`, `sideEffects` and
 * no-engine-dependency expectations do not describe it - the CLI legitimately
 * depends on the engine to read back what it packs.
 */
const TOOLING_PACKAGE_NAMES = new Set<string>(['@codexo/exojs-build', '@codexo/eslint-plugin-exojs']);

export const TOOLING_PACKAGES = INDEPENDENT_PACKAGES.filter(p => TOOLING_PACKAGE_NAMES.has(p.name));

/** Union of the names a coordinated release can publish (literal type). */
export type OfficialPackageName = (typeof LOCKSTEP_PACKAGES)[number]['name'] | LegacyShimName;

/** The engine-extension subset: published libraries that declare the engine as a peer. */
export const EXTENSION_PACKAGES = LOCKSTEP_PACKAGES.filter(isEngineExtension);

/**
 * Every workspace package the release knows about, by role. The published sets
 * above and the build set below are its projections; a package missing here is
 * neither built into Core nor published.
 */
export const RELEASE_MATRIX: ReadonlyArray<{ readonly name: string; readonly dir: string; readonly role: PackageRole }> = [
  ...LOCKSTEP_PACKAGES,
  ...RUNTIME_MODULES,
  ...INDEPENDENT_PACKAGES,
  ...LEGACY_SHIMS,
];
