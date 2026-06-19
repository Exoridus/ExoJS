/**
 * Prepare/verify stage of the coordinated release.
 *
 * Build-once contract: the caller builds the four official packages exactly
 * once; this stage packs them WITHOUT re-running their build (`--ignore-scripts`
 * skips `prepack`), hashes the resulting tarballs, and records the digests in a
 * `release-manifest.json` + `checksums.sha256`. The `publish` stage then
 * re-hashes those same files and refuses to publish on any drift.
 *
 * Read-only against the registry: nothing here talks to npm beyond `pnpm pack`.
 */
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import type { CommandRunner } from './command-runner.ts';
import {
  PUBLISH_ORDER,
  type OfficialPackageName,
  type ReleaseManifest,
  renderChecksums,
  serializeManifest,
  sha256File,
  type TarballRecord,
} from './manifest.ts';

export interface OfficialPackage {
  name: OfficialPackageName;
  /** Absolute package directory. */
  dir: string;
}

export interface PrepareOptions {
  rootDir: string;
  /** Absolute directory the tarballs + manifest are written into. */
  stagingDir: string;
  /** Full source-control revision SHA. Must not be "unknown". */
  revision: string;
}

const readVersion = (packageJsonPath: string): { name: string; version: string } => {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name: string; version: string };
  return { name: pkg.name, version: pkg.version };
};

/** Resolves the six official packages in canonical publish order (PUBLISH_ORDER). */
export const officialPackages = (rootDir: string): OfficialPackage[] => [
  { name: '@codexo/exojs', dir: rootDir },
  { name: '@codexo/exojs-particles', dir: resolve(rootDir, 'packages/exojs-particles') },
  { name: '@codexo/exojs-tilemap', dir: resolve(rootDir, 'packages/exojs-tilemap') },
  { name: '@codexo/exojs-tiled', dir: resolve(rootDir, 'packages/exojs-tiled') },
  { name: '@codexo/exojs-physics', dir: resolve(rootDir, 'packages/exojs-physics') },
  { name: '@codexo/exojs-audio-fx', dir: resolve(rootDir, 'packages/exojs-audio-fx') },
];

/**
 * Asserts all official packages share one lockstep version and returns it.
 * Throws otherwise — a coordinated release must be version-coherent.
 */
export const assertLockstepVersion = (packages: OfficialPackage[]): string => {
  const versions = packages.map(p => ({ ...p, ...readVersion(resolve(p.dir, 'package.json')) }));
  const unique = new Set(versions.map(v => v.version));
  if (unique.size !== 1) {
    throw new Error(`Lockstep version mismatch: ${versions.map(v => `${v.name}@${v.version}`).join(', ')}`);
  }
  return [...unique][0];
};

/**
 * Packs the official packages into `stagingDir` without rebuilding them
 * (`--ignore-scripts` so `prepack` does not fire). Returns the absolute tarball
 * path for each, in publish order. Throws if any pack fails or a tarball is
 * missing — a coordinated release cannot have a hole in the matrix.
 */
export const packOfficialTarballs = (
  runner: CommandRunner,
  packages: OfficialPackage[],
  stagingDir: string,
): Array<{ pkg: OfficialPackage; tarball: string }> => {
  mkdirSync(stagingDir, { recursive: true });
  const out: Array<{ pkg: OfficialPackage; tarball: string }> = [];

  for (const pkg of packages) {
    const result = runner.run({
      command: 'pnpm',
      args: ['pack', '--pack-destination', stagingDir, '--config.ignore-scripts=true'],
      cwd: pkg.dir,
    });
    if (result.code !== 0) {
      throw new Error(`pnpm pack failed for ${pkg.name}:\n${result.stderr || result.stdout}`);
    }
    const { version } = readVersion(resolve(pkg.dir, 'package.json'));
    const scoped = pkg.name.replace('@', '').replace('/', '-');
    const tarball = resolve(stagingDir, `${scoped}-${version}.tgz`);
    out.push({ pkg, tarball });
  }

  return out;
};

/** Builds a release manifest from the packed tarballs (hashing each one). */
export const buildManifest = (version: string, revision: string, packed: Array<{ pkg: OfficialPackage; tarball: string }>): ReleaseManifest => {
  const shortRevision = revision.length >= 7 ? revision.slice(0, 7) : revision;

  const packages: TarballRecord[] = packed
    .map(({ pkg, tarball }) => {
      const { sha256, bytes } = sha256File(tarball);
      return { name: pkg.name, version, file: basename(tarball), sha256, bytes };
    })
    .sort((a, b) => PUBLISH_ORDER.indexOf(a.name) - PUBLISH_ORDER.indexOf(b.name));

  return {
    version,
    revision,
    shortRevision,
    tag: `v${version}`,
    generatedAt: new Date().toISOString(),
    publishOrder: [...PUBLISH_ORDER],
    packages,
  };
};

export interface PrepareResult {
  manifest: ReleaseManifest;
  manifestPath: string;
  checksumsPath: string;
  tarballs: string[];
}

/**
 * End-to-end prepare: packs the six tarballs into a clean staging dir, hashes
 * them, and writes `release-manifest.json` + `checksums.sha256`. The caller is
 * responsible for having built the packages first (build-once).
 *
 * The revision must be a full (non-"unknown", non-dirty) SHA frozen by the
 * orchestrator. Release-preparation must fail before calling this if the working
 * tree is dirty or no revision can be determined.
 */
export const prepareRelease = (runner: CommandRunner, options: PrepareOptions): PrepareResult => {
  if (options.revision === 'unknown') {
    throw new Error('Cannot prepare a release with an unknown revision.');
  }

  const packages = officialPackages(options.rootDir);
  const version = assertLockstepVersion(packages);

  rmSync(options.stagingDir, { recursive: true, force: true });
  mkdirSync(options.stagingDir, { recursive: true });

  const packed = packOfficialTarballs(runner, packages, options.stagingDir);
  const manifest = buildManifest(version, options.revision, packed);

  const manifestPath = resolve(options.stagingDir, 'release-manifest.json');
  const checksumsPath = resolve(options.stagingDir, 'checksums.sha256');
  writeFileSync(manifestPath, serializeManifest(manifest), 'utf8');
  writeFileSync(checksumsPath, renderChecksums(manifest), 'utf8');

  return {
    manifest,
    manifestPath,
    checksumsPath,
    tarballs: packed.map(p => p.tarball),
  };
};
