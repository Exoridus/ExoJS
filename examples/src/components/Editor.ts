import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import type { Example, PreviewErrorEntry } from '../lib/types';
import { getExampleAvailability } from '../lib/runtime-support';
import { loadExampleSource } from '../lib/example-store';
import type {
  EditorCode,
  EditorCursorEvent,
  EditorDiagnostic,
  EditorDiagnosticEvent,
  EditorDirtyEvent,
  ResetCodeEvent,
  UpdateCodeEvent,
} from './EditorCode';
import type { DiagnosticJumpEvent } from './DiagnosticsStrip';
import componentStyles from './Editor.scss?inline';
import './EditorPreview';
import './PreviewToolbar';
import './DiagnosticsStrip';
import './EditorStatusBar';

interface CanvasSizeEvent {
  width: number;
  height: number;
  zoom: number;
}

@customElement('exo-editor')
export class Editor extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ attribute: false }) public activeExample: Example | null = null;
  @property({ type: String }) public catalogLoadError: string | null = null;
  @property({ type: String }) public selectedVersionId = '';

  @state() private _sourceCode: string | null = null;
  @state() private _originalSourceCode: string | null = null;
  @state() private _sourceLoadError: PreviewErrorEntry | null = null;
  @state() private _previewErrors: Array<PreviewErrorEntry> = [];
  @state() private _canvasWidth = 0;
  @state() private _canvasHeight = 0;
  @state() private _previewZoom = 1;
  @state() private _cursorLine = 1;
  @state() private _cursorColumn = 1;
  @state() private _selectionLength = 0;
  @state() private _dirty = false;
  @state() private _diagnostics: ReadonlyArray<EditorDiagnostic> = [];

  @query('exo-code-editor') private _codeEditor?: EditorCode;

  // Tracks the (versionId, path) pair the source loader last fetched. Phase 2
  // re-fetches when either side changes, so a version switch reloads source
  // even when the example path stays the same.
  private _lastLoadedKey: string | null = null;

  public override connectedCallback(): void {
    super.connectedCallback();
    // EditorCode owns all of monaco-editor (~4 MB). Kick off the async chunk here so
    // Monaco starts loading while the shell renders, but is not on the critical path.
    // The exo-code-editor element upgrades automatically once the chunk resolves; Lit
    // replays any property values that were set before the class was registered.
    void import('./EditorCode');
  }

  protected override willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
    if (changedProperties.has('activeExample') || changedProperties.has('selectedVersionId')) {
      const newPath = this.activeExample?.path ?? null;
      const newKey = newPath !== null && this.selectedVersionId
        ? `${this.selectedVersionId}::${newPath}`
        : null;

      if (newKey !== this._lastLoadedKey) {
        this._lastLoadedKey = newKey;
        void this._loadSourceCode(this.activeExample);
      }
    }
  }

  private async _loadSourceCode(example: Example | null): Promise<void> {
    this._sourceCode = null;
    this._originalSourceCode = null;
    this._sourceLoadError = null;
    this._previewErrors = [];
    this._diagnostics = [];

    if (example === null) return;

    if (!this.selectedVersionId) {
      // Should not happen in normal flow — ExampleBrowser only sets
      // activeExample after the version is resolved — but guard against
      // races so we never call loadExampleSource with an empty version.
      return;
    }

    try {
      const sourceCode = await loadExampleSource(this.selectedVersionId, example.path);
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
      <section class="preview-frame" aria-label="Example preview">
        <exo-preview-toolbar
          .exampleTitle=${activeExample?.title ?? ''}
          .version=${this.selectedVersionId}
          .canvasWidth=${this._canvasWidth}
          .canvasHeight=${this._canvasHeight}
          .zoom=${this._previewZoom}
          .disabled=${!this._sourceCode}
          @request-reload=${this._onRequestReload}
        ></exo-preview-toolbar>
        <div class="preview-surface">
          <exo-preview
            .sourceCode=${this._sourceCode}
            .exampleMeta=${activeExample}
            .selectedVersionId=${this.selectedVersionId}
            @preview-errors=${this._onPreviewErrors}
            @preview-canvas-size=${this._onCanvasSize}
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
      </section>
      <exo-diagnostics-strip
        .diagnostics=${this._diagnostics}
        @diagnostic-jump=${this._onDiagnosticJump}
      ></exo-diagnostics-strip>
      ${this._renderErrors(combinedErrors)}
      <section class="editor-frame" aria-label="Source editor">
        <exo-code-editor
          .sourceCode=${this._sourceCode}
          .sourcePath=${activeExample?.path ?? null}
          .canReset=${!!this._originalSourceCode && this._sourceCode !== this._originalSourceCode}
          .exampleTitle=${activeExample?.title ?? 'Loading...'}
          .selectedVersionId=${this.selectedVersionId}
          @update-code=${this._onUpdateCode}
          @reset-code=${this._onResetCode}
          @editor-cursor=${this._onEditorCursor}
          @editor-diagnostic=${this._onEditorDiagnostic}
          @editor-dirty=${this._onEditorDirty}
        ></exo-code-editor>
        <exo-editor-status-bar
          .line=${this._cursorLine}
          .column=${this._cursorColumn}
          .selectionLength=${this._selectionLength}
          .dirty=${this._dirty}
          language="JavaScript"
        ></exo-editor-status-bar>
      </section>
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

  private _onCanvasSize(event: CustomEvent<CanvasSizeEvent>): void {
    this._canvasWidth = event.detail.width;
    this._canvasHeight = event.detail.height;
    this._previewZoom = event.detail.zoom;
  }

  private _onRequestReload(): void {
    // Route through the editor's refresh so Reload always picks up Monaco's
    // current value — matching the in-editor Refresh button and the
    // Ctrl+Enter / Ctrl+S shortcuts.
    this._codeEditor?.triggerRefresh();
  }

  private _onEditorCursor(event: CustomEvent<EditorCursorEvent>): void {
    this._cursorLine = event.detail.lineNumber;
    this._cursorColumn = event.detail.column;
    this._selectionLength = event.detail.selectionLength;
  }

  private _onEditorDiagnostic(event: CustomEvent<EditorDiagnosticEvent>): void {
    this._diagnostics = event.detail.diagnostics;
  }

  private _onEditorDirty(event: CustomEvent<EditorDirtyEvent>): void {
    this._dirty = event.detail.dirty;
  }

  private _onDiagnosticJump(event: CustomEvent<DiagnosticJumpEvent>): void {
    this._codeEditor?.jumpToLine(event.detail.lineNumber, event.detail.column);
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
