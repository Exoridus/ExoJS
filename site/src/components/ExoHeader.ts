import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import componentStyles from './ExoHeader.scss?inline';
import './ThemeToggle';
import './LanguagePicker';

@customElement('exo-header')
export class ExoHeader extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @property({ type: String, attribute: 'base-url' }) public baseUrl = '/';
    @property({ type: String, attribute: 'current-path' }) public currentPath = '/';
    @property({ type: String }) public locale: 'en' | 'de' = 'en';

    public render(): ReturnType<LitElement['render']> {
        const locale = this.locale === 'de' ? 'de' : 'en';
        const homeHref = `${this.baseUrl}${locale}/`;
        const guideHref = `${this.baseUrl}${locale}/guide/`;
        const playgroundHref = `${this.baseUrl}${locale}/playground/`;
        const apiHref = `${this.baseUrl}${locale}/api/`;

        return html`
            <header class="header" role="banner">
                <a class="brand" href=${homeHref}>
                    <span class="brand-mark">e</span>
                    <span>ExoJS</span>
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
            </header>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-header': ExoHeader;
    }
}
