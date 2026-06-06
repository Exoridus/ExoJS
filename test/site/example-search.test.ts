import { describe, expect, it } from 'vitest';

import { FEATURED_FILTER, filterExamples } from '../../site/src/lib/example-search';
import { EXAMPLES_CATALOG } from '../../site/src/lib/examples-catalog';
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

const FIXTURES: Example[] = [
  ex('getting-started', 'hello-world', {
    title: 'Hello World',
    description: 'Create an Application and draw a Graphics shape.',
    tags: ['scene', 'graphics', 'rendering'],
    featured: true,
    level: 'intro',
  }),
  ex('input', 'keyboard', {
    title: 'Keyboard',
    description: 'Read key state per-frame with the Keyboard API.',
    tags: ['input', 'keyboard'],
    capabilities: ['keyboard'],
    featured: true,
    level: 'intro',
  }),
  ex('audio-basics', 'play-sound', {
    title: 'Play Sound',
    description: 'Load a Sound asset and play it on a pointer tap.',
    tags: ['audio', 'sound'],
    capabilities: ['audio', 'pointer'],
    featured: true,
    level: 'intro',
  }),
  ex('particles', 'bonfire', {
    title: 'Bonfire',
    description: 'Simulate a campfire with an emitter.',
    tags: ['particles'],
  }),
  ex('performance', 'sprite-stress', {
    title: 'Sprite Stress',
    description: 'Render thousands of sprites to measure raw throughput.',
    tags: ['performance', 'rendering', 'webgpu'],
    capabilities: ['webgpu'],
    featured: true,
    level: 'intermediate',
  }),
];

describe('filterExamples', () => {
  describe('no filter / no query', () => {
    it('returns all examples when query and filter are both empty', () => {
      expect(filterExamples(FIXTURES, { query: '', activeFilter: null })).toHaveLength(FIXTURES.length);
    });

    it('treats "all" the same as null filter', () => {
      expect(filterExamples(FIXTURES, { query: '', activeFilter: 'all' })).toHaveLength(FIXTURES.length);
    });
  });

  describe('text search', () => {
    it('matches on title (case-insensitive)', () => {
      const result = filterExamples(FIXTURES, { query: 'hello', activeFilter: null });
      expect(result.map(e => e.slug)).toEqual(['hello-world']);
    });

    it('matches on description', () => {
      const result = filterExamples(FIXTURES, { query: 'campfire', activeFilter: null });
      expect(result.map(e => e.slug)).toEqual(['bonfire']);
    });

    it('matches on tags', () => {
      const result = filterExamples(FIXTURES, { query: 'particles', activeFilter: null });
      expect(result.map(e => e.slug)).toContain('bonfire');
    });

    it('matches on capabilities', () => {
      const result = filterExamples(FIXTURES, { query: 'webgpu', activeFilter: null });
      expect(result.map(e => e.slug)).toEqual(['sprite-stress']);
    });

    it('matches on section', () => {
      const result = filterExamples(FIXTURES, { query: 'audio-basics', activeFilter: null });
      expect(result.map(e => e.slug)).toEqual(['play-sound']);
    });

    it('is case-insensitive', () => {
      const result = filterExamples(FIXTURES, { query: 'KEYBOARD', activeFilter: null });
      expect(result.map(e => e.slug)).toEqual(['keyboard']);
    });

    it('returns empty when nothing matches', () => {
      const result = filterExamples(FIXTURES, { query: 'zzznomatch', activeFilter: null });
      expect(result).toHaveLength(0);
    });

    it('returns all examples for an empty query', () => {
      const result = filterExamples(FIXTURES, { query: '   ', activeFilter: null });
      expect(result).toHaveLength(FIXTURES.length);
    });
  });

  describe('featured filter', () => {
    it('returns only featured examples', () => {
      const result = filterExamples(FIXTURES, { query: '', activeFilter: FEATURED_FILTER });
      expect(result.every(e => e.featured === true)).toBe(true);
    });

    it('returns the correct count of featured examples from fixtures', () => {
      const expected = FIXTURES.filter(e => e.featured).length;
      const result = filterExamples(FIXTURES, { query: '', activeFilter: FEATURED_FILTER });
      expect(result).toHaveLength(expected);
    });

    it('returns empty when no featured examples exist', () => {
      const nonfeatured = FIXTURES.map(e => ({ ...e, featured: undefined }));
      const result = filterExamples(nonfeatured, { query: '', activeFilter: FEATURED_FILTER });
      expect(result).toHaveLength(0);
    });
  });

  describe('tag filter', () => {
    it('filters by a tag', () => {
      const result = filterExamples(FIXTURES, { query: '', activeFilter: 'audio' });
      expect(result.map(e => e.slug)).toEqual(['play-sound']);
    });

    it('filters by a capability (webgpu)', () => {
      const result = filterExamples(FIXTURES, { query: '', activeFilter: 'webgpu' });
      expect(result.map(e => e.slug)).toEqual(['sprite-stress']);
    });

    it('returns empty when no example matches the tag', () => {
      const result = filterExamples(FIXTURES, { query: '', activeFilter: 'nonexistent-tag' });
      expect(result).toHaveLength(0);
    });
  });

  describe('combined search + filter', () => {
    it('AND-combines tag filter and text query', () => {
      const result = filterExamples(FIXTURES, { query: 'key state', activeFilter: 'input' });
      expect(result.map(e => e.slug)).toEqual(['keyboard']);
    });

    it('returns empty when query matches but filter does not', () => {
      const result = filterExamples(FIXTURES, { query: 'hello', activeFilter: 'audio' });
      expect(result).toHaveLength(0);
    });

    it('AND-combines featured filter and text query', () => {
      const result = filterExamples(FIXTURES, { query: 'sound', activeFilter: FEATURED_FILTER });
      expect(result.map(e => e.slug)).toEqual(['play-sound']);
    });
  });
});

// ---------------------------------------------------------------------------
// Catalog integrity checks for the real examples.json
// ---------------------------------------------------------------------------

describe('catalog featured metadata', () => {
  const entries = Object.entries(EXAMPLES_CATALOG).flatMap(([section, list]) => list.map(entry => ({ ...entry, section })));

  it('has at least one featured example', () => {
    const featured = entries.filter(e => e.featured === true);
    expect(featured.length).toBeGreaterThan(0);
  });

  it('every featured example has level "intro" | "intermediate" | "advanced"', () => {
    const featured = entries.filter(e => e.featured === true);
    const validLevels = new Set(['intro', 'intermediate', 'advanced']);
    const invalid = featured.filter(e => e.level !== undefined && !validLevels.has(e.level));
    expect(invalid.map(e => e.path)).toEqual([]);
  });

  it('every entry with a level field has a valid level value', () => {
    const validLevels = new Set(['intro', 'intermediate', 'advanced']);
    const invalid = entries.filter(e => e.level !== undefined && !validLevels.has(e.level));
    expect(invalid.map(e => e.path)).toEqual([]);
  });

  it('start-here examples cover getting-started, sprites, input, audio, debug, and performance', () => {
    const featuredSections = new Set(entries.filter(e => e.featured === true).map(e => e.section));
    // These are the key sections we promised to cover.
    for (const section of ['getting-started', 'sprites-textures', 'input', 'audio-basics', 'debug-layer']) {
      expect(featuredSections.has(section), `expected a featured example in "${section}"`).toBe(true);
    }
  });
});
