import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { appInfo } from '../lib/app-info';
import componentStyles from './ExoHeader.scss?inline';
import type { BottomSheet } from './BottomSheet';
import './ThemeToggle';
import './LanguagePicker';
import './BottomSheet';

@customElement('exo-header')
export class ExoHeader extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @property({ type: String, attribute: 'base-url' }) public baseUrl = '/';
    @property({ type: String, attribute: 'current-path' }) public currentPath = '/';
    @property({ type: String }) public locale: 'en' | 'de' = 'en';
    @state() private _menuOpen = false;
    @state() private _searchOpen = false;

    @query('#global-menu-sheet') private _menuSheet!: BottomSheet;
    @query('#global-search-sheet') private _searchSheet!: BottomSheet;

    public render(): ReturnType<LitElement['render']> {
        const locale = this.locale === 'de' ? 'de' : 'en';
        const homeHref = `${this.baseUrl}${locale}/`;
        const guideHref = `${this.baseUrl}${locale}/guide/`;
        const playgroundHref = `${this.baseUrl}${locale}/playground/`;
        const apiHref = `${this.baseUrl}${locale}/api/`;
        const allApiHref = `${this.baseUrl}${locale}/api/all/`;
        const repositoryUrl = appInfo.repositoryUrl;
        const npmUrl = appInfo.packageName ? `https://www.npmjs.com/package/${appInfo.packageName}` : '';

        return html`
            <header class="header" role="banner">
                <a class="brand" href=${homeHref}>
                    <span class="brand-mark"><span>e</span></span>
                    <span class="brand-name">ExoJS</span>
                </a>
                <nav class="nav" aria-label="Primary">
                    <a href=${guideHref} data-active=${String(this.currentPath.startsWith(guideHref))}>Guide</a>
                    <a href=${playgroundHref} data-active=${String(this.currentPath.startsWith(playgroundHref))}>Playground</a>
                    <a href=${apiHref} data-active=${String(this.currentPath.startsWith(apiHref))}>API</a>
                </nav>
                <div class="spacer"></div>
                <div class="tools">
                    <div class="search-slot">
                        <slot name="search"></slot>
                    </div>
                    <exo-theme-toggle></exo-theme-toggle>
                    <exo-language-picker
                        base-url=${this.baseUrl}
                        current-path=${this.currentPath}
                        locale=${locale}
                    ></exo-language-picker>
                </div>
                <div class="mobile-tools">
                    <button
                        class="mobile-tool"
                        type="button"
                        aria-label="Open search"
                        aria-haspopup="dialog"
                        aria-controls="global-search-sheet"
                        aria-expanded=${String(this._searchOpen)}
                        @click=${this._onOpenSearch}
                    >
                        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
                            <circle cx="9" cy="9" r="5.2" stroke="currentColor" stroke-width="1.6"></circle>
                            <path d="M12.8 12.8L17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                        </svg>
                    </button>
                    <button
                        class="mobile-tool"
                        type="button"
                        aria-label="Open menu"
                        aria-haspopup="dialog"
                        aria-controls="global-menu-sheet"
                        aria-expanded=${String(this._menuOpen)}
                        @click=${this._onOpenMenu}
                    >
                        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
                            <rect x="2" y="4" width="16" height="2" rx="1"></rect>
                            <rect x="2" y="9" width="16" height="2" rx="1"></rect>
                            <rect x="2" y="14" width="16" height="2" rx="1"></rect>
                        </svg>
                    </button>
                </div>
            </header>
            <exo-bottom-sheet
                id="global-search-sheet"
                title="Search"
                ?open=${this._searchOpen}
                @sheet-toggle=${this._onSearchToggle}
            >
                <div class="sheet-block">
                    <p class="sheet-note">Global search is not wired yet on mobile.</p>
                    <p class="sheet-note sheet-note--muted">Use the existing search surfaces until command search lands:</p>
                    <div class="sheet-links">
                        <a href=${allApiHref} @click=${this._onDismissSheets}>Search API symbols</a>
                        <a href=${playgroundHref} @click=${this._onDismissSheets}>Search Playground examples</a>
                    </div>
                </div>
            </exo-bottom-sheet>
            <exo-bottom-sheet
                id="global-menu-sheet"
                title="Menu"
                ?open=${this._menuOpen}
                @sheet-toggle=${this._onMenuToggle}
            >
                <div class="sheet-grid">
                    <section class="sheet-block">
                        <h3>NAVIGATE</h3>
                        <div class="sheet-links">
                            <a href=${homeHref} @click=${this._onDismissSheets}>Home</a>
                            <a href=${guideHref} @click=${this._onDismissSheets}>Guide</a>
                            <a href=${apiHref} @click=${this._onDismissSheets}>API reference</a>
                            <a href=${playgroundHref} @click=${this._onDismissSheets}>Playground</a>
                        </div>
                    </section>

                    <section class="sheet-block">
                        <h3>THEME</h3>
                        <exo-theme-toggle></exo-theme-toggle>
                    </section>

                    <section class="sheet-block">
                        <h3>LANGUAGE</h3>
                        <exo-language-picker
                            base-url=${this.baseUrl}
                            current-path=${this.currentPath}
                            locale=${locale}
                        ></exo-language-picker>
                    </section>

                    <section class="sheet-block">
                        <h3>PROJECT</h3>
                        <div class="sheet-links">
                            ${repositoryUrl
                                ? html`<a href=${repositoryUrl} rel="noopener noreferrer" target="_blank">GitHub</a>`
                                : ''}
                            ${npmUrl ? html`<a href=${npmUrl} rel="noopener noreferrer" target="_blank">npm</a>` : ''}
                        </div>
                    </section>

                    <section class="sheet-block">
                        <h3>VERSION</h3>
                        <p class="sheet-note">v${appInfo.version}</p>
                    </section>
                </div>
            </exo-bottom-sheet>
        `;
    }

    private _onOpenMenu = (event: Event): void => {
        const opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
        this._searchSheet?.hide();
        this._menuSheet?.show(opener);
    };

    private _onOpenSearch = (event: Event): void => {
        const opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
        this._menuSheet?.hide();
        this._searchSheet?.show(opener);
    };

    private _onMenuToggle = (event: CustomEvent<{ open: boolean }>): void => {
        this._menuOpen = Boolean(event.detail?.open);
    };

    private _onSearchToggle = (event: CustomEvent<{ open: boolean }>): void => {
        this._searchOpen = Boolean(event.detail?.open);
    };

    private _onDismissSheets = (): void => {
        this._menuSheet?.hide();
        this._searchSheet?.hide();
    };
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-header': ExoHeader;
    }
}
