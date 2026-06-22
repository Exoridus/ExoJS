import type { ReactNode } from 'react';

import styles from './NavigationSection.module.scss';
import { css } from './react-utils';

export interface NavigationSectionProps {
    children: ReactNode;
    expanded: boolean;
    headline: string;
    unavailableCount: number;
    onToggle(): void;
}

export function NavigationSection({ children, expanded, headline, onToggle, unavailableCount }: NavigationSectionProps): JSX.Element {
    return (
        <section className={css(styles, 'root')}>
            <button className={css(styles, 'toggle')} type="button" aria-expanded={expanded} onClick={onToggle}>
                <span className={css(styles, 'title')}>{headline}</span>
                <span className={css(styles, 'meta')}>
                    {unavailableCount > 0 && (
                        <span className={css(styles, 'count')} title={`${unavailableCount} unavailable example${unavailableCount === 1 ? '' : 's'}`}>
                            {unavailableCount}
                        </span>
                    )}
                    <span className={css(styles, 'chevron')} data-expanded={expanded ? 'true' : undefined} />
                </span>
            </button>
            {expanded && <div className={css(styles, 'content')}>{children}</div>}
        </section>
    );
}
