import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import componentStyles from './Button.scss?inline';

@customElement('exo-button')
export class ExoButton extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: Boolean }) public disabled = false;
  @property({ type: Boolean }) public flat = false;
  @property({ type: String }) public variant: 'default' | 'danger' = 'default';

  public render(): ReturnType<LitElement['render']> {
    return html`
      <button
        ?disabled=${this.disabled}
        class=${classMap({
          button: true,
          flat: this.flat,
          danger: this.variant === 'danger',
        })}
      >
        <slot></slot>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-button': ExoButton;
  }
}
