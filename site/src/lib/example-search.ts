// Pure, DOM-free helpers for filtering the example catalog.
// Extracted from Navigation so they can be unit-tested independently.

import type { Example } from './types';

export const FEATURED_FILTER = 'start-here' as const;

export interface ExampleSearchFilter {
    query: string;
    activeFilter: string | null;
}

/**
 * Filters a flat example list by search query and/or active filter.
 *
 * - `activeFilter === null` (or "all"): no filter applied
 * - `activeFilter === FEATURED_FILTER`: only examples with `featured === true`
 * - any other string: tag filter (must appear in `tags` or `capabilities`)
 *
 * Search is case-insensitive substring match across title, description, path,
 * section, tags, and capabilities. Filter and search are AND-combined.
 */
export function filterExamples(
    examples: ReadonlyArray<Example>,
    { query, activeFilter }: ExampleSearchFilter,
): Array<Example> {
    const q = query.trim().toLowerCase();
    const filter = activeFilter === 'all' ? null : activeFilter;

    return examples.filter(example => {
        if (filter === FEATURED_FILTER) {
            if (!example.featured) return false;
        } else if (filter) {
            const inTags = (example.tags ?? []).includes(filter);
            const inCaps = (example.capabilities ?? []).includes(filter as Example['capabilities'] extends Array<infer C> ? C : never);
            if (!inTags && !inCaps) return false;
        }

        if (q) {
            return (
                example.title.toLowerCase().includes(q) ||
                example.description.toLowerCase().includes(q) ||
                example.path.toLowerCase().includes(q) ||
                example.section.toLowerCase().includes(q) ||
                (example.tags ?? []).some(tag => tag.toLowerCase().includes(q)) ||
                (example.capabilities ?? []).some(cap => cap.toLowerCase().includes(q))
            );
        }

        return true;
    });
}
