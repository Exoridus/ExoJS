import { useMemo, useState } from 'react';

import { filterExamples } from '../lib/example-search';
import { buildPlaygroundNavModel, isExampleRouteActive, type PlaygroundNavCategory } from '../lib/playground-nav';
import { getExampleAvailability } from '../lib/runtime-support';
import type { Example, ExamplesMap } from '../lib/types';
import { buildExampleHref } from '../lib/url-state';
import type { VersionInfo } from '../lib/versions';
import styles from './Navigation.module.scss';
import { NavigationLink } from './NavigationLink';
import { NavigationSection } from './NavigationSection';
import { css } from './react-utils';

export interface NavigationProps {
  activeExample: Example | null;
  examples: ExamplesMap;
  loaded: boolean;
  loadError: string | null;
  selectedVersion: VersionInfo | null;
  onSelectExample(path: string): void;
}

export const Navigation = ({ activeExample, examples, loaded, loadError, onSelectExample, selectedVersion }: NavigationProps): JSX.Element => {
  const [searchQuery, setSearchQuery] = useState('');
  const [overriddenCategories, setOverriddenCategories] = useState<Map<string, boolean>>(() => new Map());

  const allExamples = useMemo(() => Array.from(examples.values()).flat(), [examples]);
  const filteredExamples = useMemo(() => filterExamples(allExamples, { query: searchQuery, activeFilter: null }), [allExamples, searchQuery]);
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
                      level={example.level}
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
};
