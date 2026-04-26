import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { EditorDiagnostic, EditorDiagnosticSeverity } from './EditorCode';
import componentStyles from './DiagnosticsStrip.scss?inline';

export interface DiagnosticJumpEvent {
  lineNumber: number;
  column: number;
}

const SEVERITY_RANK: Record<EditorDiagnosticSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
  hint: 0,
};

@customElement('exo-diagnostics-strip')
export class DiagnosticsStrip extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ attribute: false }) public diagnostics: ReadonlyArray<EditorDiagnostic> = [];

  // Reflected so :host([has-diagnostics]) in SCSS can flip the host between
  // display:none and display:block without an extra wrapper. This keeps the
  // host from occupying layout space (and applying its negative top margin)
  // when there's nothing to render.
  @property({ type: Boolean, reflect: true, attribute: 'has-diagnostics' })
  public hasDiagnostics = false;

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('diagnostics')) {
      this.hasDiagnostics = this.diagnostics.length > 0;
    }
  }

  public render(): ReturnType<LitElement['render']> {
    if (this.diagnostics.length === 0) return nothing;

    const counts = this._countBySeverity();
    const top = this._pickTopDiagnostic();
    if (!top) return nothing;

    return html`
      <div
        class="strip"
        data-severity=${top.severity}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span class="severity-dot" data-severity=${top.severity} aria-hidden="true"></span>
        ${this._renderCounts(counts)}
        <span class="separator" aria-hidden="true">·</span>
        <span class="message">
          ${top.code
            ? html`<code class="code">ts(${top.code})</code>`
            : nothing}
          <span class="text" title=${top.message}>${top.message}</span>
        </span>
        <button
          class="jump"
          type="button"
          title="Jump to line ${top.startLineNumber}"
          aria-label="Jump to line ${top.startLineNumber}"
          @click=${() => this._onJump(top)}
        >Line ${top.startLineNumber}</button>
      </div>
    `;
  }

  private _renderCounts(
    counts: Record<EditorDiagnosticSeverity, number>
  ): ReturnType<LitElement['render']> {
    const parts: Array<ReturnType<LitElement['render']>> = [];

    if (counts.error > 0) {
      parts.push(html`<span class="count count--error">${counts.error} error${counts.error === 1 ? '' : 's'}</span>`);
    }
    if (counts.warning > 0) {
      parts.push(html`<span class="count count--warning">${counts.warning} warning${counts.warning === 1 ? '' : 's'}</span>`);
    }
    if (counts.info > 0) {
      parts.push(html`<span class="count count--info">${counts.info} info</span>`);
    }
    if (parts.length === 0 && counts.hint > 0) {
      parts.push(html`<span class="count">${counts.hint} hint${counts.hint === 1 ? '' : 's'}</span>`);
    }

    return html`<span class="counts">${parts}</span>`;
  }

  private _countBySeverity(): Record<EditorDiagnosticSeverity, number> {
    const counts: Record<EditorDiagnosticSeverity, number> = {
      error: 0,
      warning: 0,
      info: 0,
      hint: 0,
    };
    for (const diagnostic of this.diagnostics) {
      counts[diagnostic.severity] += 1;
    }
    return counts;
  }

  private _pickTopDiagnostic(): EditorDiagnostic | null {
    let top: EditorDiagnostic | null = null;
    for (const diagnostic of this.diagnostics) {
      if (!top || SEVERITY_RANK[diagnostic.severity] > SEVERITY_RANK[top.severity]) {
        top = diagnostic;
      }
    }
    return top;
  }

  private _onJump(diagnostic: EditorDiagnostic): void {
    this.dispatchEvent(new CustomEvent<DiagnosticJumpEvent>('diagnostic-jump', {
      detail: {
        lineNumber: diagnostic.startLineNumber,
        column: diagnostic.startColumn,
      },
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-diagnostics-strip': DiagnosticsStrip;
  }
}
