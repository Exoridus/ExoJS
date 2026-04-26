import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import componentStyles from './LoadingSpinner.scss?inline';

@customElement('exo-spinner')
export class LoadingSpinner extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: Boolean }) public centered = false;

  public render(): ReturnType<LitElement['render']> {
    return html`
      <div class=${classMap({ indicator: true, centered: this.centered })}>
        <svg class="spinner" viewBox="0 0 100 100">
          <circle class="path" cx="50" cy="50" r="20" />
        </svg>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-spinner': LoadingSpinner;
  }
}
