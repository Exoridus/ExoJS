import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CHAPTERS } from '../../site/src/lib/chapters';
import { EXAMPLES_CATALOG } from '../../site/src/lib/examples-catalog';
import { PLAYGROUND_CATEGORIES } from '../../site/src/lib/playground-categories';

// Vitest runs with the repository root as the working directory; the example
// sources live in `<root>/examples`. `import.meta.url` is an http URL under
// Vite, so it can't be used to resolve a filesystem path here.
const examplesDir = join(process.cwd(), 'examples');

const entries = Object.entries(EXAMPLES_CATALOG).flatMap(([category, list]) => list.map(entry => ({ ...entry, category })));

describe('examples catalog integrity', () => {
  it('points every catalog entry at a source file that exists', () => {
    const missing = entries.filter(entry => !existsSync(join(examplesDir, entry.path)));
    expect(missing.map(entry => entry.path)).toEqual([]);
  });

  it('keeps every path consistent with its source chapter and slug', () => {
    const sourceChapters = new Set(CHAPTERS.map(chapter => chapter.slug));
    const mismatched = entries.filter(entry => {
      const [chapter, file] = entry.path.split('/');
      return !sourceChapters.has(chapter) || file !== `${entry.slug}.js`;
    });
    expect(mismatched.map(entry => entry.path)).toEqual([]);
  });

  it('has no duplicate routes (full paths)', () => {
    const paths = entries.map(entry => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has no duplicate slug within a category', () => {
    for (const [category, list] of Object.entries(EXAMPLES_CATALOG)) {
      const slugs = list.map(entry => entry.slug);
      expect(new Set(slugs).size, `duplicate slug in "${category}"`).toBe(slugs.length);
    }
  });

  it('matches the Playground category set exactly (no orphan category metadata)', () => {
    const catalogCategories = Object.keys(EXAMPLES_CATALOG).sort();
    const categorySlugs = PLAYGROUND_CATEGORIES.map(category => category.slug).sort();
    expect(catalogCategories).toEqual(categorySlugs);
  });

  it('assigns every example to a known Playground category', () => {
    const known = new Set(PLAYGROUND_CATEGORIES.map(category => category.slug));
    const orphaned = entries.filter(entry => !known.has(entry.category));
    expect(orphaned.map(entry => entry.path)).toEqual([]);
  });

  it('every featured entry points at a source file that exists', () => {
    const featured = entries.filter(entry => entry.featured === true);
    const missing = featured.filter(entry => !existsSync(join(examplesDir, entry.path)));
    expect(missing.map(entry => entry.path)).toEqual([]);
  });

  it('every entry with a level field uses a valid level value', () => {
    const valid = new Set(['intro', 'intermediate', 'advanced']);
    const invalid = entries.filter(entry => entry.level !== undefined && !valid.has(entry.level));
    expect(invalid.map(entry => entry.path)).toEqual([]);
  });
});
