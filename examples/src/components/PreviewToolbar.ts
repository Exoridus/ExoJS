import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import componentStyles from './PreviewToolbar.scss?inline';

@customElement('exo-preview-toolbar')
export class PreviewToolbar extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: String }) public exampleTitle = '';
  @property({ type: String }) public version = '';
  @property({ type: Number }) public canvasWidth = 0;
  @property({ type: Number }) public canvasHeight = 0;
  @property({ type: Number }) public zoom = 1;
  @property({ type: Boolean }) public disabled = false;

  public render(): ReturnType<LitElement['render']> {
    const hasDimensions = this.canvasWidth > 0 && this.canvasHeight > 0;
    const zoomPercent = hasDimensions && Math.abs(this.zoom - 1) > 0.01
      ? Math.round(this.zoom * 100)
      : null;

    return html`
      <div class="meta">
        ${this.exampleTitle
          ? html`<span class="title" title=${this.exampleTitle}>${this.exampleTitle}</span>`
          : nothing}
        ${this.exampleTitle && hasDimensions
          ? html`<span class="separator separator--dim" aria-hidden="true">·</span>`
          : nothing}
        ${hasDimensions
          ? html`
              <span class="dimensions" aria-label="Preview canvas size">
                <span class="dimensions__value">${this.canvasWidth}×${this.canvasHeight}</span>
                ${zoomPercent !== null
                  ? html`<span class="zoom" aria-label="Zoom">· ${zoomPercent}%</span>`
                  : nothing}
              </span>
            `
          : nothing}
      </div>
      <div class="actions">
        ${this.version
          ? html`<span class="version" title="ExoJS runtime version">exojs@${this.version}</span>`
          : nothing}
        <button
          class="reload"
          type="button"
          title="Reload preview (Ctrl+Enter)"
          aria-label="Reload preview"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          ?disabled=${this.disabled}
          @click=${this._onReload}
        >
          <svg class="reload__icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
          </svg>
          <span>Reload</span>
          <span class="kbd" aria-hidden="true">⌘↵</span>
        </button>
      </div>
    `;
  }

  private _onReload(): void {
    if (this.disabled) return;
    this.dispatchEvent(new CustomEvent('request-reload', {
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-preview-toolbar': PreviewToolbar;
  }
}
