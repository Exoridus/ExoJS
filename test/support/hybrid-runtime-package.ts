/**
 * Packs the built Core package (and optionally adapters) and installs the
 * tarballs into a throwaway project outside the repository, for the release
 * tests that judge what a consumer of the published runtime actually gets.
 *
 * These tests read built output. They skip when `dist/` has not been built -
 * unless `EXOJS_REQUIRE_PRODUCTION_BUILD=1` demands them, as the build lane
 * does. `EXOJS_HYBRID_PACKAGE_DIR` points them at another checkout's built Core
 * (for example a baseline build) instead of this repository's.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createConsumerProject, packPackage } from '../../scripts/release/external-consumers';

export const repoRoot = resolve(import.meta.dirname, '..', '..');

/** The Core package directory under test. */
export const corePackageDir = resolve(process.env['EXOJS_HYBRID_PACKAGE_DIR'] ?? repoRoot);

const mustHaveBuild = process.env['EXOJS_REQUIRE_PRODUCTION_BUILD'] === '1';

/** Whether the tests should run: the build exists, or the lane demands it (and a missing build then fails). */
export const runsAgainstBuild = (requiredFiles: readonly string[]): boolean =>
  mustHaveBuild || requiredFiles.every(file => existsSync(resolve(corePackageDir, file)));

export interface InstalledConsumer {
  /** Consumer project directory. */
  readonly dir: string;
  /** Installed Core package directory inside the consumer. */
  readonly coreDir: string;
  readonly dispose: () => void;
}

/** Packs Core plus the given workspace package directories and installs them, offline, into a fresh consumer. */
export const installHybridConsumer = (adapterDirs: readonly string[] = []): InstalledConsumer => {
  const staging = mkdtempSync(join(tmpdir(), 'exo-hybrid-pack-'));
  const tarballs = [corePackageDir, ...adapterDirs.map(dir => resolve(repoRoot, dir))].map(dir => packPackage(dir, staging));
  const { dir, install } = createConsumerProject(tarballs);
  rmSync(staging, { recursive: true, force: true });

  const dispose = (): void => rmSync(dir, { recursive: true, force: true });

  if (!install.ok) {
    dispose();

    throw new Error(`consumer install failed: ${install.detail ?? 'unknown'}`);
  }

  return { dir, coreDir: join(dir, 'node_modules', '@codexo', 'exojs'), dispose };
};
