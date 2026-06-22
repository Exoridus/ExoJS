import { useMemo, useState } from 'react';

import { FEATURED_FILTER, filterExamples } from '../lib/example-search';
import { buildPlaygroundNavModel, isExampleRouteActive, type PlaygroundNavCategory } from '../lib/playground-nav';
import { getExampleAvailability } from '../lib/runtime-support';
import type { Example, ExamplesMap } from '../lib/types';
import { buildExampleHref } from '../lib/url-state';
import type { VersionInfo } from '../lib/versions';
import styles from './Navigation.module.scss';
import { NavigationLink } from './NavigationLink';
import { NavigationSection } from './NavigationSection';
import { css, cx } from './react-utils';

const TAG_PRIORITY = ['scene', 'input', 'audio', 'fx', 'effects', 'particles', 'rendering', 'debug', 'advanced'] as const;
const MAX_DEFAULT_TAGS = 9;

export interface NavigationProps {
    activeExample: Example | null;
    availableTags: string[];
    examples: ExamplesMap;
    loaded: boolean;
    loadError: string | null;
    selectedVersion: VersionInfo | null;
    onSelectExample(path: string): void;
}

export function Navigation({ activeExample, availableTags, examples, loaded, loadError, onSelectExample, selectedVersion }: NavigationProps): JSX.Element {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
    const [showAllTags, setShowAllTags] = useState(false);
    const [overriddenCategories, setOverriddenCategories] = useState<Map<string, boolean>>(() => new Map());

    const allExamples = useMemo(() => Array.from(examples.values()).flat(), [examples]);
    const tagCounts = useMemo(() => getTagCounts(allExamples), [allExamples]);
    const allTags = useMemo(() => ['all', ...availableTags], [availableTags]);
    const defaultTags = useMemo(() => buildDefaultTags(allTags, tagCounts), [allTags, tagCounts]);
    const activeTag = activeTagFilter ?? 'all';
    const tagsWithActive = defaultTags.includes(activeTag) ? defaultTags : [...defaultTags, activeTag];
    const visibleTags = showAllTags || allTags.length <= defaultTags.length ? allTags : tagsWithActive;
    const canToggleTags = allTags.length > defaultTags.length;
    const hiddenCount = Math.max(0, allTags.length - defaultTags.length);
    const filteredExamples = useMemo(
        () =>
            filterExamples(allExamples, {
                query: searchQuery,
                activeFilter: activeTagFilter,
            }),
        [activeTagFilter, allExamples, searchQuery],
    );
    const categories = useMemo(() => buildPlaygroundNavModel(filteredExamples), [filteredExamples]);

    const isCategoryExpanded = (category: PlaygroundNavCategory): boolean => {
        if (overriddenCategories.has(category.slug)) return overriddenCategories.get(category.slug) === true;
        return category.examples.some(example => isExampleRouteActive(example.path, activeExample?.path));
    };

    const toggleCategory = (category: PlaygroundNavCategory): void => {
        setOverriddenCategories(current => {
            const next = new Map(current);
            const expanded = next.get(category.slug) ?? isCategoryExpanded(category);
            next.set(category.slug, !expanded);
            return next;
        });
    };

    const chooseTag = (tag: string): void => {
        setActiveTagFilter(tag === 'all' ? null : tag);
    };

    return (
        <section className={css(styles, 'root')}>
            <section className={css(styles, 'side-head')}>
                <label className={css(styles, 'search')} htmlFor="example-search">
                    <svg className={css(styles, 'search-icon')} viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    <input
                        id="example-search"
                        className={css(styles, 'search-input')}
                        value={searchQuery}
                        placeholder="Find an example..."
                        onChange={event => setSearchQuery(event.currentTarget.value)}
                    />
                    <kbd>Ctrl+K</kbd>
                </label>
                <div className={css(styles, 'tag-row')} data-expanded={showAllTags ? 'true' : undefined} aria-label="Filter examples by tag">
                    <button
                        className={cx(css(styles, 'tag-button'), css(styles, 'tag-button--featured'))}
                        type="button"
                        data-active={activeTag === FEATURED_FILTER ? 'true' : undefined}
                        aria-pressed={activeTag === FEATURED_FILTER}
                        onClick={() => chooseTag(FEATURED_FILTER)}
                    >
                        Start here
                    </button>
                    {visibleTags.map(tag => {
                        const selected = activeTag === tag;
                        return (
                            <button
                                key={tag}
                                className={css(styles, 'tag-button')}
                                type="button"
                                data-active={selected ? 'true' : undefined}
                                aria-pressed={selected}
                                onClick={() => chooseTag(tag)}
                            >
                                {tag}
                            </button>
                        );
                    })}
                </div>
                {canToggleTags && (
                    <button className={css(styles, 'tag-toggle')} type="button" aria-expanded={showAllTags} onClick={() => setShowAllTags(value => !value)}>
                        {showAllTags ? 'Show fewer tags' : `Show all tags (${hiddenCount} more)`}
                    </button>
                )}
            </section>
            <nav>
                {loadError && <p className={css(styles, 'error')}>{loadError}</p>}
                {!loadError && loaded && filteredExamples.length === 0 && (
                    <p className={css(styles, 'empty-state')}>
                        No examples match your search.
                        <br />
                        <span className={css(styles, 'empty-hint')}>Try a broader term like "sprite", "audio", "input", or "debug".</span>
                    </p>
                )}
                {!loadError &&
                    loaded &&
                    categories.map(category => {
                        const unavailableCount = category.examples.filter(example => !getExampleAvailability(example).available).length;
                        const expanded = isCategoryExpanded(category);
                        return (
                            <NavigationSection
                                key={category.slug}
                                headline={category.title}
                                expanded={expanded}
                                unavailableCount={unavailableCount}
                                onToggle={() => toggleCategory(category)}
                            >
                                {category.examples.map(example => {
                                    const availability = getExampleAvailability(example);
                                    return (
                                        <NavigationLink
                                            key={example.path}
                                            href={buildExampleHref(example.path, selectedVersion?.id ?? null)}
                                            path={example.path}
                                            title={example.title}
                                            description={example.description}
                                            active={isExampleRouteActive(example.path, activeExample?.path)}
                                            unavailable={!availability.available}
                                            unavailableReason={availability.reason ?? ''}
                                            onSelectExample={onSelectExample}
                                        />
                                    );
                                })}
                            </NavigationSection>
                        );
                    })}
            </nav>
        </section>
    );
}

function buildDefaultTags(allTags: string[], counts: Map<string, number>): string[] {
    const available = new Set(allTags);
    const ordered: string[] = ['all'];

    for (const priorityTag of TAG_PRIORITY) {
        if (available.has(priorityTag)) ordered.push(priorityTag);
    }

    const remaining = allTags
        .filter(tag => tag !== 'all' && !ordered.includes(tag))
        .sort((a, b) => {
            const countDiff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
            if (countDiff !== 0) return countDiff;
            return a.localeCompare(b);
        });

    for (const tag of remaining) {
        if (ordered.length > MAX_DEFAULT_TAGS) break;
        ordered.push(tag);
    }

    return ordered;
}

function getTagCounts(examples: Example[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const example of examples) {
        for (const tag of example.tags ?? []) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
    }
    return counts;
}
