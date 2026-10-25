// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import catalog from '../../docs/curation/catalog.json';
import { getCuratedExamples, getCuratedNavigation, getPreservationEntries } from '../../site/src/lib/curation-catalog';
import { EXAMPLE_ALIASES, resolveExampleAlias } from '../../site/src/lib/example-aliases';
import { getRunnableExamples } from '../../site/src/lib/examples-catalog';

describe('runnable curriculum preservation', () => {
  it('resolves every original source and every historical alias without discarding its code', () => {
    const entries = getRunnableExamples();
    const paths = new Set(entries.map(entry => entry.path));
    expect(paths.size).toBe(entries.length);

    for (const entry of entries) {
      expect(existsSync(`examples/${entry.path}`)).toBe(true);
    }

    for (const contract of catalog.contracts) {
      const path = contract.source.replace(/^examples\//, '').replace(/\.ts$/, '.js');
      expect(paths.has(path)).toBe(true);
      expect(existsSync(`examples/${path}`)).toBe(true);

      for (const destination of contract.destinations) {
        expect(existsSync(destination)).toBe(true);
      }
    }

    for (const alias of Object.keys(EXAMPLE_ALIASES)) {
      expect(paths.has(resolveExampleAlias(alias))).toBe(true);
    }
  });
  it('offers exactly 48 independent normal targets and separate runnable preservation entries', () => {
    const curated = getCuratedExamples();
    expect(curated).toHaveLength(48);
    const navigation = getCuratedNavigation();
    expect(navigation.size).toBe(10);
    expect([...navigation.values()].flat().map(entry => entry.order)).toEqual(Array.from({ length: 48 }, (_, index) => index + 1));
    expect(new Set(curated.map(entry => entry.path)).size).toBe(48);
    const preserved = getPreservationEntries();
    expect(preserved).toHaveLength(66);
    expect(preserved.filter(entry => entry.kind === 'merge')).toHaveLength(12);
    expect(preserved.some(entry => entry.path === 'tilemap/hexagonal-grid.js')).toBe(true);
    expect(preserved.some(entry => entry.path === 'audio-fx/gpu-pcm-stream.js')).toBe(true);
    expect(preserved.some(entry => entry.path === 'tilemap/worker-streamed-terrain.js')).toBe(true);
    expect(preserved.some(entry => entry.path === 'filters/color-matrix-filter.js')).toBe(true);
    expect(preserved.filter(entry => entry.path.startsWith('guide-fixtures/'))).toHaveLength(3);
  });
  it('gives every target a directed, valid prerequisite and next-step path', () => {
    const entries = getCuratedExamples();

    const visit = (id: number, seen = new Set<number>()): void => {
      expect(seen.has(id)).toBe(false);
      const entry = entries.find(target => target.number === id)!;
      expect(entry).toBeDefined();

      for (const dependency of entry.prerequisites) {
        visit(dependency, new Set([...seen, id]));
      }
    };

    for (const entry of entries) {
      visit(entry.number);

      for (const id of entry.next) {
        expect(entries.some(target => target.number === id)).toBe(true);
      }
    }

    expect(entries.find(entry => entry.number === 4)?.optional).toBe(true);
    expect(entries.find(entry => entry.number === 5)?.role).toBe('capstone');
  });
});

it('pins current-source guide links to the current Playground version', () => {
  const source = readFileSync('site/src/components/ExamplePreview.astro', 'utf8');
  expect(source).toContain('/playground/?version=current&example=');
});
