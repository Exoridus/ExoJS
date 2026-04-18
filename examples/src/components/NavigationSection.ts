import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import componentStyles from './NavigationSection.scss?inline';

@customElement('exo-nav-section')
export class NavigationSection extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: String }) public headline = '';
  @property({ type: Boolean }) public expanded = true;
  @property({ type: Number }) public unavailableCount = 0;

  public render(): ReturnType<LitElement['render']> {
    return html`
      <section>
        <button
          class="toggle"
          type="button"
          aria-expanded=${String(this.expanded)}
          @click=${this._onToggle}
        >
          <span class="title">${this.headline}</span>
          <span class="meta">
            ${this.unavailableCount > 0
              ? html`<span
                    class="count"
                    title="${this.unavailableCount} unavailable example${this.unavailableCount === 1 ? '' : 's'}"
                >${this.unavailableCount}</span>`
              : ''}
            <span class="chevron" ?data-expanded=${this.expanded}></span>
          </span>
        </button>
        ${this.expanded
          ? html`<div class="content"><slot></slot></div>`
          : ''}
      </section>
    `;
  }

  private _onToggle(): void {
    this.dispatchEvent(
      new CustomEvent('toggle-section', {
        detail: { headline: this.headline },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-nav-section': NavigationSection;
  }
}
