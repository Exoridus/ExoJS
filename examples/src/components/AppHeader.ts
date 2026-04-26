import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import type { Example } from '../lib/types';
import type { VersionInfo } from '../lib/versions';
import componentStyles from './AppHeader.scss?inline';
import './AboutDrawer';
import './VersionPill';

@customElement('exo-app-header')
export class AppHeader extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ attribute: false }) public activeExample: Example | null = null;
  @property({ type: Boolean }) public sidebarOpen = true;
  @property({ type: String }) public version = '';
  @property({ type: String }) public packageName = '';
  @property({ type: String }) public repositoryUrl = '';
  @property({ type: String }) public license = '';
  @property({ type: String }) public author = '';
  @property({ attribute: false }) public versions: ReadonlyArray<VersionInfo> = [];
  @property({ attribute: false }) public selectedVersion: VersionInfo | null = null;

  @state() private _aboutOpen = false;

  @query('[data-role="about-trigger"]') private _aboutTrigger?: HTMLButtonElement;

  public render(): ReturnType<LitElement['render']> {
    return html`
      <button
        class="menu-button"
        aria-label=${this.sidebarOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded=${String(this.sidebarOpen)}
        @click=${this._onToggleSidebar}
      >
        <svg class="menu-icon" viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
          <rect x="2" y="4" width="16" height="2" rx="1" />
          <rect x="2" y="9" width="16" height="2" rx="1" />
          <rect x="2" y="14" width="16" height="2" rx="1" />
        </svg>
      </button>
      <span class="title">${this.activeExample ? `Example: ${this.activeExample.title}` : 'ExoJS Examples'}</span>
      <exo-version-pill
        .selectedVersion=${this.selectedVersion}
        .versions=${this.versions}
      ></exo-version-pill>
      <button
        class="menu-button"
        data-role="about-trigger"
        aria-label="About ExoJS Examples"
        aria-haspopup="dialog"
        aria-expanded=${String(this._aboutOpen)}
        @click=${this._onOpenAbout}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.8"/>
          <rect x="9.3" y="8.5" width="1.4" height="6" rx="0.7" fill="currentColor"/>
          <circle cx="10" cy="6" r="0.9" fill="currentColor"/>
        </svg>
      </button>
      <exo-about-drawer
        .open=${this._aboutOpen}
        .version=${this.version}
        .packageName=${this.packageName}
        .repositoryUrl=${this.repositoryUrl}
        .license=${this.license}
        .author=${this.author}
        .selectedVersion=${this.selectedVersion}
        @close=${this._onCloseAbout}
      ></exo-about-drawer>
    `;
  }

  private _onToggleSidebar(): void {
    this.dispatchEvent(
      new CustomEvent('toggle-sidebar', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onOpenAbout(): void {
    this._aboutOpen = true;
  }

  private _onCloseAbout(): void {
    this._aboutOpen = false;
    requestAnimationFrame(() => this._aboutTrigger?.focus());
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-app-header': AppHeader;
  }
}
