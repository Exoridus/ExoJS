import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Example } from '../lib/types';
import componentStyles from './AppHeader.scss?inline';

@customElement('exo-app-header')
export class AppHeader extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ attribute: false }) public activeExample: Example | null = null;
  @property({ type: Boolean }) public sidebarOpen = true;

  @state() private _showModal = false;

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
      <button
        class="menu-button"
        aria-label="About ExoJS Examples"
        @click=${this._onToggleModal}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.8"/>
          <rect x="9.3" y="8.5" width="1.4" height="6" rx="0.7" fill="currentColor"/>
          <circle cx="10" cy="6" r="0.9" fill="currentColor"/>
        </svg>
      </button>
      ${this._showModal ? this._renderModal() : nothing}
    `;
  }

  private _renderModal(): ReturnType<LitElement['render']> {
    return html`
      <div class="modal-backdrop" @click=${this._onToggleModal}>
        <div class="modal-card" @click=${this._onCardClick} role="dialog" aria-modal="true" aria-label="About ExoJS Examples">
          <div class="modal-header">
            <h2 class="modal-title">ExoJS Examples</h2>
            <button class="menu-button" aria-label="Close" @click=${this._onToggleModal}>
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
                <line x1="5" y1="5" x2="15" y2="15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                <line x1="15" y1="5" x2="5" y2="15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <p class="modal-body">
            An interactive playground for exploring and editing ExoJS code examples directly in your browser.
            Select an example from the sidebar, read and modify the source in the editor, and see changes instantly in the preview.
          </p>
          <div class="modal-links">
            <a
              class="modal-link"
              href="https://github.com/Exoridus/ExoJS"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M10 1.5a8.5 8.5 0 00-2.688 16.573c.425.078.58-.184.58-.41 0-.202-.007-.737-.011-1.446-2.364.514-2.863-1.14-2.863-1.14-.386-.981-.943-1.242-.943-1.242-.771-.527.058-.516.058-.516.853.06 1.302.876 1.302.876.758 1.299 1.99.924 2.474.707.077-.55.297-.924.54-1.136-1.888-.215-3.872-.944-3.872-4.202 0-.928.331-1.686.875-2.282-.088-.215-.38-1.08.083-2.25 0 0 .713-.228 2.336.87A8.134 8.134 0 0110 5.8c.722.003 1.449.098 2.128.287 1.622-1.098 2.334-.87 2.334-.87.464 1.17.172 2.035.085 2.25.545.596.874 1.354.874 2.282 0 3.266-1.987 3.985-3.88 4.196.305.263.577.781.577 1.574 0 1.136-.01 2.052-.01 2.332 0 .228.153.492.584.409A8.5 8.5 0 0010 1.5Z"/>
              </svg>
              ExoJS on GitHub
            </a>
          </div>
        </div>
      </div>
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

  private _onToggleModal(): void {
    this._showModal = !this._showModal;
  }

  private _onCardClick(event: Event): void {
    event.stopPropagation();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-app-header': AppHeader;
  }
}
