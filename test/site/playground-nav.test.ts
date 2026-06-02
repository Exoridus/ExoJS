import { describe, expect, it } from 'vitest';

import { CHAPTERS } from '../../site/src/lib/chapters';
import { EXAMPLES_CATALOG } from '../../site/src/lib/examples-catalog';
import { buildPlaygroundNavModel, isExampleRouteActive, normalizeExamplePath } from '../../site/src/lib/playground-nav';
import type { Example } from '../../site/src/lib/types';

function ex(section: string, slug: string, extra: Partial<Example> = {}): Example {
  return {
    section,
    slug,
    path: `${section}/${slug}.js`,
    title: slug,
    description: '',
    backend: 'core',
    ...extra,
  };
}

// A flat list synthesised from the real catalog, exactly how the live store
// hands examples to the nav (each entry once, carrying its `section`).
function catalogExamples(): Example[] {
  return Object.entries(EXAMPLES_CATALOG).flatMap(([section, entries]) =>
    entries.map(entry => ex(section, entry.slug, { path: entry.path, title: entry.title })),
  );
}

describe('normalizeExamplePath', () => {
  it('strips a .js suffix', () => {
    expect(normalizeExamplePath('particles/bonfire.js')).toBe('particles/bonfire');
  });

  it('returns an already-canonical slug unchanged', () => {
    expect(normalizeExamplePath('particles/bonfire')).toBe('particles/bonfire');
  });

  it('strips leading and trailing slashes', () => {
    expect(normalizeExamplePath('/particles/bonfire.js')).toBe('particles/bonfire');
    expect(normalizeExamplePath('particles/bonfire.js/')).toBe('particles/bonfire');
  });

  it('drops a query string or hash fragment', () => {
    expect(normalizeExamplePath('particles/bonfire.js?version=current')).toBe('particles/bonfire');
    expect(normalizeExamplePath('particles/bonfire.js#section')).toBe('particles/bonfire');
    expect(normalizeExamplePath('particles/bonfire?x=1#y')).toBe('particles/bonfire');
  });

  it('is case-insensitive about the suffix and trims whitespace', () => {
    expect(normalizeExamplePath('  particles/bonfire.JS  ')).toBe('particles/bonfire');
  });

  it('treats empty / nullish input as empty', () => {
    expect(normalizeExamplePath('')).toBe('');
    expect(normalizeExamplePath(null)).toBe('');
    expect(normalizeExamplePath(undefined)).toBe('');
  });
});

describe('isExampleRouteActive', () => {
  it('matches identical canonical routes', () => {
    expect(isExampleRouteActive('particles/bonfire.js', 'particles/bonfire.js')).toBe(true);
  });

  it('matches across .js / slash / query / hash differences', () => {
    expect(isExampleRouteActive('particles/bonfire.js', 'particles/bonfire')).toBe(true);
    expect(isExampleRouteActive('/particles/bonfire', 'particles/bonfire.js?version=current#x')).toBe(true);
  });

  it('is false when there is no active example', () => {
    expect(isExampleRouteActive('particles/bonfire.js', null)).toBe(false);
    expect(isExampleRouteActive('particles/bonfire.js', undefined)).toBe(false);
    expect(isExampleRouteActive('particles/bonfire.js', '')).toBe(false);
  });

  it('does not prefix-match sibling routes', () => {
    expect(isExampleRouteActive('input/keyboard.js', 'input/keyboard-extra.js')).toBe(false);
    expect(isExampleRouteActive('input/key.js', 'input/keyboard.js')).toBe(false);
    expect(isExampleRouteActive('input/keyboard.js', 'input/key.js')).toBe(false);
  });

  it('is false for a genuinely different example', () => {
    expect(isExampleRouteActive('particles/bonfire.js', 'particles/fireworks.js')).toBe(false);
  });
});

describe('buildPlaygroundNavModel', () => {
  it('produces exactly one category level (category -> flat example list)', () => {
    const model = buildPlaygroundNavModel([ex('particles', 'bonfire'), ex('particles', 'fireworks')]);

    expect(model).toHaveLength(1);
    expect(model[0].slug).toBe('particles');
    expect(model[0].examples.map(e => e.slug)).toEqual(['bonfire', 'fireworks']);
    // The examples are plain Example objects, not nested sub-categories.
    expect(model[0].examples.every(e => typeof e.path === 'string' && !('chapters' in e))).toBe(true);
  });

  it('titles categories from CHAPTERS and orders them by the curated order', () => {
    // Deliberately reversed input order.
    const model = buildPlaygroundNavModel([ex('particles', 'bonfire'), ex('getting-started', 'hello-world')]);

    expect(model.map(c => c.slug)).toEqual(['getting-started', 'particles']);
    expect(model[0].title).toBe('Getting Started');
    expect(model[1].title).toBe('Particles');
  });

  it('falls back to a humanised title and last-place order for unknown categories', () => {
    const model = buildPlaygroundNavModel([ex('rendering', 'camera-basic'), ex('getting-started', 'hello-world')]);

    expect(model.map(c => c.slug)).toEqual(['getting-started', 'rendering']);
    const rendering = model.find(c => c.slug === 'rendering')!;
    expect(rendering.title).toBe('Rendering');
    expect(rendering.order).toBeGreaterThan(CHAPTERS.length);
  });

  it('returns an empty model for empty input', () => {
    expect(buildPlaygroundNavModel([])).toEqual([]);
  });

  it('covers the whole catalog with no example appearing twice', () => {
    const model = buildPlaygroundNavModel(catalogExamples());

    // One category per catalog directory.
    expect(model).toHaveLength(Object.keys(EXAMPLES_CATALOG).length);

    const total = model.reduce((sum, category) => sum + category.examples.length, 0);
    const catalogTotal = Object.values(EXAMPLES_CATALOG).reduce((sum, entries) => sum + entries.length, 0);
    expect(total).toBe(catalogTotal);

    // Every example route is unique across the entire rendered model — this is
    // the property the old GUIDE_PARTS model violated (hello-world appeared in
    // two parts), which lit up multiple active links at once.
    const allPaths = model.flatMap(category => category.examples.map(e => e.path));
    expect(new Set(allPaths).size).toBe(allPaths.length);

    // First category is Getting Started (curated order).
    expect(model[0].slug).toBe('getting-started');
  });

  it('keeps a previously-duplicated example in exactly one category', () => {
    const model = buildPlaygroundNavModel(catalogExamples());
    const hits = model.filter(category => category.examples.some(e => e.path === 'getting-started/hello-world.js'));

    expect(hits).toHaveLength(1);
    expect(hits[0].slug).toBe('getting-started');
  });
});
