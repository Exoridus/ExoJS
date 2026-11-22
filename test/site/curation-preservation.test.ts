// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import catalog from '../../docs/curation/catalog.json';
import {
  getCuratedExamples,
  getNextPlaygroundHighlight,
  getPlaygroundDefault,
  getPlaygroundHighlights,
  getPlaygroundNavigation,
} from '../../site/src/lib/curation-catalog';
import { EXAMPLE_ALIASES, resolveExampleAlias } from '../../site/src/lib/example-aliases';
import { getRunnableExamples } from '../../site/src/lib/examples-catalog';

describe('runnable curriculum preservation', () => {
  it('offers four ordered experiments without duplicating or changing catalog entries', () => {
    const entries = [...getPlaygroundNavigation().values()].flat();
    const highlights = getPlaygroundHighlights(entries);
    expect(highlights.map(example => example.path)).toEqual([
      'physics/sprite-follows-body.js',
      'tweens-animation/tween-basics.js',
      'filters/custom-fragment-shader.js',
      'showcase/boss-intro-cinematic.js',
    ]);

    for (const example of highlights) {
      expect(entries.find(entry => entry.path === example.path)).toBe(example);
    }

    expect(getPlaygroundDefault(entries)).toBe(highlights[0]);
    expect(getNextPlaygroundHighlight(entries, highlights[0]!.path)).toBe(highlights[1]);
    expect(getNextPlaygroundHighlight(entries, highlights[3]!.path)).toBe(highlights[0]);
    expect(getNextPlaygroundHighlight(entries, 'getting-started/hello-world.js')).toBe(highlights[0]);
  });

  it('respects explicit featured opt-outs and missing examples in older catalogs', () => {
    const entries = [...getPlaygroundNavigation().values()].flat();
    const physics = entries.find(example => example.path === 'physics/sprite-follows-body.js')!;
    const lesson = entries.find(example => example.path === 'getting-started/hello-world.js')!;
    expect(getPlaygroundHighlights([{ ...physics, featured: false }, lesson])).toEqual([]);
    expect(getPlaygroundDefault([lesson])).toBe(lesson);
    expect(getPlaygroundDefault([])).toBeNull();
    expect(getNextPlaygroundHighlight([], physics.path)).toBeNull();
    expect(getNextPlaygroundHighlight([physics], physics.path)).toBeNull();
  });

  it('resolves every original source and every historical alias without discarding its code', () => {
    const entries = getRunnableExamples();
    const paths = new Set(entries.map(entry => entry.path));
    expect(paths.size).toBe(entries.length);

    for (const entry of entries) {
      // The catalog addresses generated .js, but clean checkouts only track the .ts sources.
      expect(existsSync(`examples/${entry.path.replace(/\.js$/, '.ts')}`)).toBe(true);
    }

    for (const contract of catalog.contracts) {
      const path = contract.source.replace(/^examples\//, '').replace(/\.ts$/, '.js');
      expect(paths.has(path)).toBe(true);
      expect(existsSync(contract.source)).toBe(true);

      for (const destination of contract.destinations) {
        expect(existsSync(destination)).toBe(true);
      }
    }

    for (const alias of Object.keys(EXAMPLE_ALIASES)) {
      expect(paths.has(resolveExampleAlias(alias))).toBe(true);
    }
  });
  it('includes the learning path and other runnable entries in one explorer', () => {
    const curated = getCuratedExamples();
    expect(curated).toHaveLength(48);
    const navigation = getPlaygroundNavigation();
    expect(new Set(curated.map(entry => entry.path)).size).toBe(48);
    const preserved = [...navigation.values()].flat();
    expect(new Set(preserved.map(entry => entry.path))).toEqual(
      new Set(getRunnableExamples().map(entry => resolveExampleAlias(entry.path))),
    );
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
