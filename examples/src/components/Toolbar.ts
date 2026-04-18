import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import componentStyles from './Toolbar.scss?inline';

@customElement('exo-toolbar')
export class ExoToolbar extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: String }) public override title = '';

  public render(): ReturnType<LitElement['render']> {
    return html`
      <div class="title">${this.title}</div>
      <slot></slot>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-toolbar': ExoToolbar;
  }
}
