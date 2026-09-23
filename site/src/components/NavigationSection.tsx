import type { ReactNode } from 'react';

import styles from './NavigationSection.module.scss';
import { css } from './react-utils';

export interface NavigationSectionProps {
  children: ReactNode;
  headline: string;
  unavailableCount: number;
}

export const NavigationSection = ({ children, headline, unavailableCount }: NavigationSectionProps): JSX.Element => {
  return (
    <section className={css(styles, 'root')}>
      <h2 className={css(styles, 'heading')}>
        <span className={css(styles, 'title')}>{headline}</span>
        {unavailableCount > 0 && (
          <span className={css(styles, 'count')} title={`${unavailableCount} unavailable example${unavailableCount === 1 ? '' : 's'}`}>
            {unavailableCount}
          </span>
        )}
      </h2>
      <div className={css(styles, 'content')}>{children}</div>
    </section>
  );
};
