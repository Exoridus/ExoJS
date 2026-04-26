import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import componentStyles from './EditorStatusBar.scss?inline';

@customElement('exo-editor-status-bar')
export class EditorStatusBar extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: Number }) public line = 1;
  @property({ type: Number }) public column = 1;
  @property({ type: Number }) public selectionLength = 0;
  @property({ type: Boolean }) public dirty = false;
  @property({ type: String }) public language = 'JavaScript';

  public render(): ReturnType<LitElement['render']> {
    return html`
      <div class="left">
        <span class="chip chip--lang" aria-label=${`Language: ${this.language}`}>
          <span class="lang-dot" aria-hidden="true"></span>
          <span>${this.language}</span>
        </span>
      </div>
      <div class="right">
        ${this.selectionLength > 0
          ? html`
              <span class="chip chip--selection" aria-label="Selection length">
                ${this.selectionLength} selected
              </span>
            `
          : nothing}
        <span
          class="chip chip--cursor"
          aria-label=${`Cursor position, line ${this.line}, column ${this.column}`}
        >Ln ${this.line}, Col ${this.column}</span>
        <span class="chip chip--encoding" aria-hidden="true">UTF-8 · LF</span>
        <span
          class="chip chip--dirty"
          data-dirty=${String(this.dirty)}
          aria-label=${this.dirty ? 'Modified' : 'Saved'}
        >
          <span class="dirty-dot" aria-hidden="true">${this.dirty ? '●' : '○'}</span>
          <span>${this.dirty ? 'modified' : 'saved'}</span>
        </span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-editor-status-bar': EditorStatusBar;
  }
}
