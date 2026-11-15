// @vitest-environment node

import { assertCompetitiveDependencies, requiredCompetitivePackages } from '../src/competitive/dependencies';
import type { LibraryProvenance } from '../src/shared/provenance';

const installed = (names: readonly string[]): LibraryProvenance[] =>
  names.map(name => ({ name, version: '8.19.0', resolvedFrom: `/fixture/${name}/package.json` }));

describe('competitive dependency preflight', () => {
  test('checks only competitors actually selected for a run', () => {
    expect(requiredCompetitivePackages(['exojs'])).toEqual([]);
    expect(requiredCompetitivePackages(['exojs', 'pixi'])).toEqual(['@pixi/layout', '@pixi/tilemap', 'pixi.js']);
    expect(requiredCompetitivePackages(['pixi', 'phaser', 'pixi'])).toEqual(['@pixi/layout', '@pixi/tilemap', 'phaser', 'pixi.js']);

    const read = vi.fn(installed);
    assertCompetitiveDependencies(['exojs'], read);
    expect(read).not.toHaveBeenCalled();

    assertCompetitiveDependencies(['exojs', 'pixi'], read);
    expect(read).toHaveBeenCalledWith(['@pixi/layout', '@pixi/tilemap', 'pixi.js']);
  });

  test.each(['not-installed', 'unreadable', 'unknown'] as const)(
    'fails before launching browsers when a required package is %s',
    version => {
      const read = (names: readonly string[]): LibraryProvenance[] =>
        installed(names).map(item => (item.name === 'pixi.js' ? { ...item, version } : item));

      expect(() => assertCompetitiveDependencies(['exojs', 'pixi'], read)).toThrow(
        /pixi\.js.*pnpm --filter @codexo\/exojs-bench bench:setup/,
      );
    },
  );

  test('detects missing Pixi extension dependencies even if Pixi itself exists', () => {
    const read = (names: readonly string[]): LibraryProvenance[] => installed(names.filter(name => name !== '@pixi/layout'));

    expect(() => assertCompetitiveDependencies(['pixi'], read)).toThrow(/@pixi\/layout/);
  });
});
