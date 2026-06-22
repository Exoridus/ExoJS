import { forwardRef, useImperativeHandle, useRef } from 'react';

import type { VersionInfo } from '../lib/versions';
import styles from './AppHeader.module.scss';
import { css, cx } from './react-utils';
import { VersionPill } from './VersionPill';

export interface AppHeaderHandle {
    focusMenuButton(): void;
}

export interface AppHeaderProps {
    selectedVersion: VersionInfo | null;
    showSidebarToggle: boolean;
    sidebarControls: string;
    sidebarOpen: boolean;
    versions: ReadonlyArray<VersionInfo>;
    onSelectVersion(id: string): void;
    onToggleSidebar(): void;
}

export const AppHeader = forwardRef<AppHeaderHandle, AppHeaderProps>(function AppHeader(
    { onSelectVersion, onToggleSidebar, selectedVersion, showSidebarToggle, sidebarControls, sidebarOpen, versions },
    ref,
) {
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    useImperativeHandle(
        ref,
        () => ({
            focusMenuButton(): void {
                buttonRef.current?.focus();
            },
        }),
        [],
    );

    return (
        <header className={css(styles, 'root')} role="banner">
            {showSidebarToggle && (
                <button
                    ref={buttonRef}
                    className={css(styles, 'menu-button')}
                    aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
                    aria-expanded={sidebarOpen}
                    aria-controls={sidebarControls}
                    onClick={onToggleSidebar}
                >
                    <svg className={css(styles, 'menu-icon')} viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
                        <rect x="2" y="4" width="16" height="2" rx="1" />
                        <rect x="2" y="9" width="16" height="2" rx="1" />
                        <rect x="2" y="14" width="16" height="2" rx="1" />
                    </svg>
                </button>
            )}
            <span className={css(styles, 'spacer')} />
            <div className={cx(css(styles, 'version-pill'))}>
                <VersionPill selectedVersion={selectedVersion} versions={versions} onSelectVersion={onSelectVersion} />
            </div>
        </header>
    );
});
