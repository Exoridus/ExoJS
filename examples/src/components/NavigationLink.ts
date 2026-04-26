import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import componentStyles from './NavigationLink.scss?inline';

export interface SelectExampleEvent {
  path: string;
}

@customElement('exo-nav-link')
export class NavigationLink extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: String }) public href = '';
  @property({ type: String }) public path = '';
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
        @click=${this._onClick}
      >
        <span class="title">${this.title}</span>
        ${this.unavailable ? html`<span class="badge">Unavailable</span>` : ''}
      </a>
    `;
  }

  // Intercept plain left-clicks so in-app selection stays a push-state update
  // and the preview swaps in place. Modified clicks (Cmd/Ctrl/Shift/Alt, middle
  // button) fall through to the browser so "open in new tab" / "copy link"
  // still produce a shareable query-string URL.
  private _onClick(event: MouseEvent): void {
    if (!this.path) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();

    this.dispatchEvent(new CustomEvent<SelectExampleEvent>('select-example', {
      detail: { path: this.path },
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-nav-link': NavigationLink;
  }
}
