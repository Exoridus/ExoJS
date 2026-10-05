import { useEffect, useMemo, useRef } from 'react';

import { buildPlaygroundNavModel, isExampleRouteActive } from '../lib/playground-nav';
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
  const listRef = useRef<HTMLElement | null>(null);
  const allExamples = useMemo(() => Array.from(examples.values()).flat(), [examples]);
  const categories = useMemo(() => buildPlaygroundNavModel(allExamples), [allExamples]);

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector('[aria-current="page"]');
    if (!list || !active) return;
    const listBounds = list.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    if (activeBounds.top < listBounds.top + 36) list.scrollTop -= listBounds.top + 36 - activeBounds.top;
    else if (activeBounds.bottom > listBounds.bottom) list.scrollTop += activeBounds.bottom - listBounds.bottom;
  }, [activeExample?.path, loaded]);

  return (
    <section className={css(styles, 'root')}>
      <nav ref={listRef}>
        {loadError && <p className={css(styles, 'error')}>{loadError}</p>}
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
