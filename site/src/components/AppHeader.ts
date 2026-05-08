import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Example } from '../lib/types';
import type { VersionInfo } from '../lib/versions';
import componentStyles from './AppHeader.scss?inline';
import './VersionPill';

@customElement('exo-app-header')
export class AppHeader extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @property({ attribute: false }) public activeExample: Example | null = null;
    @property({ type: Boolean }) public sidebarOpen = true;
    @property({ type: String }) public sidebarControls = '';
    @property({ attribute: false }) public versions: ReadonlyArray<VersionInfo> = [];
    @property({ attribute: false }) public selectedVersion: VersionInfo | null = null;

    public render(): ReturnType<LitElement['render']> {
        return html`
            <button
                class="menu-button"
                aria-label=${this.sidebarOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded=${String(this.sidebarOpen)}
                aria-controls=${this.sidebarControls}
                @click=${this._onToggleSidebar}
            >
                <svg class="menu-icon" viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
                    <rect x="2" y="4" width="16" height="2" rx="1" />
                    <rect x="2" y="9" width="16" height="2" rx="1" />
                    <rect x="2" y="14" width="16" height="2" rx="1" />
                </svg>
            </button>
            <span class="title">${this.activeExample ? this.activeExample.title : 'Playground'}</span>
            <exo-version-pill .selectedVersion=${this.selectedVersion} .versions=${this.versions}></exo-version-pill>
        `;
    }

    public focusMenuButton(): void {
        const button = this.renderRoot.querySelector('.menu-button');
        if (button instanceof HTMLButtonElement) button.focus();
    }

    private _onToggleSidebar(): void {
        this.dispatchEvent(
            new CustomEvent('toggle-sidebar', {
                bubbles: true,
                composed: true,
            })
        );
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-app-header': AppHeader;
    }
}
