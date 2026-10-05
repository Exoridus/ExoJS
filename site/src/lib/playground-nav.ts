// The navigation uses the thematic examples.json keys, while each entry's
// source path keeps its original directory for stable routes and guide links.

import { PLAYGROUND_CATEGORY_BY_SLUG } from './playground-categories';
import type { Example } from './types';

export interface PlaygroundNavCategory {
  /** Catalog category slug, e.g. `"particles"` (matches the `examples.json` key). */
  slug: string;
  /** Display label, taken from the Playground categories when available. */
  title: string;
  /** Category sort key; unknown categories sort last. */
  order: number;
  examples: Array<Example>;
}

// Title-cases an unknown category slug as a last resort.
const humanizeSlug = (slug: string): string => {
  return slug
    .split(/[-/]/)
    .map(word => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
};

/**
 * Reduces an example path or route to its canonical slug form so two
 * references to the same example compare equal regardless of how they were
 * written. Strips, in order: a query string or hash fragment, leading and
 * trailing slashes, and a `.js` suffix.
 *
 *   normalizeExamplePath('/particles/bonfire.js?x=1#frag') === 'particles/bonfire'
 */
export const normalizeExamplePath = (value: string | null | undefined): string => {
  if (!value) return '';

  let path = value.trim();

  const queryOrHash = path.search(/[?#]/);
  if (queryOrHash !== -1) {
    path = path.slice(0, queryOrHash);
  }

  return path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.js$/i, '');
};

/**
 * Exact, unambiguous active-route match: true only when `candidatePath` and
 * `activePath` resolve to the same canonical example slug. This is a full-path
 * equality check, never a prefix match, so sibling routes like
 * `input/keyboard` and `input/keyboard-extra` never both match.
 */
export const isExampleRouteActive = (candidatePath: string, activePath: string | null | undefined): boolean => {
  if (!activePath) return false;
  return normalizeExamplePath(candidatePath) === normalizeExamplePath(activePath);
};

/**
 * Groups a flat list of examples into one nav level - category → examples -
 * ordered and titled by the Playground categories. Each example appears exactly once (under
 * its own `section`), which is what makes the active-link state unambiguous.
 * Categories that end up empty (e.g. after search/tag filtering upstream) are
 * not produced.
 */
export const buildPlaygroundNavModel = (examples: ReadonlyArray<Example>): Array<PlaygroundNavCategory> => {
  const bySection = new Map<string, Array<Example>>();

  for (const example of examples) {
    const existing = bySection.get(example.section);
    if (existing) {
      existing.push(example);
    } else {
      bySection.set(example.section, [example]);
    }
  }

  const categories: Array<PlaygroundNavCategory> = [];
  for (const [slug, sectionExamples] of bySection) {
    const meta = PLAYGROUND_CATEGORY_BY_SLUG.get(slug);
    categories.push({
      slug,
      title: meta?.title ?? humanizeSlug(slug),
      order: meta?.order ?? Number.MAX_SAFE_INTEGER,
      examples: sectionExamples,
    });
  }

  categories.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  return categories;
};
