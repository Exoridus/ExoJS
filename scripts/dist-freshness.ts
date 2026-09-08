/**
 * Which build units the dist-consuming steps depend on, and whether each is
 * current.
 *
 * Shared by the freshness gate (which refuses to run a step against a stale
 * build) and the doctor (which reports it as one line among the other
 * prerequisites). A unit is stale when the content hash of its sources no
 * longer matches the stamp its dist recorded at build time; a unit that was
 * never built is reported separately, because the consuming step's own error
 * for that case is usually a wall of unresolved imports rather than the cause.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashSourceTree, readSourceStamp } from './source-hash.ts';

export const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export interface BuildUnit {
  readonly name: string;
  readonly sourceDir: string;
  readonly distDir: string;
  /** Whether the dist directory holds an emitted entry point. */
  readonly built: boolean;
}

/**
 * Packages that own their outputs and are never bundled by a dist-consuming
 * step. The CLI is one: it emits a flat `dist/index.js` through its own tsc
 * build rather than the shared library pipeline's `dist/esm/`, so read as a
 * library unit it would look never built on every machine.
 */
const TOOLING_PACKAGES = new Set(['exojs-build', 'exojs-config', 'exojs-bench', 'exojs-examples', 'exojs-cli']);

/** Core plus every runtime extension package, whether or not it has been built. */
export const collectBuildUnits = (): BuildUnit[] => {
  const units: BuildUnit[] = [
    {
      name: '@codexo/exojs',
      sourceDir: join(repoRoot, 'src'),
      distDir: join(repoRoot, 'dist'),
      built: existsSync(join(repoRoot, 'dist', 'esm', 'index.js')),
    },
  ];

  for (const entry of readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('exojs-') || TOOLING_PACKAGES.has(entry.name)) continue;

    const dir = join(repoRoot, 'packages', entry.name);
    const sourceDir = join(dir, 'src');
    const distDir = join(dir, 'dist');

    // Only packages built through the shared library pipeline carry a stamp.
    if (!existsSync(sourceDir) || !existsSync(join(dir, 'tsconfig.build.json'))) continue;

    units.push({ name: `@codexo/${entry.name}`, sourceDir, distDir, built: existsSync(join(distDir, 'esm', 'index.js')) });
  }

  return units;
};

export interface FreshnessReport {
  readonly units: readonly BuildUnit[];
  /** One reason per unit whose dist lags its sources. */
  readonly stale: readonly string[];
  /** Units with no emitted dist at all. */
  readonly unbuilt: readonly BuildUnit[];
}

export const checkFreshness = (units: readonly BuildUnit[] = collectBuildUnits()): FreshnessReport => {
  const stale: string[] = [];
  const unbuilt: BuildUnit[] = [];

  for (const unit of units) {
    if (!unit.built) {
      unbuilt.push(unit);
      continue;
    }

    const recorded = readSourceStamp(unit.distDir);

    if (recorded === null) {
      stale.push(`${unit.name}: ${relative(repoRoot, unit.distDir)} carries no source stamp (built before stamps existed, or not at all)`);
    } else if (recorded !== hashSourceTree(unit.sourceDir)) {
      stale.push(`${unit.name}: ${relative(repoRoot, unit.sourceDir)} changed since ${relative(repoRoot, unit.distDir)} was built`);
    }
  }

  return { units, stale, unbuilt };
};

/** The one command that brings every unit up to date. */
export const REBUILD_COMMAND = 'pnpm build:all';
