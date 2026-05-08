import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyles from './LanguagePicker.scss?inline';

const STORAGE_KEY = 'exo-language';

type Language = 'en' | 'de';

function resolveInitialLanguage(): Language {
    const fromStorage = window.localStorage.getItem(STORAGE_KEY);
    if (fromStorage === 'en' || fromStorage === 'de') return fromStorage;
    return 'en';
}

@customElement('exo-language-picker')
export class LanguagePicker extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @state() private _language: Language = resolveInitialLanguage();

    public override connectedCallback(): void {
        super.connectedCallback();
        document.documentElement.setAttribute('lang', this._language);
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
        this._language = language;
        window.localStorage.setItem(STORAGE_KEY, language);
        document.documentElement.setAttribute('lang', language);
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-language-picker': LanguagePicker;
    }
}
