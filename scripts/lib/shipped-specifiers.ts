/**
 * How a specifier written in Core or runtime-module source resolves once the
 * Core package is installed, expressed as a file inside `dist/esm`.
 *
 * Runtime modules ship inside the Core tarball, so every import a module makes
 * of `@codexo/exojs`, of another Core subpath, or of a sibling module has to
 * land on the very file the Core manifest exports for that specifier - that is
 * what keeps a single Core instance under Node, bundlers and import maps. The
 * build therefore never invents a target: it reads the Core `exports` map (and,
 * for package-private `#` keys, the owning package's `imports` map) the way an
 * installed consumer would, and renders the result as a relative path.
 */
import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { RUNTIME_MODULES } from '../release/lockstep-packages.ts';

export type ShippedKind = 'js' | 'types';

export interface ShippedModule {
  readonly name: string;
  readonly subpath: string;
  /** Absolute source package directory. */
  readonly packageDir: string;
  /** Absolute `src` directory of the source package. */
  readonly sourceRoot: string;
}

export interface ShippedLayout {
  readonly repoRoot: string;
  /** Absolute `dist/esm` directory of the Core package. */
  readonly distEsm: string;
  /** Absolute Core `src` directory. */
  readonly coreSourceRoot: string;
  readonly modules: readonly ShippedModule[];
}

interface PackageManifest {
  readonly exports?: Record<string, unknown>;
  readonly imports?: Record<string, unknown>;
}

const CORE_NAME = '@codexo/exojs';

/** Conditions a source checkout activates so `#` keys resolve to TypeScript sources. */
export const SOURCE_CONDITIONS: readonly string[] = ['@codexo/exojs-source', '@codexo/exojs-particles-source'];

const readManifest = (dir: string): PackageManifest => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageManifest;

const isWithin = (file: string, dir: string): boolean => {
  const rel = relative(dir, file);

  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel);
};

export const createShippedLayout = (repoRoot: string): ShippedLayout => ({
  repoRoot,
  distEsm: resolve(repoRoot, 'dist', 'esm'),
  coreSourceRoot: resolve(repoRoot, 'src'),
  modules: RUNTIME_MODULES.map(module => ({
    name: module.name,
    subpath: module.subpath,
    packageDir: resolve(repoRoot, module.dir),
    sourceRoot: resolve(repoRoot, module.dir, 'src'),
  })),
});

/** The runtime module whose source tree contains `file`, if any. */
export const moduleOfSource = (layout: ShippedLayout, file: string): ShippedModule | undefined =>
  layout.modules.find(module => isWithin(file, module.sourceRoot));

/** The runtime module whose shipped subtree contains `file` (a path under `dist/esm`), if any. */
export const moduleOfShipped = (layout: ShippedLayout, file: string): ShippedModule | undefined =>
  layout.modules.find(module => isWithin(file, join(layout.distEsm, module.subpath)));

/**
 * The extensionless `dist/esm` location a Core or runtime-module source file
 * ships at, or `undefined` for a file outside every shipped source tree.
 */
export const shippedPathForSource = (layout: ShippedLayout, sourceFile: string): string | undefined => {
  const withoutExtension = sourceFile.replace(/\.(?:d\.)?[cm]?tsx?$/, '');
  const module = moduleOfSource(layout, sourceFile);

  if (module) {
    return join(layout.distEsm, module.subpath, relative(module.sourceRoot, withoutExtension));
  }

  if (isWithin(sourceFile, layout.coreSourceRoot)) {
    return join(layout.distEsm, relative(layout.coreSourceRoot, withoutExtension));
  }

  return undefined;
};

const pickTarget = (entry: unknown, conditions: readonly string[]): string | undefined => {
  if (typeof entry === 'string') {
    return entry;
  }

  if (entry === null || typeof entry !== 'object') {
    return undefined;
  }

  for (const [condition, value] of Object.entries(entry as Record<string, unknown>)) {
    if (conditions.includes(condition)) {
      const target = pickTarget(value, conditions);

      if (target !== undefined) {
        return target;
      }
    }
  }

  return undefined;
};

/**
 * Resolves `@codexo/exojs` or `@codexo/exojs/<subpath>` through the Core
 * manifest's `exports`, returning the absolute target for the requested kind,
 * or `undefined` when the specifier is not a Core specifier. Throws for a Core
 * specifier the manifest does not export for that kind (a value import of the
 * types-only `./extensions`, a misspelt subpath): either would ship a dangling
 * import.
 */
export const resolveCoreExport = (layout: ShippedLayout, specifier: string, kind: ShippedKind): string | undefined => {
  if (specifier !== CORE_NAME && !specifier.startsWith(`${CORE_NAME}/`)) {
    return undefined;
  }

  const key = specifier === CORE_NAME ? '.' : `./${specifier.slice(CORE_NAME.length + 1)}`;
  const entry = readManifest(layout.repoRoot).exports?.[key];
  const target = pickTarget(entry, kind === 'types' ? ['types'] : ['import', 'default']);

  if (target === undefined) {
    throw new Error(`"${specifier}" has no ${kind === 'types' ? 'types' : 'runtime'} target in the Core package exports.`);
  }

  return resolve(layout.repoRoot, target);
};

/**
 * Resolves a package-private `#` specifier through the `imports` map of the
 * package at `packageDir`, under the source conditions, to the absolute source
 * file it names. Supports exact keys and single-`*` patterns, exact keys first,
 * as Node does.
 */
export const resolvePackageImportSource = (packageDir: string, specifier: string): string | undefined => {
  const imports = readManifest(packageDir).imports ?? {};
  const exact = imports[specifier];

  if (exact !== undefined) {
    const target = pickTarget(exact, SOURCE_CONDITIONS);

    return target === undefined ? undefined : resolve(packageDir, target);
  }

  for (const [key, entry] of Object.entries(imports)) {
    const star = key.indexOf('*');

    if (star === -1) {
      continue;
    }

    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);

    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix) || specifier.length < key.length - 1) {
      continue;
    }

    const target = pickTarget(entry, SOURCE_CONDITIONS);

    if (target !== undefined) {
      return resolve(packageDir, target.replace('*', specifier.slice(prefix.length, specifier.length - suffix.length)));
    }
  }

  return undefined;
};

/** A relative module specifier from `fromFile` to `toFile`, in POSIX form with a leading `./` or `../`. */
export const relativeSpecifier = (fromFile: string, toFile: string): string => {
  const rel = relative(join(fromFile, '..'), toFile).replaceAll('\\', '/');

  return rel.startsWith('.') ? rel : `./${rel}`;
};
