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
 * Diagnostic only. Node's require-condition resolution can reject ESM-only
 * packages that Vite imports successfully. A negative result is not proof that
 * the package is absent, especially when pnpm uses Windows directory junctions.
 *
 * The browser's per-cell dynamic import is authoritative. Never block a
 * benchmark or recommend reinstalling based solely on this metadata lookup.
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
