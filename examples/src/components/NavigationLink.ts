import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import componentStyles from './NavigationLink.scss?inline';

@customElement('exo-nav-link')
export class NavigationLink extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: String }) public href = '';
  @property({ type: String }) public override title = '';
  @property({ type: String }) public description = '';
  @property({ type: Boolean }) public active = false;
  @property({ type: Boolean }) public unavailable = false;
  @property({ type: String }) public unavailableReason = '';

  public render(): ReturnType<LitElement['render']> {
    const tooltip = this.unavailable
      ? `${this.title}\n${this.unavailableReason || 'Unavailable in this browser.'}`
      : this.description || this.title;

    return html`
      <a
        href=${this.href}
        class="link"
        title=${tooltip}
        ?data-active=${this.active}
        ?data-unavailable=${this.unavailable}
        aria-current=${this.active ? 'page' : 'false'}
      >
        <span class="title">${this.title}</span>
        ${this.unavailable ? html`<span class="badge">Unavailable</span>` : ''}
      </a>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-nav-link': NavigationLink;
  }
}
