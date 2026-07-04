import type { MouseEvent } from 'react';

import styles from './NavigationLink.module.scss';
import { css, cx } from './react-utils';

export interface NavigationLinkProps {
    active: boolean;
    description: string;
    href: string;
    /** Didactic difficulty from the catalog; renders a badge for the non-default levels. */
    level?: 'intro' | 'intermediate' | 'advanced';
    path: string;
    title: string;
    unavailable: boolean;
    unavailableReason: string;
    onSelectExample(path: string): void;
}

export function NavigationLink({ active, description, href, level, path, title, unavailable, unavailableReason, onSelectExample }: NavigationLinkProps): JSX.Element {
    const tooltip = unavailable ? `${title}\n${unavailableReason || 'Unavailable in this browser.'}` : description || title;

    const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
        if (!path) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onSelectExample(path);
    };

    return (
        <a
            href={href}
            className={css(styles, 'link')}
            title={tooltip}
            data-active={active ? 'true' : undefined}
            data-unavailable={unavailable ? 'true' : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={onClick}
        >
            <span className={css(styles, 'glyph')} aria-hidden="true">
                &gt;
            </span>
            <span className={css(styles, 'title')}>{title}</span>
            {/* Intermediate is the catalog default — badging it too would turn
                the list into noise; intro/advanced are the useful signals. */}
            {!unavailable && level === 'intro' && <span className={cx(css(styles, 'badge'), css(styles, 'badge--intro'))}>Intro</span>}
            {!unavailable && level === 'advanced' && <span className={cx(css(styles, 'badge'), css(styles, 'badge--advanced'))}>Advanced</span>}
            {unavailable && <span className={cx(css(styles, 'badge'))}>Unavailable</span>}
        </a>
    );
}
