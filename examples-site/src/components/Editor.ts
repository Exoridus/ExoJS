import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Example, PreviewErrorEntry } from '../lib/types';
import { getExampleAvailability } from '../lib/runtime-support';
import { loadExampleSource } from '../lib/example-store';
import type { UpdateCodeEvent, ResetCodeEvent } from './EditorCode';
import componentStyles from './Editor.scss?inline';
import './EditorPreview';

@customElement('exo-editor')
export class Editor extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ attribute: false }) public activeExample: Example | null = null;
  @property({ type: String }) public catalogLoadError: string | null = null;

  @state() private _sourceCode: string | null = null;
  @state() private _originalSourceCode: string | null = null;
  @state() private _sourceLoadError: PreviewErrorEntry | null = null;
  @state() private _previewErrors: Array<PreviewErrorEntry> = [];

  private _lastLoadedPath: string | null = null;

  public override connectedCallback(): void {
    super.connectedCallback();
    // EditorCode owns all of monaco-editor (~4 MB). Kick off the async chunk here so
    // Monaco starts loading while the shell renders, but is not on the critical path.
    // The exo-code-editor element upgrades automatically once the chunk resolves; Lit
    // replays any property values that were set before the class was registered.
    void import('./EditorCode');
  }

  protected override willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
    if (changedProperties.has('activeExample')) {
      const newPath = this.activeExample?.path ?? null;

      if (newPath !== this._lastLoadedPath) {
        this._lastLoadedPath = newPath;
        void this._loadSourceCode(this.activeExample);
      }
    }
  }

  private async _loadSourceCode(example: Example | null): Promise<void> {
    this._sourceCode = null;
    this._originalSourceCode = null;
    this._sourceLoadError = null;
    this._previewErrors = [];

    if (example === null) return;

    try {
      const sourceCode = await loadExampleSource(example.path);
      this._sourceCode = sourceCode;
      this._originalSourceCode = sourceCode;
    } catch (error) {
      this._sourceLoadError = {
        summary: 'Failed to load example source',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public render(): ReturnType<LitElement['render']> {
    const activeExample = this.activeExample;
    const combinedErrors = this._getCombinedErrors();

    if (activeExample === null && combinedErrors.length > 0) {
      return html`${this._renderErrors(combinedErrors)}`;
    }

    const availability = getExampleAvailability(activeExample);

    return html`
      <div class="preview-wrapper">
        <exo-preview
          .sourceCode=${this._sourceCode}
          .exampleMeta=${activeExample}
          @preview-errors=${this._onPreviewErrors}
        ></exo-preview>
        ${!availability.available ? html`
          <div class="unavailable-overlay">
            <svg class="unavailable-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L2 20h20L12 2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <line x1="12" y1="9" x2="12" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              <circle cx="12" cy="17.5" r="0.8" fill="currentColor"/>
            </svg>
            <p class="unavailable-message">${availability.reason ?? 'This example is not available in the current browser.'}</p>
          </div>
        ` : nothing}
      </div>
      ${this._renderErrors(combinedErrors)}
      <exo-code-editor
        .sourceCode=${this._sourceCode}
        .sourcePath=${activeExample?.path ?? null}
        .canReset=${!!this._originalSourceCode && this._sourceCode !== this._originalSourceCode}
        .exampleTitle=${activeExample?.title ?? 'Loading...'}
        @update-code=${this._onUpdateCode}
        @reset-code=${this._onResetCode}
      ></exo-code-editor>
    `;
  }

  private _onUpdateCode(event: CustomEvent<UpdateCodeEvent>): void {
    this._sourceCode = event.detail.code;
  }

  private _onResetCode(_event: CustomEvent<ResetCodeEvent>): void {
    if (this._originalSourceCode === null) return;
    this._previewErrors = [];
    this._sourceCode = this._originalSourceCode;
  }

  private _onPreviewErrors(event: CustomEvent<{ errors: Array<PreviewErrorEntry> }>): void {
    this._previewErrors = event.detail.errors;
  }

  private _renderErrors(errors: Array<PreviewErrorEntry>): ReturnType<LitElement['render']> {
    if (errors.length === 0) return nothing;

    return html`
      <details class="error-panel">
        <summary class="error-summary">
          <span class="error-summary-label">Errors</span>
          <span class="error-summary-count">${errors.length}</span>
        </summary>
        <div class="error-body">
          ${errors.map(error => html`
            <article class="error-item">
              <h3 class="error-item-title">${error.summary}</h3>
              ${error.details && error.details !== error.summary
                ? html`<pre class="error-details">${error.details}</pre>`
                : nothing}
            </article>
          `)}
        </div>
      </details>
    `;
  }

  private _getCombinedErrors(): Array<PreviewErrorEntry> {
    return [
      ...(this.catalogLoadError
        ? [{ summary: 'Failed to load examples catalog', details: this.catalogLoadError }]
        : []),
      ...(this._sourceLoadError ? [this._sourceLoadError] : []),
      ...this._previewErrors,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-editor': Editor;
  }
}
