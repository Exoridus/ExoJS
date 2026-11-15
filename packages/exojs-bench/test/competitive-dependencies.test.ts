// @vitest-environment node

import { inspectCompetitiveDependencies, requiredCompetitivePackages } from '../src/competitive/dependencies';
import type { LibraryProvenance } from '../src/shared/provenance';

const installed = (names: readonly string[]): LibraryProvenance[] =>
  names.map(name => ({ name, version: '8.19.0', resolvedFrom: `/fixture/${name}/package.json` }));

describe('competitive dependency metadata diagnostic', () => {
  test('checks only packages required by the selected engines', () => {
    expect(requiredCompetitivePackages(['exojs'])).toEqual([]);
    expect(requiredCompetitivePackages(['exojs', 'pixi'])).toEqual(['@pixi/layout', '@pixi/tilemap', 'pixi.js']);
    expect(requiredCompetitivePackages(['pixi', 'phaser', 'pixi'])).toEqual(['@pixi/layout', '@pixi/tilemap', 'phaser', 'pixi.js']);

    const read = vi.fn(installed);
    expect(inspectCompetitiveDependencies(['exojs'], read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();

    expect(inspectCompetitiveDependencies(['exojs', 'pixi'], read)).toEqual([]);
    expect(read).toHaveBeenCalledWith(['@pixi/layout', '@pixi/tilemap', 'pixi.js']);
  });

  test.each(['not-installed', 'unreadable', 'unknown'] as const)(
    'records %s as an inconclusive metadata lookup, never throwing',
    version => {
      const read = (names: readonly string[]): LibraryProvenance[] =>
        installed(names).map(item => (item.name === 'pixi.js' ? { ...item, version } : item));

      expect(inspectCompetitiveDependencies(['exojs', 'pixi'], read)).toEqual([
        { name: 'pixi.js', version, resolvedFrom: '/fixture/pixi.js/package.json' },
      ]);
    },
  );

  test('records missing scoped-package metadata without blocking browser import', () => {
    const read = (names: readonly string[]): LibraryProvenance[] => installed(names.filter(name => name !== '@pixi/layout'));

    expect(inspectCompetitiveDependencies(['pixi'], read)).toEqual([
      { name: '@pixi/layout', version: 'not-installed', resolvedFrom: '' },
    ]);
  });
});
