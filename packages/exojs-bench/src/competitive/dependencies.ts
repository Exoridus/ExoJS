import { type LibraryProvenance, readLibraryProvenance } from '../shared/provenance';

/** Packages each competitive engine imports in the benchmark page. */
const COMPETITOR_PACKAGES: Readonly<Record<string, readonly string[]>> = {
  pixi: ['pixi.js', '@pixi/tilemap', '@pixi/layout'],
  phaser: ['phaser'],
};

export const requiredCompetitivePackages = (engines: readonly string[]): string[] =>
  [...new Set(engines.flatMap(engine => COMPETITOR_PACKAGES[engine] ?? []))].sort();

/**
 * The required competitor packages whose installed manifest is missing or
 * unreadable. Competitors are devDependencies of this package, so a hit means
 * the workspace install is incomplete.
 */
export const inspectCompetitiveDependencies = (
  engines: readonly string[],
  read: (names: readonly string[]) => LibraryProvenance[] = readLibraryProvenance,
): LibraryProvenance[] => {
  const required = requiredCompetitivePackages(engines);

  if (required.length === 0) {
    return [];
  }

  const installed = new Map(read(required).map(entry => [entry.name, entry]));

  return required.flatMap(name => {
    const record = installed.get(name) ?? { name, version: 'not-installed', resolvedFrom: '' };

    return ['not-installed', 'unreadable', 'unknown'].includes(record.version) ? [record] : [];
  });
};
