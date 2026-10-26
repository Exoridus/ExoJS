import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { CURATED_CATEGORY_BY_SLUG } from '../lib/curation-catalog';
import { buildPlaygroundNavModel, isExampleRouteActive } from '../lib/playground-nav';
import { getExampleAvailability } from '../lib/runtime-support';
import type { Example, ExamplesMap } from '../lib/types';
import { buildExampleHref } from '../lib/url-state';
import { CURRENT_VERSION_ID, type VersionInfo } from '../lib/versions';
import styles from './Navigation.module.scss';
import { NavigationLink } from './NavigationLink';
import { NavigationSection } from './NavigationSection';
import { css } from './react-utils';

export interface NavigationProps {
  locale?: 'en' | 'de';
  headerAction?: ReactNode;
  activeExample: Example | null;
  examples: ExamplesMap;
  loaded: boolean;
  loadError: string | null;
  selectedVersion: VersionInfo | null;
  onSelectExample(path: string): void;
}

export const Navigation = ({
  locale = 'en',
  headerAction,
  activeExample,
  examples,
  loaded,
  loadError,
  onSelectExample,
  selectedVersion,
}: NavigationProps): JSX.Element => {
  const listRef = useRef<HTMLElement | null>(null);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const allExamples = useMemo(() => Array.from(examples.values()).flat(), [examples]);
  const categoryBySlug = selectedVersion?.id === CURRENT_VERSION_ID ? CURATED_CATEGORY_BY_SLUG : undefined;
  const categories = useMemo(() => buildPlaygroundNavModel(allExamples, categoryBySlug, query), [allExamples, categoryBySlug, query]);

  useEffect(() => {
    const focusFilter = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;

      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !target?.closest?.('input, textarea, [contenteditable="true"]')) {
        event.preventDefault();
        filterRef.current?.focus();
      }
    };

    document.addEventListener('keydown', focusFilter);

    return () => document.removeEventListener('keydown', focusFilter);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector('[aria-current="page"]');

    if (!list || !active) {
      return;
    }

    const listBounds = list.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();

    list.scrollTop += activeBounds.top - listBounds.top - (list.clientHeight - activeBounds.height) / 2;
  }, [activeExample?.path, loaded, query]);

  return (
    <section className={css(styles, 'root')}>
      <div className={css(styles, 'filter')}>
        <input
          ref={filterRef}
          type="search"
          aria-label="Filter examples"
          placeholder="Filter examples..."
          value={query}
          onChange={event => setQuery(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setQuery('');
            }
          }}
        />
        <kbd>/</kbd>
      </div>
      <div className={css(styles, 'reference-links')}>
        <span>{allExamples.length} examples</span>
        <a href={`${import.meta.env.BASE_URL + locale}/playground/tools/`}>Tools and guides</a>
        {headerAction}
      </div>
      <nav ref={listRef} aria-label="Examples">
        {loadError && <p className={css(styles, 'error')}>{loadError}</p>}
        {loaded && !loadError && categories.length === 0 && (
          <p className={css(styles, 'empty')} role="status">
            No examples match “{query}”.
          </p>
        )}
        {!loadError &&
          loaded &&
          categories.map(category => {
            const unavailableCount = category.examples.filter(example => !getExampleAvailability(example).available).length;

            return (
              <NavigationSection key={category.slug} headline={category.title} unavailableCount={unavailableCount}>
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
