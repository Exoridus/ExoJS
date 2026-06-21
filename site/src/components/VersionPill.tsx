import { type KeyboardEvent as ReactKeyboardEvent,useEffect, useRef, useState } from 'react';

import type { VersionInfo } from '../lib/versions';
import { css, cx } from './react-utils';
import styles from './VersionPill.module.scss';

export interface VersionPillProps {
    selectedVersion: VersionInfo | null;
    versions: ReadonlyArray<VersionInfo>;
    onSelectVersion(id: string): void;
}

export function VersionPill({ selectedVersion, versions, onSelectVersion }: VersionPillProps): JSX.Element {
    const [menuOpen, setMenuOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const pillRef = useRef<HTMLButtonElement | null>(null);
    const rowsRef = useRef<Array<HTMLButtonElement | null>>([]);

    const closeMenu = (): void => {
        setMenuOpen(false);
        window.requestAnimationFrame(() => pillRef.current?.focus());
    };

    const focusRow = (which: 'first' | 'last'): void => {
        const rows = rowsRef.current.filter((row): row is HTMLButtonElement => row instanceof HTMLButtonElement);
        const target = which === 'first' ? rows[0] : rows[rows.length - 1];
        target?.focus();
    };

    useEffect(() => {
        if (!menuOpen) return;

        const onKeyDown = (event: globalThis.KeyboardEvent): void => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closeMenu();
        };
        const onMouseDown = (event: MouseEvent): void => {
            if (rootRef.current?.contains(event.target as Node)) return;
            setMenuOpen(false);
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [menuOpen]);

    if (!selectedVersion) {
        return <span className={cx(css(styles, 'root'), css(styles, 'pill--empty'))} aria-busy="true">loading</span>;
    }

    const onPillKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const target = event.key === 'ArrowDown' ? 'first' : 'last';
        if (!menuOpen) {
            setMenuOpen(true);
            window.requestAnimationFrame(() => focusRow(target));
            return;
        }
        focusRow(target);
    };

    const onRowKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const rows = rowsRef.current.filter((row): row is HTMLButtonElement => row instanceof HTMLButtonElement);
        if (rows.length === 0) return;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (index + delta + rows.length) % rows.length;
        event.preventDefault();
        rows[nextIndex]?.focus();
    };

    const selectVersion = (id: string): void => {
        onSelectVersion(id);
        closeMenu();
    };

    return (
        <div ref={rootRef} className={css(styles, 'root')}>
            <button
                ref={pillRef}
                className={css(styles, 'pill')}
                data-track={selectedVersion.track}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`v${selectedVersion.id} ${selectedVersion.track} - change ExoJS version`}
                title="Change ExoJS version"
                onClick={event => {
                    event.stopPropagation();
                    setMenuOpen(open => !open);
                }}
                onKeyDown={onPillKeyDown}
            >
                <span className={css(styles, 'dot')} data-track={selectedVersion.track} aria-hidden="true" />
                <span className={css(styles, 'version')}>v{selectedVersion.id}</span>
                <span className={css(styles, 'track')}>{selectedVersion.track}</span>
                <svg className={css(styles, 'chevron')} viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                    <path d="M2 4.5 L6 8.5 L10 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {menuOpen && (
                <div className={css(styles, 'menu')} role="menu" aria-label="ExoJS version">
                    <div className={css(styles, 'menu-title')}>ExoJS version</div>
                    {versions.map((version, index) => {
                        const selected = version.id === selectedVersion.id;
                        return (
                            <button
                                key={version.id}
                                ref={node => {
                                    rowsRef.current[index] = node;
                                }}
                                className={css(styles, 'row')}
                                role="menuitemradio"
                                aria-checked={selected}
                                data-track={version.track}
                                onClick={() => selectVersion(version.id)}
                                onKeyDown={event => onRowKeyDown(event, index)}
                            >
                                <span className={css(styles, 'row-dot')} data-track={version.track} aria-hidden="true" />
                                <span className={css(styles, 'row-ver')}>v{version.id}</span>
                                <span className={css(styles, 'row-track')} data-track={version.track}>
                                    {version.track}
                                </span>
                                <span className={css(styles, 'row-summary')}>{version.summary ?? ''}</span>
                                {version.latest && <span className={css(styles, 'row-latest')}>Latest</span>}
                            </button>
                        );
                    })}
                    <div className={css(styles, 'menu-foot')}>
                        Versions are URL-driven: <span className={css(styles, 'mono')}>?v=&amp;ex=</span>
                    </div>
                </div>
            )}
        </div>
    );
}
