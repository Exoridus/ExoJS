// Pure, DOM-free helpers for the playground sidenav.
//
// The playground browser shows the *flat* example catalog: one category level
// (the `examples.json` directory / `CHAPTERS` slug) with the examples of that
// category directly underneath — never the guide's Part → Chapter → Example
// nesting. Keeping these helpers free of Lit/DOM imports lets them be unit
// tested directly (see `test/site/playground-nav.test.ts`).

import { CHAPTER_BY_SLUG } from './chapters';
import type { Example } from './types';

export interface PlaygroundNavCategory {
    /** Catalog category slug, e.g. `"particles"` (matches the `examples.json` key). */
    slug: string;
    /** Display label, taken from `CHAPTERS` when available. */
    title: string;
    /** Sort key from `CHAPTERS`; unknown categories sort last. */
    order: number;
    examples: Array<Example>;
}

// Title-cases an unknown category slug as a last resort. Known categories use
// their curated `CHAPTERS` title instead.
function humanizeSlug(slug: string): string {
    return slug
        .split(/[-/]/)
        .map(word => (word ? word[0].toUpperCase() + word.slice(1) : word))
        .join(' ');
}

/**
 * Reduces an example path or route to its canonical slug form so two
 * references to the same example compare equal regardless of how they were
 * written. Strips, in order: a query string or hash fragment, leading and
 * trailing slashes, and a `.js` suffix.
 *
 *   normalizeExamplePath('/particles/bonfire.js?x=1#frag') === 'particles/bonfire'
 */
export function normalizeExamplePath(value: string | null | undefined): string {
    if (!value) return '';

    let path = value.trim();

    const queryOrHash = path.search(/[?#]/);
    if (queryOrHash !== -1) {
        path = path.slice(0, queryOrHash);
    }

    return path
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/\.js$/i, '');
}

/**
 * Exact, unambiguous active-route match: true only when `candidatePath` and
 * `activePath` resolve to the same canonical example slug. This is a full-path
 * equality check, never a prefix match, so sibling routes like
 * `input/keyboard` and `input/keyboard-extra` never both match.
 */
export function isExampleRouteActive(candidatePath: string, activePath: string | null | undefined): boolean {
    if (!activePath) return false;
    return normalizeExamplePath(candidatePath) === normalizeExamplePath(activePath);
}

/**
 * Groups a flat list of examples into one nav level — category → examples —
 * ordered and titled by `CHAPTERS`. Each example appears exactly once (under
 * its own `section`), which is what makes the active-link state unambiguous.
 * Categories that end up empty (e.g. after search/tag filtering upstream) are
 * not produced.
 */
export function buildPlaygroundNavModel(examples: ReadonlyArray<Example>): Array<PlaygroundNavCategory> {
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
        const meta = CHAPTER_BY_SLUG.get(slug);
        categories.push({
            slug,
            title: meta?.title ?? humanizeSlug(slug),
            order: meta?.order ?? Number.MAX_SAFE_INTEGER,
            examples: sectionExamples,
        });
    }

    categories.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
    return categories;
}
