import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import componentStyles from './LanguagePicker.scss?inline';

const STORAGE_KEY = 'exo-language';

type Language = 'en' | 'de';

@customElement('exo-language-picker')
export class LanguagePicker extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @property({ type: String, attribute: 'base-url' }) public baseUrl = '/';
    @property({ type: String, attribute: 'current-path' }) public currentPath = '/';
    @property({ type: String }) public locale: Language = 'en';
    @state() private _language: Language = 'en';

    public override connectedCallback(): void {
        super.connectedCallback();
        this._language = this.locale === 'de' ? 'de' : 'en';
        document.documentElement.setAttribute('lang', this._language);
    }

    protected override updated(changedProperties: Map<PropertyKey, unknown>): void {
        if (changedProperties.has('locale')) {
            this._language = this.locale === 'de' ? 'de' : 'en';
            document.documentElement.setAttribute('lang', this._language);
        }
    }

    public render(): ReturnType<LitElement['render']> {
        return html`
            <div class="lang" role="group" aria-label="Language selector">
                <button
                    type="button"
                    data-active=${String(this._language === 'en')}
                    aria-pressed=${String(this._language === 'en')}
                    @click=${() => this._setLanguage('en')}
                >
                    EN
                </button>
                <button
                    type="button"
                    data-active=${String(this._language === 'de')}
                    aria-pressed=${String(this._language === 'de')}
                    @click=${() => this._setLanguage('de')}
                >
                    DE
                </button>
            </div>
        `;
    }

    private _setLanguage(language: Language): void {
        if (this._language === language) return;
        window.localStorage.setItem(STORAGE_KEY, language);
        const nextHref = this._buildLocaleHref(language);
        window.location.assign(nextHref);
    }

    private _buildLocaleHref(language: Language): string {
        const url = new URL(window.location.href);
        const basePath = new URL(this.baseUrl, window.location.href).pathname;
        const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
        const pathname = url.pathname.startsWith(normalizedBase)
            ? url.pathname.slice(normalizedBase.length)
            : url.pathname.replace(/^\//, '');

        const segments = pathname.split('/').filter(Boolean);
        const restSegments = segments[0] === 'en' || segments[0] === 'de' ? segments.slice(1) : segments;
        const localizedPath = `${normalizedBase}${language}/${restSegments.join('/')}`;
        const withTrailingSlash = localizedPath.endsWith('/') ? localizedPath : `${localizedPath}/`;

        return `${url.origin}${withTrailingSlash}${url.search}${url.hash}`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-language-picker': LanguagePicker;
    }
}
