import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { getPlaygroundHighlights } from '../lib/curation-catalog';
import { buildPlaygroundLaunchHref, buildPlaygroundNavModel, isExampleRouteActive } from '../lib/playground-nav';
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
  focusSearchRequest?: number;
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
  focusSearchRequest = 0,
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
  const [highlightsOnly, setHighlightsOnly] = useState<boolean | null>(null);
  const allExamples = useMemo(() => Array.from(examples.values()).flat(), [examples]);
  const highlights = useMemo(() => getPlaygroundHighlights(allExamples), [allExamples]);
  const showHighlights = highlightsOnly ?? highlights.some(example => example.path === activeExample?.path);
  const categories = useMemo(
    () =>
      showHighlights && !query.trim()
        ? [{ slug: 'highlights', title: 'Start experimenting', order: 0, examples: highlights }]
        : buildPlaygroundNavModel(allExamples, undefined, query),
    [allExamples, highlights, showHighlights, query],
  );

  useEffect(() => {
    if (focusSearchRequest === 0) {
      return;
    }

    const deadline = performance.now() + 1000;
    let frame = 0;

    const focusVisibleFilter = (): void => {
      const filter = filterRef.current;

      if (filter && getComputedStyle(filter).visibility !== 'hidden' && filter.getClientRects().length > 0) {
        filter.focus();
      } else if (performance.now() < deadline) {
        frame = requestAnimationFrame(focusVisibleFilter);
      }
    };

    frame = requestAnimationFrame(focusVisibleFilter);

    return () => cancelAnimationFrame(frame);
  }, [focusSearchRequest]);

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
          data-modal-initial-focus
          type="search"
          aria-label="Filter examples and tools"
          placeholder="Filter examples and tools..."
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
      <div className={css(styles, 'catalog-summary')}>
        <span>{allExamples.length} entries</span>
        {headerAction}
      </div>
      {highlights.length > 0 && (
        <div className={css(styles, 'catalog-filters')} role="group" aria-label="Example collection">
          <button
            type="button"
            aria-pressed={!showHighlights || Boolean(query.trim())}
            onClick={() => {
              setHighlightsOnly(false);
              setQuery('');
            }}
          >
            All examples
          </button>
          <button
            type="button"
            aria-pressed={showHighlights && !query.trim()}
            onClick={() => {
              setHighlightsOnly(true);
              setQuery('');
            }}
          >
            Highlights <span>{highlights.length}</span>
          </button>
        </div>
      )}
      <nav ref={listRef} aria-label="Examples">
        {loadError && <p className={css(styles, 'error')}>{loadError}</p>}
        {loaded && !loadError && categories.length === 0 && (
          <p className={css(styles, 'empty')} role="status">
            No examples or tools match “{query}”.
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
                  const standaloneTool = selectedVersion?.id === CURRENT_VERSION_ID && example.path === 'debug-layer/asset-browser.js';

                  return (
                    <NavigationLink
                      key={example.path}
                      href={
                        standaloneTool
                          ? buildPlaygroundLaunchHref(example.path, locale, import.meta.env.BASE_URL)
                          : buildExampleHref(example.path, selectedVersion?.id ?? null)
                      }
                      path={standaloneTool ? '' : example.path}
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
