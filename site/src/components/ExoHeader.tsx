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
                <a className={css(styles, 'brand')} href={homeHref}>
                    <span className={css(styles, 'brand-mark')}>
                        <span>e</span>
                    </span>
                    <span className={css(styles, 'brand-name')}>ExoJS</span>
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
