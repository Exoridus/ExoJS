import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import componentStyles from './ThemeToggle.scss?inline';

const STORAGE_KEY = 'exo-theme';

type Theme = 'dark' | 'light';

function resolveInitialTheme(): Theme {
    const fromStorage = window.localStorage.getItem(STORAGE_KEY);
    if (fromStorage === 'dark' || fromStorage === 'light') return fromStorage;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

@customElement('exo-theme-toggle')
export class ThemeToggle extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @state() private _theme: Theme = resolveInitialTheme();

    public override connectedCallback(): void {
        super.connectedCallback();
        this._applyTheme(this._theme);
    }

    public render(): ReturnType<LitElement['render']> {
        return html`
            <div class="theme-toggle" role="group" aria-label="Theme selector">
                <button
                    type="button"
                    aria-label="Use dark theme"
                    data-active=${String(this._theme === 'dark')}
                    aria-pressed=${String(this._theme === 'dark')}
                    @click=${() => this._setTheme('dark')}
                >
                    <span aria-hidden="true">&#9790;</span>
                </button>
                <button
                    type="button"
                    aria-label="Use light theme"
                    data-active=${String(this._theme === 'light')}
                    aria-pressed=${String(this._theme === 'light')}
                    @click=${() => this._setTheme('light')}
                >
                    <span aria-hidden="true">&#9728;</span>
                </button>
            </div>
        `;
    }

    private _setTheme(theme: Theme): void {
        if (this._theme === theme) return;
        this._theme = theme;
        window.localStorage.setItem(STORAGE_KEY, theme);
        this._applyTheme(theme);
    }

    private _applyTheme(theme: Theme): void {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-theme-toggle': ThemeToggle;
    }
}
