import { type MouseEvent,useState } from 'react';

import { appInfo } from '../lib/app-info';
import { BottomSheet } from './BottomSheet';
import styles from './ExoHeader.module.scss';
import { LanguagePicker } from './LanguagePicker';
import { css, cx } from './react-utils';
import { ThemeToggle } from './ThemeToggle';

export interface ExoHeaderProps {
    baseUrl: string;
    currentPath: string;
    locale: 'en' | 'de';
}

export function ExoHeader({ baseUrl, currentPath, locale }: ExoHeaderProps): JSX.Element {
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [sheetOpener, setSheetOpener] = useState<HTMLElement | null>(null);
    const normalizedLocale = locale === 'de' ? 'de' : 'en';
    const homeHref = `${baseUrl}${normalizedLocale}/`;
    const guideHref = `${baseUrl}${normalizedLocale}/guide/`;
    const playgroundHref = `${baseUrl}${normalizedLocale}/playground/`;
    const apiHref = `${baseUrl}${normalizedLocale}/api/`;
    const allApiHref = `${baseUrl}${normalizedLocale}/api/all/`;
    const npmUrl = appInfo.packageName ? `https://www.npmjs.com/package/${appInfo.packageName}` : '';

    const openMenu = (event: MouseEvent<HTMLButtonElement>): void => {
        setSheetOpener(event.currentTarget);
        setSearchOpen(false);
        setMenuOpen(true);
    };
    const openSearch = (event: MouseEvent<HTMLButtonElement>): void => {
        setSheetOpener(event.currentTarget);
        setMenuOpen(false);
        setSearchOpen(true);
    };
    const dismissSheets = (): void => {
        setMenuOpen(false);
        setSearchOpen(false);
    };

    return (
        <div className={css(styles, 'root')} data-app-header>
            <header className={css(styles, 'header')} role="banner">
                <a className={css(styles, 'brand')} href={homeHref} aria-label="exo.js home">
                    <span className={css(styles, 'brand-name')}>
                        <svg viewBox="0 -15 283.4 108" aria-hidden="true">
                            <path
                                fill="currentColor"
                                d="M11.1 38.1q0-7.6 3.15-13.5t8.8-9.15T35.9 12.2q7.1 0 12.5 3.1t8.4 8.8 3 13.2v4.5H22.4q.3 5.7 4.25 9.4t9.85 3.7q5.1 0 8.15-2.3t4.85-6.1l9.1 4.9q-3 5.4-8.15 9.2T36.3 64.4q-7.4 0-13.15-3.35t-8.9-9.3T11.1 38.1m37.5-4.8q-.5-5.3-3.9-8.45t-8.9-3.15q-5.6 0-9.1 3.15t-4.2 8.45zm13.3-19.6h12.9l12.7 17.7h1l12.7-17.7h12.9L96.2 38.1 114.4 63h-13.1L88.5 44.8h-1L74.7 63H61.6l18.2-24.9zm54.7 24.6q0-7.8 3.3-13.7t9.15-9.1 13.25-3.2 13.2 3.2 9.1 9.1 3.3 13.7q0 7.9-3.3 13.8t-9.1 9.1-13.2 3.2-13.25-3.2-9.15-9.15-3.3-13.75m11 0q0 7.6 4.05 12.05t10.65 4.45q6.5 0 10.55-4.45t4.05-12.05-4.05-12-10.55-4.4q-6.6 0-10.65 4.45T127.6 38.3"
                            />
                            <circle cx="188.75" cy="51.76" r="10.25" fill="var(--accent)" />
                            <path
                                fill="var(--accent)"
                                d="M225.09 72.8q0 4.6-2.75 7.4t-7.25 2.8h-12.7v-9h8.9q2.8 0 2.8-3V13.7h11zM211.49-1q0-3.5 2.3-5.7t5.8-2.2 5.8 2.2 2.3 5.7q0 3.4-2.3 5.6t-5.8 2.2-5.8-2.2-2.3-5.6m22.1 28.2q0-7 5.2-10.95t14-3.95q8.2 0 13.5 3.65t7 10.05l-10 3q-1.7-8.3-10.5-8.3-4 0-6.3 1.55t-2.3 4.25 2.15 4.15 6.55 2.25l3.4.6q9.4 1.7 14.15 4.85t4.75 10.15q0 7.5-5.5 11.7t-14.9 4.2q-9.7 0-15.8-4.3t-7.4-12.4l10.2-2.5q1.8 10.7 13 10.7 4.6 0 7.2-1.85t2.6-4.75q0-2.7-2.35-4.2t-7.45-2.4l-3.4-.6q-8.4-1.5-13.1-4.9t-4.7-10"
                            />
                        </svg>
                    </span>
                </a>
                <nav className={css(styles, 'nav')} aria-label="Primary">
                    <a href={guideHref} data-active={currentPath.startsWith(guideHref) ? 'true' : 'false'}>
                        Guide
                    </a>
                    <a href={playgroundHref} data-active={currentPath.startsWith(playgroundHref) ? 'true' : 'false'}>
                        Playground
                    </a>
                    <a href={apiHref} data-active={currentPath.startsWith(apiHref) ? 'true' : 'false'}>
                        API
                    </a>
                </nav>
                <div className={css(styles, 'spacer')} />
                <div className={css(styles, 'tools')}>
                    <div className={css(styles, 'search-slot')} aria-hidden="true" />
                    <ThemeToggle />
                    <LanguagePicker baseUrl={baseUrl} currentPath={currentPath} locale={normalizedLocale} />
                </div>
                <div className={css(styles, 'mobile-tools')}>
                    <button
                        className={css(styles, 'mobile-tool')}
                        type="button"
                        aria-label="Open search"
                        aria-haspopup="dialog"
                        aria-controls="global-search-sheet"
                        aria-expanded={searchOpen}
                        onClick={openSearch}
                    >
                        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
                            <circle cx="9" cy="9" r="5.2" stroke="currentColor" strokeWidth="1.6" />
                            <path d="M12.8 12.8L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                    </button>
                    <button
                        className={css(styles, 'mobile-tool')}
                        type="button"
                        aria-label="Open menu"
                        aria-haspopup="dialog"
                        aria-controls="global-menu-sheet"
                        aria-expanded={menuOpen}
                        onClick={openMenu}
                    >
                        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
                            <rect x="2" y="4" width="16" height="2" rx="1" />
                            <rect x="2" y="9" width="16" height="2" rx="1" />
                            <rect x="2" y="14" width="16" height="2" rx="1" />
                        </svg>
                    </button>
                </div>
            </header>
            <BottomSheet open={searchOpen} title="Search" opener={sheetOpener} onOpenChange={setSearchOpen}>
                <div id="global-search-sheet" className={css(styles, 'sheet-block')}>
                    <p className={css(styles, 'sheet-note')}>Global search is not wired yet on mobile.</p>
                    <p className={cx(css(styles, 'sheet-note'), css(styles, 'sheet-note--muted'))}>Use the existing search surfaces until command search lands:</p>
                    <div className={css(styles, 'sheet-links')}>
                        <a href={allApiHref} onClick={dismissSheets}>
                            Search API symbols
                        </a>
                        <a href={playgroundHref} onClick={dismissSheets}>
                            Search Playground examples
                        </a>
                    </div>
                </div>
            </BottomSheet>
            <BottomSheet open={menuOpen} title="Menu" opener={sheetOpener} onOpenChange={setMenuOpen}>
                <div id="global-menu-sheet" className={css(styles, 'sheet-grid')}>
                    <section className={css(styles, 'sheet-block')}>
                        <h3>NAVIGATE</h3>
                        <div className={css(styles, 'sheet-links')}>
                            <a href={homeHref} onClick={dismissSheets}>Home</a>
                            <a href={guideHref} onClick={dismissSheets}>Guide</a>
                            <a href={apiHref} onClick={dismissSheets}>API reference</a>
                            <a href={playgroundHref} onClick={dismissSheets}>Playground</a>
                        </div>
                    </section>
                    <section className={css(styles, 'sheet-block')}>
                        <h3>THEME</h3>
                        <ThemeToggle />
                    </section>
                    <section className={css(styles, 'sheet-block')}>
                        <h3>LANGUAGE</h3>
                        <LanguagePicker baseUrl={baseUrl} currentPath={currentPath} locale={normalizedLocale} />
                    </section>
                    <section className={css(styles, 'sheet-block')}>
                        <h3>PROJECT</h3>
                        <div className={css(styles, 'sheet-links')}>
                            {appInfo.repositoryUrl && (
                                <a href={appInfo.repositoryUrl} rel="noopener noreferrer" target="_blank">
                                    GitHub
                                </a>
                            )}
                            {npmUrl && (
                                <a href={npmUrl} rel="noopener noreferrer" target="_blank">
                                    npm
                                </a>
                            )}
                        </div>
                    </section>
                    <section className={css(styles, 'sheet-block')}>
                        <h3>VERSION</h3>
                        <p className={css(styles, 'sheet-note')}>v{appInfo.version}</p>
                    </section>
                </div>
            </BottomSheet>
        </div>
    );
}
