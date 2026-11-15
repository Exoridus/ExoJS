import { type LibraryProvenance, readLibraryProvenance } from '../shared/provenance';

/**
 * The rendering competitor workspace is intentionally outside the root pnpm
 * workspace. A normal install is not equivalent to bench:setup.
 */
const COMPETITOR_PACKAGES: Readonly<Record<string, readonly string[]>> = {
  pixi: ['pixi.js', '@pixi/tilemap', '@pixi/layout'],
  phaser: ['phaser'],
};

export const requiredCompetitivePackages = (engines: readonly string[]): string[] =>
  [...new Set(engines.flatMap(engine => COMPETITOR_PACKAGES[engine] ?? []))].sort();

/**
 * Reject missing/broken competitor installations BEFORE writing an acquisition
 * directory or launching browsers. Otherwise every affected cell becomes
 * "unavailable" and the full seven-repetition campaign runs pointlessly.
 *
 * The resolution probe is injectable so tests do not require installed
 * competitors or network access.
 */
export const assertCompetitiveDependencies = (
  engines: readonly string[],
  read: (names: readonly string[]) => LibraryProvenance[] = readLibraryProvenance,
): void => {
  const required = requiredCompetitivePackages(engines);

  if (required.length === 0) {
    return;
  }

  const installed = new Map(read(required).map(entry => [entry.name, entry]));
  const missing = required.filter(name => {
    const version = installed.get(name)?.version;

    return version === undefined || ['not-installed', 'unreadable', 'unknown'].includes(version);
  });

  if (missing.length > 0) {
    throw new Error(
      `Competitor dependencies are missing or unreadable: ${missing.join(', ')}. Run "pnpm --filter @codexo/exojs-bench bench:setup" once from the repository root, then restart the benchmark. A regular "pnpm install" does not install this separate competitor workspace. No benchmark evidence directory was created for this attempt.`,
    );
  }
};
