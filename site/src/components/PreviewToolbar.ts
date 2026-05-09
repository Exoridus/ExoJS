import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Capability } from '../lib/examples-catalog';
import componentStyles from './PreviewToolbar.scss?inline';

@customElement('exo-preview-toolbar')
export class PreviewToolbar extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @property({ type: String }) public exampleTitle = '';
    @property({ type: Number }) public canvasWidth = 0;
    @property({ type: Number }) public canvasHeight = 0;
    @property({ type: Number }) public zoom = 1;
    @property({ type: String }) public selectedVersionId = '';
    @property({ type: Boolean }) public disabled = false;
    @property({ attribute: false }) public capabilities: Array<Capability> = [];

    public render(): ReturnType<LitElement['render']> {
        const hasDimensions = this.canvasWidth > 0 && this.canvasHeight > 0;
        const zoomPercent = hasDimensions && Math.abs(this.zoom - 1) > 0.01 ? Math.round(this.zoom * 100) : null;

        return html`
            <div class="meta">
                ${this.exampleTitle ? html`<span class="title" title=${this.exampleTitle}>${this.exampleTitle}</span>` : nothing}
                ${hasDimensions ? html`<span class="dot-sep" aria-hidden="true">·</span>` : nothing}
                ${hasDimensions
                    ? html`
                          <span class="dimensions" title="Preview canvas size">
                              ${this.canvasWidth}×${this.canvasHeight}${zoomPercent !== null ? html` · ${zoomPercent}%` : nothing}
                          </span>
                      `
                    : nothing}
                ${this.selectedVersionId ? html`<span class="dot-sep" aria-hidden="true">·</span><span class="version">exojs@${this.selectedVersionId}</span>` : nothing}
                ${this.capabilities.slice(0, 2).map(capability => html`<span class="cap">${capability}</span>`)}
            </div>
            <div class="actions">
                <button
                    class="button button--ghost"
                    type="button"
                    title="Open preview in a new tab"
                    aria-label="Open in new tab"
                    ?disabled=${this.disabled}
                    @click=${this._onOpenInTab}
                >
                    Open
                </button>
                <button
                    class="button button--primary"
                    type="button"
                    title="Reload preview (Ctrl+Enter)"
                    aria-label="Reload preview"
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    ?disabled=${this.disabled}
                    @click=${this._onReload}
                >
                    Reload
                </button>
            </div>
        `;
    }

    private _onReload(): void {
        if (this.disabled) return;
        this.dispatchEvent(new CustomEvent('request-reload', { bubbles: true, composed: true }));
    }

    private _onOpenInTab(): void {
        if (this.disabled) return;
        this.dispatchEvent(new CustomEvent('request-open-tab', { bubbles: true, composed: true }));
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-preview-toolbar': PreviewToolbar;
    }
}
