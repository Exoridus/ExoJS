import { LitElement, html, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import * as monaco from 'monaco-editor';
import monacoEditorCss from 'monaco-editor/min/vs/editor/editor.main.css?inline';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { buildPublicUrl } from '../lib/url-builder';
import componentStyles from './EditorCode.scss?inline';
import './Toolbar';
import './Button';
import './LoadingSpinner';

export interface UpdateCodeEvent {
  code: string;
}

export interface ResetCodeEvent {
  confirmed: true;
}

export type EditorDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface EditorDiagnostic {
  severity: EditorDiagnosticSeverity;
  message: string;
  code?: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface EditorDiagnosticEvent {
  diagnostics: ReadonlyArray<EditorDiagnostic>;
}

export interface EditorCursorEvent {
  lineNumber: number;
  column: number;
  selectionLength: number;
}

export interface EditorDirtyEvent {
  dirty: boolean;
}

function monacoSeverityToString(severity: number): EditorDiagnosticSeverity {
  if (severity >= 8) return 'error';
  if (severity >= 4) return 'warning';
  if (severity >= 2) return 'info';
  return 'hint';
}

function monacoMarkerCodeToString(code: monaco.editor.IMarker['code']): string | undefined {
  if (code === undefined || code === null) return undefined;
  if (typeof code === 'string') return code;
  if (typeof code === 'number') return String(code);
  if (typeof code === 'object' && 'value' in code) {
    const value = (code as { value: unknown }).value;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return undefined;
}

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(workerId: string, label: string): Worker };
  }
}

interface MonacoLanguageDefaults {
  setEagerModelSync(value: boolean): void;
  setCompilerOptions(options: Record<string, unknown>): void;
  setDiagnosticsOptions(options: Record<string, unknown>): void;
  addExtraLib(content: string, filePath?: string): unknown;
  setExtraLibs(libs: ReadonlyArray<{ content: string; filePath: string }>): void;
}

interface ExtraLib {
  content: string;
  filePath: string;
}

interface MonacoTypeScriptApi {
  javascriptDefaults: MonacoLanguageDefaults;
  typescriptDefaults: MonacoLanguageDefaults;
  ModuleKind: { ESNext: number };
  ModuleResolutionKind: { NodeJs: number };
  ScriptTarget: { ES2020: number };
}

// Library-version-agnostic typings consumed by every example regardless of
// which ExoJS version is selected. Loaded once and reused across version
// switches via the per-class `_sharedTypingsPromise` cache.
const SHARED_LIB_FILES = [
  { path: 'examples/shared/runtime.d.ts', virtualPath: 'file:///node_modules/@examples/runtime/index.d.ts' },
  { path: 'examples/shared/editor-support.d.ts', virtualPath: 'file:///node_modules/@examples/editor-support/index.d.ts' },
] as const;

// Module-level typings cache. Once a version's `.d.ts` set has been fetched
// and assembled into ExtraLib entries, switching back to that version is
// instant — no refetch, no setExtraLibs flicker.
const _typingsCache = new Map<string, Promise<ReadonlyArray<ExtraLib>>>();

let _monacoConfiguredPromise: Promise<void> | null = null;
let _jsHoverProviderRegistered = false;
let _assetCompletionProviderRegistered = false;
let _showInlineErrorCommandId: string | null = null;
let _pendingViewErrorLine: number | null = null;
let _activeInlineErrorHandler: ((lineNumber: number) => void) | null = null;
const MONACO_FONT_FAMILY = '"JetBrains Mono", Consolas, "SFMono-Regular", Menlo, Monaco, "Courier New", monospace';

type AssetManifest = Record<string, string[]>;

function resolveAssetPaths(tokenName: string, manifest: AssetManifest): string[] {
  let category: string | null = null;
  switch (tokenName) {
    case 'Texture': case 'HTMLImageElement': category = 'image'; break;
    case 'FontFace': category = 'font'; break;
    case 'Music': case 'Sound': category = 'audio'; break;
    case 'Json': category = 'json'; break;
    case 'SvgAsset': category = 'svg'; break;
    case 'Video': category = 'video'; break;
  }
  if (!category) return [];
  return (manifest[category] ?? []).map(file => `${category}/${file}`);
}

function provideAssetCompletions(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  manifest: AssetManifest,
): monaco.languages.CompletionList | null {
  const lineContent = model.getLineContent(position.lineNumber);
  const col = position.column - 1; // 0-based

  // Find opening quote to the left of the cursor
  let quoteChar = '';
  let quoteStart = -1;
  for (let i = col - 1; i >= 0; i--) {
    const ch = lineContent[i];
    if (ch === '"' || ch === "'") { quoteChar = ch; quoteStart = i; break; }
    if (ch === '{' || ch === '}' || ch === ';') break;
  }
  if (quoteStart === -1) return null;

  // Check value position: something like `key: 'HERE'` — colon before the quote
  let j = quoteStart - 1;
  while (j >= 0 && (lineContent[j] === ' ' || lineContent[j] === '\t')) j--;
  if (j < 0 || lineContent[j] !== ':') return null;

  // Find the closing quote to the right (to know the replace range)
  let quoteEnd = lineContent.length;
  for (let k = col; k < lineContent.length; k++) {
    if (lineContent[k] === quoteChar) { quoteEnd = k; break; }
  }

  // Search backwards (up to 30 lines) for the nearest loader.load(Token, { ... }) call
  const startLine = Math.max(1, position.lineNumber - 30);
  const textBefore = model.getValueInRange({
    startLineNumber: startLine, startColumn: 1,
    endLineNumber: position.lineNumber, endColumn: position.column,
  });

  const loaderLoadRe = /loader\.load\(\s*([A-Z][A-Za-z]*)\s*,/g;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = loaderLoadRe.exec(textBefore)) !== null) lastMatch = m;
  if (!lastMatch) return null;

  const paths = resolveAssetPaths(lastMatch[1], manifest);
  if (!paths.length) return null;

  const range: monaco.IRange = {
    startLineNumber: position.lineNumber,
    startColumn: quoteStart + 2, // 1-based, skip the opening quote char
    endLineNumber: position.lineNumber,
    endColumn: quoteEnd + 1,     // 1-based
  };

  return {
    suggestions: paths.map(path => ({
      label: path,
      kind: monaco.languages.CompletionItemKind.File,
      insertText: path,
      range,
    })),
    incomplete: false,
  };
}

@customElement('exo-code-editor')
export class EditorCode extends LitElement {
  // Render into light DOM so Monaco's elementFromPoint() hit-testing resolves actual
  // editor elements instead of returning the shadow host. Overriding createRenderRoot()
  // bypasses Lit's adoptStyles(), so styles are injected manually in connectedCallback.
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  @property({ type: String }) public sourceCode: string | null = null;
  @property({ type: String }) public sourcePath: string | null = null;
  @property({ type: Boolean }) public canReset = false;
  @property({ type: String }) public exampleTitle = 'Loading...';
  @property({ type: String }) public selectedVersionId = '';

  @state() private _hasPendingChanges = false;
  @state() private _showMenu = false;
  @state() private _autoRefresh = false;
  @query('.editor-host') private _editorHostElement?: HTMLDivElement;
  @query('.file-input') private _fileInputElement?: HTMLInputElement;

  public editorView: monaco.editor.IStandaloneCodeEditor | null = null;
  private _editorModel: monaco.editor.ITextModel | null = null;
  private _markerListener: monaco.IDisposable | null = null;
  private _cursorListener: monaco.IDisposable | null = null;
  private _hoverMouseListeners: monaco.IDisposable[] = [];
  private _editorKeydownHandler?: (event: KeyboardEvent) => void;
  private _menuClickOutsideHandler?: (event: MouseEvent) => void;
  private _autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _errorZoneMap: Map<number, string> = new Map();

  public render(): ReturnType<LitElement['render']> {
    return html`
      <exo-toolbar title=${`Edit Code: ${this.exampleTitle}`}>
        <div class="menu-anchor">
          <button
            class="auto-button${this._autoRefresh ? ' auto-button--active' : ''}"
            title="Auto-refresh the preview on every code change (800ms debounce)"
            @click=${this._toggleAutoRefresh}
          >Auto</button>
          <button
            class="more-button"
            data-action="refresh"
            title="Refresh preview (Ctrl+Enter)"
            @click=${this._triggerRefreshPreview}
          >
            <svg viewBox="0 0 16 16" width="1em" height="1em" style="display:block" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
            </svg>
          </button>
          <button
            class="more-button"
            aria-label="More options"
            aria-expanded=${String(this._showMenu)}
            ?data-open=${this._showMenu}
            @click=${this._onToggleMenu}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
              <circle cx="10" cy="4.5" r="1.5"/>
              <circle cx="10" cy="10" r="1.5"/>
              <circle cx="10" cy="15.5" r="1.5"/>
            </svg>
          </button>
          ${this._showMenu ? html`
            <div class="menu-dropdown" role="menu">
              <button class="menu-item" role="menuitem" @click=${this._exportCode}>Export Code</button>
              <button class="menu-item" role="menuitem" @click=${this._importCode}>Import Code</button>
              <button
                class="menu-item"
                role="menuitem"
                data-variant="danger"
                ?disabled=${!this.canReset}
                @click=${this._resetCode}
              >Reset Code</button>
            </div>
          ` : nothing}
        </div>
      </exo-toolbar>
      <input class="file-input" type="file" accept=".js" @change=${this._onFileImport}>
      <div class="editor-shell">
        <div class="editor-host"></div>
        ${!this.sourceCode
          ? html`<div class="loading-overlay"><exo-spinner centered></exo-spinner></div>`
          : nothing}
      </div>
    `;
  }

  protected override updated(changedProperties: Map<PropertyKey, unknown>): void {
    if (changedProperties.has('selectedVersionId') && this.selectedVersionId) {
      // Per-version typings swap. Runs independently of source-code changes
      // so a version flip without an example change still re-points Monaco
      // at the right declaration set.
      void this._ensureTypingsForVersion(this.selectedVersionId);
    }

    if ((!changedProperties.has('sourceCode') && !changedProperties.has('sourcePath')) || this.sourceCode === null) {
      if (this.sourceCode === null) {
        this._setDirty(false);
      }
      return;
    }

    void this._ensureEditorState(this.sourceCode, this.sourcePath);
  }

  public override connectedCallback(): void {
    super.connectedCallback();

    // Inject component styles into the shadow root (or document) that contains this
    // element. getRootNode() resolves after insertion so the target root is correct.
    // The injected styles are scoped to that root, matching exo-code-editor selectors.
    const root = this.getRootNode();
    if ((root instanceof ShadowRoot || root instanceof Document) &&
        !root.querySelector('style[data-exo-code-editor-styles]')) {
      const style = document.createElement('style');
      style.setAttribute('data-exo-code-editor-styles', '');
      style.textContent = componentStyles;
      (root instanceof ShadowRoot ? root : document.head).appendChild(style);
    }

    this._menuClickOutsideHandler = (event: MouseEvent) => {
      if (!this._showMenu) return;
      const path = event.composedPath();
      const anchor = this.renderRoot.querySelector('.menu-anchor');
      if (anchor && path.includes(anchor)) return;
      this._showMenu = false;
    };
    document.addEventListener('click', this._menuClickOutsideHandler);
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._menuClickOutsideHandler) {
      document.removeEventListener('click', this._menuClickOutsideHandler);
      this._menuClickOutsideHandler = undefined;
    }
    if (this._autoRefreshTimer !== null) {
      clearTimeout(this._autoRefreshTimer);
      this._autoRefreshTimer = null;
    }
    _activeInlineErrorHandler = null;
    this._clearInlineErrors();
    this._detachEditorKeydownHandler();
    this._editorModel?.dispose();
    this._editorModel = null;
    this._markerListener?.dispose();
    this._markerListener = null;
    this._cursorListener?.dispose();
    this._cursorListener = null;
    for (const d of this._hoverMouseListeners) d.dispose();
    this._hoverMouseListeners = [];
    this.editorView?.dispose();
    this.editorView = null;
  }

  private async _ensureEditorState(sourceCode: string, sourcePath: string | null): Promise<void> {
    await this._configureMonacoOnce();
    this._ensureMonacoStyles();

    if (!this._editorHostElement) return;

    if (this.editorView === null) {
      // Ensure JetBrains Mono is fully loaded before creating the editor so Monaco's
      // initial font measurement (typicalHalfwidthCharacterWidth, used for hover hit areas)
      // uses the correct metrics rather than a fallback font.
      await Promise.all([
        document.fonts.load('400 14px "JetBrains Mono"'),
        document.fonts.load('500 14px "JetBrains Mono"'),
      ]);
      this._initializeEditor(sourceCode, sourcePath);
      return;
    }

    this._updateEditorModel(sourceCode, sourcePath);
    this.editorView.layout();
  }

  private _initializeEditor(sourceCode: string, sourcePath: string | null): void {
    if (!this._editorHostElement || this.editorView !== null) return;

    // Worker setup must happen before editor.create() reads MonacoEnvironment.
    window.MonacoEnvironment = {
      getWorker(_: string, label: string): Worker {
        if (label === 'typescript' || label === 'javascript') return new TsWorker();
        return new EditorWorker();
      },
    };
    // Expose the monaco namespace globally so smoke tests can call static methods like
    // monaco.editor.getModelMarkers() without reimporting the module.
    (window as Window & { monaco?: typeof monaco }).monaco = monaco;

    this._editorModel = this._createModel(sourceCode, sourcePath);

    this.editorView = monaco.editor.create(this._editorHostElement, {
      model: this._editorModel,
      theme: 'vs-dark',
      automaticLayout: true,
      useShadowDOM: false,
      fixedOverflowWidgets: true,
      fontFamily: MONACO_FONT_FAMILY,
      fontSize: 14,
      glyphMargin: false,
      hover: { delay: 250, enabled: true, sticky: true, hidingDelay: 300 },
      lineDecorationsWidth: 8,
      lineHeight: 21,
      lineNumbersMinChars: 4,
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      renderValidationDecorations: 'on',
      scrollBeyondLastLine: false,
      tabSize: 4,
    });

    this.editorView.onDidChangeModelContent(() => {
      this._syncPendingChangesFromEditor();
      if (this._autoRefresh && this._hasPendingChanges) {
        if (this._autoRefreshTimer !== null) {
          clearTimeout(this._autoRefreshTimer);
        }
        this._autoRefreshTimer = setTimeout(() => {
          this._autoRefreshTimer = null;
          if (this._autoRefresh) this._triggerRefreshPreview();
        }, 800);
      }
    });

    // Cursor + selection updates — onDidChangeCursorSelection fires on both
    // caret movement and selection drag, giving position + selection range in
    // a single hop. Monaco only emits when the selection/position actually
    // changes, so there's no rAF throttle needed here.
    this._cursorListener = this.editorView.onDidChangeCursorSelection(event => {
      const selection = event.selection;
      const position = selection.getPosition();
      const selectionLength = selection.isEmpty() || !this._editorModel
        ? 0
        : this._editorModel.getValueInRange(selection).length;
      this._dispatchCursor(position.lineNumber, position.column, selectionLength);
    });

    this._dispatchCursor(1, 1, 0);

    this._attachCtrlSHandler();

    this.editorView.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => this._triggerRefreshPreview()
    );

    if (typeof monaco.KeyCode.KeyS === 'number') {
      this.editorView.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => this._triggerRefreshPreview()
      );
    }

    // MONACO UPDATE CHECKLIST — verify all of the following after a version bump:
    //   1. Hover popup appears within ~300 ms when resting on a word.
    //   2. getContribution('editor.contrib.contentHover') returns a non-null object.
    //   3. showContentHover(range, mode, source, focus) signature is unchanged.
    //   4. Mouse event type constants: 6 = CONTENT_TEXT, 7 = CONTENT_EMPTY — still hold.
    //   5. TypeScript diagnostics render (red squiggles on intentional errors).
    //   6. ExoJS extra libs load and provide completion for Application, Color, Scene, etc.

    // Custom word-level hover trigger: bypasses Monaco's character-level debouncing.
    // Monaco's internal hover timer is consistently cancelled by type-7 (CONTENT_EMPTY)
    // events in this embedding context (vanilla Monaco hover confirmed non-functional even
    // after awaiting font load — root cause is likely a coordinate/layout mismatch in
    // Monaco's horizontalDistanceToText calculation for this container setup).
    {
      let wordHoverTimer: ReturnType<typeof setTimeout> | null = null;
      let keepOpenTimer: ReturnType<typeof setTimeout> | null = null;
      let lastHoverWordKey = '';
      let shownForKey = '';
      let hoverCtrl: Record<string, unknown> | null = null;
      const getCtrl = (): Record<string, unknown> | null => {
        if (!hoverCtrl && this.editorView) {
          hoverCtrl = this.editorView.getContribution('editor.contrib.contentHover') as Record<string, unknown> | null;
        }
        return hoverCtrl;
      };
      const releaseKeepOpen = () => {
        if (keepOpenTimer !== null) { clearTimeout(keepOpenTimer); keepOpenTimer = null; }
        const c = getCtrl();
        if (c) c['shouldKeepOpenOnEditorMouseMoveOrLeave'] = false;
      };

      this._hoverMouseListeners.push(this.editorView.onMouseMove((e) => {
        if (e.target.type !== 6 /* CONTENT_TEXT */ || !e.target.position) {
          if (shownForKey !== '') {
            const c = getCtrl();
            if (c && !c['shouldKeepOpenOnEditorMouseMoveOrLeave']) {
              c['shouldKeepOpenOnEditorMouseMoveOrLeave'] = true;
              if (keepOpenTimer !== null) clearTimeout(keepOpenTimer);
              keepOpenTimer = setTimeout(() => {
                keepOpenTimer = null;
                if (c) c['shouldKeepOpenOnEditorMouseMoveOrLeave'] = false;
              }, 400);
            }
          }
          return;
        }
        const pos = e.target.position;
        const model = this._editorModel;
        if (!model) return;
        const word = model.getWordAtPosition(pos);
        const key = word
          ? `${pos.lineNumber}:${word.startColumn}-${word.endColumn}`
          : `${pos.lineNumber}:${pos.column}`;
        if (key === shownForKey) {
          // Still on the same word — hold the popup open, block Monaco's internal cancel
          const c = getCtrl();
          if (c) {
            if (keepOpenTimer !== null) { clearTimeout(keepOpenTimer); keepOpenTimer = null; }
            c['shouldKeepOpenOnEditorMouseMoveOrLeave'] = true;
          }
          return;
        }
        // Moving to a different word — let Monaco cancel the current popup and start a new timer
        releaseKeepOpen();
        if (key === lastHoverWordKey) return;
        lastHoverWordKey = key;
        if (wordHoverTimer !== null) clearTimeout(wordHoverTimer);
        wordHoverTimer = setTimeout(() => {
          wordHoverTimer = null;
          lastHoverWordKey = '';
          if (!this.editorView) return;
          const ctrl = getCtrl() as { showContentHover?: (r: unknown, m: number, s: number, f: boolean) => void } | null;
          if (!ctrl?.showContentHover) return;
          const wordRange = word
            ? new monaco.Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn)
            : new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column + 1);
          shownForKey = key;
          ctrl.showContentHover(wordRange, 1 /* Immediate */, 0 /* Mouse */, false);
        }, 250);
      }));
      this._hoverMouseListeners.push(this.editorView.onMouseLeave(() => {
        lastHoverWordKey = '';
        shownForKey = '';
      }));
    }

    // Re-inject widget overrides after Monaco's theme <style> injection so our rules win
    for (const container of this._getMonacoStyleContainers()) {
      container.querySelector('style[data-monaco-widget-overrides="true"]')?.remove();
      this._ensureMonacoWidgetOverrides(container);
    }

    // Register per-instance handler and "View Error" command for hover provider
    _activeInlineErrorHandler = (lineNumber) => this._showInlineErrorForLine(lineNumber);
    _showInlineErrorCommandId = this.editorView.addCommand(0, () => {
      if (_pendingViewErrorLine !== null) {
        _activeInlineErrorHandler?.(_pendingViewErrorLine);
        _pendingViewErrorLine = null;
      }
    }) ?? null;

    if (!_jsHoverProviderRegistered) {
      _jsHoverProviderRegistered = true;
      monaco.languages.registerHoverProvider('javascript', {
        provideHover: (model, position) => {
          const cmdId = _showInlineErrorCommandId;
          if (!cmdId) return null;

          const markers = monaco.editor.getModelMarkers({ resource: model.uri })
            .filter(m =>
              m.severity >= 4 &&
              m.startLineNumber <= position.lineNumber &&
              m.endLineNumber >= position.lineNumber
            );

          if (!markers.length) return null;

          _pendingViewErrorLine = position.lineNumber;
          const m = markers[0];
          return {
            contents: [{
              value: `[$(arrow-right) View Error Inline](command:${cmdId})`,
              isTrusted: true,
              supportThemeIcons: true,
            }],
            range: {
              startLineNumber: m.startLineNumber,
              startColumn: m.startColumn,
              endLineNumber: m.endLineNumber,
              endColumn: m.endColumn,
            },
          };
        },
      });
    }

    this._remeasureEditorFonts();
    requestAnimationFrame(() => this.editorView?.layout());
    setTimeout(() => this.editorView?.layout(), 0);
    setTimeout(() => this.editorView?.layout(), 120);

    void document.fonts.ready.then(() => {
      if (!this.editorView) return;
      this._remeasureEditorFonts();
      this.editorView.layout();
    });

    this._installDiagnosticsTracking();
    this._updateDiagnostics();
    this._syncPendingChangesFromEditor();
    this._ensureInputAreaMetadata();
  }

  private _updateEditorModel(sourceCode: string, sourcePath: string | null): void {
    if (this.editorView === null) return;

    const nextModelUri = monaco.Uri.parse(this._getModelUrl(sourcePath)).toString();

    if (!this._editorModel || this._editorModel.uri.toString() !== nextModelUri) {
      this._editorModel?.dispose();
      this._editorModel = this._createModel(sourceCode, sourcePath);
      this.editorView.setModel(this._editorModel);
      this._clearInlineErrors();
      this._updateDiagnostics();
      this._syncPendingChangesFromEditor();
      return;
    }

    if (this._editorModel.getValue() !== sourceCode) {
      this._editorModel.setValue(sourceCode);
    }

    this._syncPendingChangesFromEditor();
  }

  private _createModel(sourceCode: string, sourcePath: string | null): monaco.editor.ITextModel {
    return monaco.editor.createModel(sourceCode, 'javascript', monaco.Uri.parse(this._getModelUrl(sourcePath)));
  }

  private _ensureMonacoStyles(): void {
    // Monaco's main DOM lives in the parent shadow root (light DOM rendering), so
    // editor.main.css and widget overrides must be injected there. With fixedOverflowWidgets:true,
    // hover/suggest widgets use position:fixed (viewport coords) but remain inside the parent
    // shadow root — shadow root styles still apply. document.head also receives overrides for
    // context menus placed in document.body via useShadowDOM:false.
    for (const container of this._getMonacoStyleContainers()) {
      this._ensureMonacoCss(container);
      this._ensureMonacoWidgetOverrides(container);
    }
  }

  private _ensureMonacoCss(container: ParentNode): void {
    if (container.querySelector('style[data-monaco-style="editor-main"]')) return;
    const style = document.createElement('style');
    style.dataset.monacoStyle = 'editor-main';
    style.textContent = monacoEditorCss;
    container.appendChild(style);
  }

  private _getMonacoStyleContainers(): ParentNode[] {
    const containers: ParentNode[] = [document.head];
    const root = this.getRootNode();
    if (root instanceof ShadowRoot) containers.push(root);
    return containers;
  }

  private _ensureMonacoWidgetOverrides(container: ParentNode): void {
    if (container.querySelector('style[data-monaco-widget-overrides="true"]')) return;

    const overrides = document.createElement('style');
    overrides.dataset.monacoWidgetOverrides = 'true';
    overrides.textContent = `
      /* ── Suggest / autocomplete ──────────────────────────────────────── */
      .suggest-widget,
      .monaco-editor .suggest-widget,
      .suggest-details,
      .monaco-editor .suggest-details,
      .parameter-hints-widget {
        z-index: 12000 !important;
        pointer-events: auto !important;
        background: #171b23 !important;
        color: #f2f5fb !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        box-shadow: 0 18px 38px rgba(0, 0, 0, 0.34) !important;
        width: max-content !important;
        min-width: 320px !important;
        max-width: min(960px, calc(100vw - 32px)) !important;
      }
      .suggest-widget .details, .suggest-widget .monaco-list,
      .suggest-widget .monaco-list-rows, .suggest-details,
      .suggest-details .monaco-scrollable-element,
      .parameter-hints-widget {
        background-color: #171b23 !important; color: #f2f5fb !important; opacity: 1 !important;
        max-width: none !important; width: auto !important;
      }
      .suggest-widget .tree, .suggest-widget .monaco-list, .suggest-widget .monaco-list-row,
      .suggest-widget .monaco-list-row > .contents, .suggest-details .body,
      .suggest-details-container {
        width: auto !important; min-width: 0 !important; overflow: visible !important;
      }
      .suggest-widget .monaco-list-row > .contents, .suggest-details .documentation,
      .suggest-details .header, .suggest-details .type {
        white-space: normal !important; max-width: none !important;
        overflow: visible !important; color: #f2f5fb !important;
      }
      .suggest-widget .monaco-list-row, .suggest-widget .monaco-list-row .contents,
      .suggest-widget .monaco-highlighted-label, .suggest-details .documentation,
      .suggest-details .header, .suggest-details .type,
      .parameter-hints-widget .signature, .parameter-hints-widget .docs {
        color: #f2f5fb !important; opacity: 1 !important;
      }
      .suggest-widget .details-label, .suggest-widget .details-type-label,
      .suggest-details .monaco-tokenized-source {
        white-space: normal !important; line-height: 1.35 !important;
      }
      .suggest-widget .monaco-list-row.focused,
      .suggest-widget .monaco-list-row:hover {
        background: rgba(255, 255, 255, 0.08) !important;
      }
      /* ── Hover widget ───────────────────────────────────────────────── */
      .monaco-editor-hover,
      .monaco-hover,
      .monaco-resizable-hover {
        z-index: 12000 !important;
        pointer-events: auto !important;
        background: var(--vscode-editorHoverWidget-background, #1e2028) !important;
        color: var(--vscode-editorHoverWidget-foreground, #f2f5fb) !important;
        border: 1px solid var(--vscode-editorHoverWidget-border, rgba(255,255,255,0.12)) !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45) !important;
        border-radius: 4px !important;
      }
      .monaco-editor-hover .hover-row,
      .monaco-editor-hover .markdown-hover,
      .monaco-editor-hover .hover-contents,
      .monaco-editor-hover p,
      .monaco-editor-hover code {
        background: transparent !important;
        color: inherit !important;
      }
      .monaco-editor-hover hr {
        border-color: rgba(255, 255, 255, 0.08) !important;
      }
      /* ── Context menu ────────────────────────────────────────────────── */
      .context-view.monaco-menu-container {
        z-index: 12000 !important;
        pointer-events: auto !important;
      }
      .context-view.monaco-menu-container .monaco-list,
      .context-view.monaco-menu-container .monaco-list-row,
      .context-view.monaco-menu-container .action-item {
        width: auto !important; min-width: 0 !important; overflow: visible !important;
      }
      .context-view.monaco-menu-container .action-label {
        white-space: normal !important; max-width: none !important;
        overflow: visible !important; color: #f2f5fb !important;
      }
      .context-view.monaco-menu-container .action-item,
      .context-view.monaco-menu-container .action-label {
        color: #f2f5fb !important; opacity: 1 !important;
      }
      .context-view.monaco-menu-container .action-item.focused,
      .context-view.monaco-menu-container .action-item:hover {
        background: rgba(255, 255, 255, 0.08) !important;
      }
      .monaco-menu {
        background: #232323 !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        border-radius: 9px !important;
        padding: 4px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
        overflow: hidden !important;
      }
      .monaco-menu .monaco-action-bar { background: transparent !important; }
      .monaco-menu .action-item { padding: 0 !important; margin: 0 !important; }
      .monaco-menu .action-label {
        font-size: 12px !important;
        padding: 6px 10px !important;
        border-radius: 5px !important;
        color: rgba(255, 255, 255, 0.82) !important;
        background: transparent !important;
      }
      .monaco-menu .action-item.focused .action-label,
      .monaco-menu .action-item:hover .action-label {
        background: rgba(255, 255, 255, 0.08) !important;
        color: rgba(255, 255, 255, 0.96) !important;
      }
      .monaco-menu .action-item.disabled .action-label {
        color: rgba(255, 255, 255, 0.36) !important;
      }
      .monaco-menu hr { border-color: rgba(255, 255, 255, 0.08) !important; }
      /* ── Squiggles ───────────────────────────────────────────────────── */
      .monaco-editor .squiggly-error, .monaco-editor .squiggly-warning,
      .monaco-editor .squiggly-info { cursor: help !important; }
      /* ── Scrollbars ──────────────────────────────────────────────────── */
      .monaco-scrollable-element > .scrollbar > .slider {
        background: rgba(255, 255, 255, 0.1) !important;
        border-radius: 0 !important;
      }
      .monaco-scrollable-element > .scrollbar.vertical { width: 6px !important; }
      .monaco-scrollable-element > .scrollbar.horizontal { height: 6px !important; }
      .monaco-scrollable-element > .scrollbar > .slider:hover,
      .monaco-scrollable-element > .scrollbar.active > .slider {
        background: rgba(255, 255, 255, 0.18) !important;
      }
      /* Inline error zones */
      .monaco-error-zone {
        display: flex !important;
        align-items: center !important;
        padding: 0 16px !important;
        height: 22px !important;
        font-size: 11.5px !important;
        font-family: 'JetBrains Mono', Consolas, monospace !important;
        overflow: hidden !important;
        color: rgba(255, 140, 140, 0.88) !important;
        border-left: 2px solid rgba(255, 100, 100, 0.5) !important;
        background: rgba(180, 30, 30, 0.12) !important;
        box-sizing: border-box !important;
      }
      .monaco-error-zone.monaco-error-zone--warning {
        color: rgba(255, 210, 120, 0.88) !important;
        border-left-color: rgba(255, 190, 60, 0.5) !important;
        background: rgba(160, 120, 20, 0.1) !important;
      }
      .monaco-error-zone__msg {
        flex: 1 1 auto !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
    `;
    container.appendChild(overrides);
  }

  private _getModelUrl(sourcePath: string | null): string {
    const normalizedPath = (sourcePath ?? 'examples/active-example.js').replace(/^\/+/, '');
    return `file:///${normalizedPath}`;
  }

  private _configureMonacoOnce(): Promise<void> {
    if (_monacoConfiguredPromise) return _monacoConfiguredPromise;
    _monacoConfiguredPromise = this._configureLanguageDefaults();
    return _monacoConfiguredPromise;
  }

  // Per-version typings swap. Awaits one-time language-defaults config, then
  // resolves (or fetches and caches) the typings for the requested version.
  // setExtraLibs replaces the entire ExtraLib set atomically — it removes
  // any previously-active version's typings without flicker — and is
  // guarded by a re-check of `selectedVersionId` so a slow load can't
  // overwrite a more recent user selection.
  private async _ensureTypingsForVersion(versionId: string): Promise<void> {
    await this._configureMonacoOnce();
    if (!versionId) return;

    const libs = await this._getTypingsForVersion(versionId);
    if (this.selectedVersionId !== versionId) return;

    const tsApi = monaco.languages.typescript as unknown as MonacoTypeScriptApi;
    tsApi.javascriptDefaults.setExtraLibs(libs);
    tsApi.typescriptDefaults.setExtraLibs(libs);
  }

  private _getTypingsForVersion(versionId: string): Promise<ReadonlyArray<ExtraLib>> {
    let pending = _typingsCache.get(versionId);
    if (!pending) {
      pending = this._loadTypingsForVersion(versionId);
      _typingsCache.set(versionId, pending);
    }
    return pending;
  }

  private async _loadTypingsForVersion(versionId: string): Promise<ReadonlyArray<ExtraLib>> {
    const [shared, exojs] = await Promise.all([
      this._loadSharedTypings(),
      this._loadVersionedExoJsTypings(versionId),
    ]);
    return [...shared, ...exojs];
  }

  private async _loadSharedTypings(): Promise<ReadonlyArray<ExtraLib>> {
    return Promise.all(
      SHARED_LIB_FILES.map(async file => ({
        content: await this._fetchTextFile(buildPublicUrl(file.path)),
        filePath: file.virtualPath,
      }))
    );
  }

  // Loads ExoJS typings for the selected version. Two ingest shapes are
  // supported in priority order:
  //
  //   1. Manifest-driven (preferred). The vendor-sync ships
  //      `vendor/exojs/<v>/esm-typings.json` listing every `.d.ts` under
  //      `esm/`. We fetch all of them in parallel and register each at the
  //      virtual filesystem path Monaco expects so relative imports inside
  //      the declarations resolve correctly.
  //
  //   2. Single-file (legacy). If no manifest is present, fall back to
  //      `vendor/exojs/<v>/exo.d.ts` alone. Editor still functions; some
  //      cross-module symbols may not resolve.
  //
  // Either path also pulls `module-shims.d.ts`, which declares the ambient
  // `exojs` module re-exporting from the typings tree. If neither manifest
  // nor `exo.d.ts` is reachable for the requested version, we fall back to
  // the flat vendor path (`vendor/exojs/`) as a last resort. Failing that,
  // we return an empty list — the editor stays usable, just without
  // ExoJS-aware IntelliSense.
  private async _loadVersionedExoJsTypings(versionId: string): Promise<ReadonlyArray<ExtraLib>> {
    const versionedBase = `vendor/exojs/${versionId}/`;

    const fromVersioned = await this._loadExoJsTypingsFromBase(versionedBase);
    if (fromVersioned.length > 0) return fromVersioned;

    // Versioned snapshot wasn't reachable — try the flat vendor path so
    // direct opens / pre-cutover deployments still get IntelliSense.
    console.warn(
      `[EditorCode] Versioned typings missing for exojs@${versionId}; falling back to flat vendor path.`
    );
    return this._loadExoJsTypingsFromBase('vendor/exojs/');
  }

  private async _loadExoJsTypingsFromBase(baseUrl: string): Promise<ReadonlyArray<ExtraLib>> {
    const libs: ExtraLib[] = [];

    // module-shims.d.ts is small and always shipped by the sync.
    try {
      const shimsContent = await this._fetchTextFile(buildPublicUrl(`${baseUrl}module-shims.d.ts`));
      libs.push({
        content: shimsContent,
        filePath: 'file:///node_modules/exojs/dist/module-shims.d.ts',
      });
    } catch {
      // Missing shims means no ambient module declaration — ExoJS imports
      // will lack typings. Continue so any usable .d.ts files we find still
      // reach Monaco.
    }

    const manifest = await this._fetchTypingsManifest(`${baseUrl}esm-typings.json`);
    if (manifest && manifest.length > 0) {
      const treeLibs = await Promise.all(
        manifest.map(async rel => {
          try {
            const content = await this._fetchTextFile(buildPublicUrl(`${baseUrl}esm/${rel}`));
            return {
              content,
              filePath: `file:///node_modules/exojs/dist/esm/${rel}`,
            } satisfies ExtraLib;
          } catch {
            return null;
          }
        })
      );
      for (const lib of treeLibs) {
        if (lib) libs.push(lib);
      }
      return libs;
    }

    // No manifest — fall back to single-file legacy shape.
    try {
      const content = await this._fetchTextFile(buildPublicUrl(`${baseUrl}exo.d.ts`));
      libs.push({
        content,
        filePath: 'file:///node_modules/exojs/dist/exo.d.ts',
      });
    } catch {
      // No usable declarations at all under this base.
    }

    return libs;
  }

  private async _fetchTypingsManifest(relativePath: string): Promise<ReadonlyArray<string> | null> {
    try {
      const response = await fetch(buildPublicUrl(relativePath), { cache: 'no-cache' });
      if (!response.ok) return null;
      const data = await response.json() as unknown;
      if (!Array.isArray(data)) return null;
      // Whitelist entries to forward-slashed `.d.ts` relative paths so a
      // tampered manifest can't induce path traversal in fetch URLs.
      return data.filter((entry): entry is string =>
        typeof entry === 'string'
        && entry.endsWith('.d.ts')
        && !entry.includes('..')
        && !entry.startsWith('/')
      );
    } catch {
      return null;
    }
  }

  private _installDiagnosticsTracking(): void {
    if (this._markerListener) return;

    this._markerListener = monaco.editor.onDidChangeMarkers(resources => {
      if (!this._editorModel) return;
      if (resources.some(r => r.toString() === this._editorModel?.uri.toString())) {
        this._updateDiagnostics();
        this._pruneStaleInlineErrors();
      }
    });
  }

  // One-time language-defaults configuration. Compiler options, diagnostics
  // options, and the asset-completion provider live here. Extra libs are NOT
  // added in this step — typings are version-scoped and applied via
  // `_ensureTypingsForVersion(versionId)` whenever the selected version
  // changes.
  private async _configureLanguageDefaults(): Promise<void> {
    const tsApi = monaco.languages.typescript as unknown as MonacoTypeScriptApi;
    const compilerOptions = {
      allowJs: true,
      allowNonTsExtensions: true,
      allowSyntheticDefaultImports: true,
      checkJs: true,
      esModuleInterop: true,
      module: tsApi.ModuleKind.ESNext,
      moduleResolution: tsApi.ModuleResolutionKind.NodeJs,
      noEmit: true,
      noImplicitAny: false,
      noImplicitThis: false,
      strict: false,
      target: tsApi.ScriptTarget.ES2020,
    };
    const jsDiagnosticsOptions = {
      diagnosticCodesToIgnore: [7044],
      noSemanticValidation: false,
      noSyntaxValidation: false,
    };
    const diagnosticsOptions = {
      noSemanticValidation: false,
      noSyntaxValidation: false,
    };

    tsApi.javascriptDefaults.setEagerModelSync(true);
    tsApi.typescriptDefaults.setEagerModelSync(true);
    tsApi.javascriptDefaults.setCompilerOptions(compilerOptions);
    tsApi.typescriptDefaults.setCompilerOptions(compilerOptions);
    tsApi.javascriptDefaults.setDiagnosticsOptions(jsDiagnosticsOptions);
    tsApi.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

    if (!_assetCompletionProviderRegistered) {
      _assetCompletionProviderRegistered = true;
      void this._registerAssetCompletionProvider();
    }
  }

  private async _registerAssetCompletionProvider(): Promise<void> {
    let manifest: AssetManifest;
    try {
      const response = await fetch(buildPublicUrl('assets/assets.json'), { cache: 'no-cache' });
      if (!response.ok) return;
      manifest = await response.json() as AssetManifest;
    } catch {
      return;
    }
    monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ["'", '"'],
      provideCompletionItems: (model, position) => provideAssetCompletions(model, position, manifest),
    });
  }

  private async _fetchTextFile(url: string): Promise<string> {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to fetch editor support file at ${url}.`);
    return response.text();
  }

  private _updateDiagnostics(): void {
    if (!this._editorModel) {
      this._dispatchDiagnostics([]);
      return;
    }

    const markers = monaco.editor.getModelMarkers({ resource: this._editorModel.uri });

    const diagnostics: EditorDiagnostic[] = markers.map(marker => ({
      severity: monacoSeverityToString(marker.severity),
      message: marker.message,
      code: monacoMarkerCodeToString(marker.code),
      startLineNumber: marker.startLineNumber,
      startColumn: marker.startColumn,
      endLineNumber: marker.endLineNumber,
      endColumn: marker.endColumn,
    }));
    this._dispatchDiagnostics(diagnostics);
  }

  private _dispatchDiagnostics(diagnostics: ReadonlyArray<EditorDiagnostic>): void {
    this.dispatchEvent(new CustomEvent<EditorDiagnosticEvent>('editor-diagnostic', {
      detail: { diagnostics },
      bubbles: true,
      composed: true,
    }));
  }

  private _dispatchCursor(lineNumber: number, column: number, selectionLength: number): void {
    this.dispatchEvent(new CustomEvent<EditorCursorEvent>('editor-cursor', {
      detail: { lineNumber, column, selectionLength },
      bubbles: true,
      composed: true,
    }));
  }

  private _remeasureEditorFonts(): void {
    const api = monaco.editor as typeof monaco.editor & { remeasureFonts?: () => void };
    api.remeasureFonts?.();
  }

  private _triggerRefreshPreview(): void {
    if (this.editorView === null) return;

    this.dispatchEvent(
      new CustomEvent<UpdateCodeEvent>('update-code', {
        detail: { code: this.editorView.getValue() },
      })
    );
    this._setDirty(false);
  }

  // Public entry point used by sibling components (e.g. the preview toolbar)
  // to route their Reload action through the same code path as the in-editor
  // Refresh button and the Ctrl+Enter / Ctrl+S keyboard shortcuts.
  public triggerRefresh(): void {
    this._triggerRefreshPreview();
  }

  // Moves the caret to the requested position and reveals the line in view.
  // Used by the diagnostics strip's "Line N" jump button.
  public jumpToLine(lineNumber: number, column: number = 1): void {
    if (!this.editorView) return;
    this.editorView.revealLineInCenter(lineNumber);
    this.editorView.setPosition({ lineNumber, column });
    this.editorView.focus();
  }

  private _onToggleMenu(): void {
    this._showMenu = !this._showMenu;
  }

  private _toggleAutoRefresh(): void {
    this._autoRefresh = !this._autoRefresh;
    if (!this._autoRefresh && this._autoRefreshTimer !== null) {
      clearTimeout(this._autoRefreshTimer);
      this._autoRefreshTimer = null;
    }
  }

  private _showInlineErrorForLine(lineNumber: number): void {
    if (!this.editorView || !this._editorModel) return;
    if (this._errorZoneMap.has(lineNumber)) return;

    const markers = monaco.editor.getModelMarkers({ resource: this._editorModel.uri })
      .filter(m => m.startLineNumber === lineNumber && m.severity >= 4);

    if (!markers.length) return;

    const marker = markers.reduce((a, b) => a.severity >= b.severity ? a : b);
    const node = this._createErrorZoneNode(marker);

    this.editorView.changeViewZones(accessor => {
      const id = accessor.addZone({
        afterLineNumber: lineNumber,
        heightInPx: 22,
        domNode: node,
        suppressMouseDown: true,
      });
      this._errorZoneMap.set(lineNumber, id);
    });
  }

  private _pruneStaleInlineErrors(): void {
    if (!this.editorView || !this._editorModel || this._errorZoneMap.size === 0) return;

    const errorLines = new Set(
      monaco.editor.getModelMarkers({ resource: this._editorModel.uri })
        .filter(m => m.severity >= 4)
        .map(m => m.startLineNumber)
    );

    const staleLines = [...this._errorZoneMap.keys()].filter(line => !errorLines.has(line));
    if (staleLines.length === 0) return;

    this.editorView.changeViewZones(accessor => {
      for (const line of staleLines) {
        accessor.removeZone(this._errorZoneMap.get(line)!);
        this._errorZoneMap.delete(line);
      }
    });
  }

  private _createErrorZoneNode(marker: monaco.editor.IMarker): HTMLDivElement {
    const isError = marker.severity >= 8;
    const node = document.createElement('div');
    node.className = `monaco-error-zone${isError ? '' : ' monaco-error-zone--warning'}`;
    const msg = document.createElement('span');
    msg.className = 'monaco-error-zone__msg';
    msg.textContent = marker.message;
    node.appendChild(msg);
    return node;
  }

  private _clearInlineErrors(): void {
    if (this._errorZoneMap.size === 0) return;
    if (this.editorView) {
      this.editorView.changeViewZones(accessor => {
        for (const id of this._errorZoneMap.values()) {
          accessor.removeZone(id);
        }
      });
    }
    this._errorZoneMap.clear();
  }

  private _exportCode(): void {
    this._showMenu = false;
    if (!this.editorView) return;

    const code = this.editorView.getValue();
    const fileName = this.sourcePath
      ? this.sourcePath.split('/').pop() ?? 'example.js'
      : 'example.js';

    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private _importCode(): void {
    this._showMenu = false;
    this._fileInputElement?.click();
  }

  private _onFileImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.editorView) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !this.editorView) return;
      this._editorModel?.setValue(reader.result);
    };
    reader.readAsText(file);
    input.value = '';
  }

  private _resetCode(): void {
    this._showMenu = false;
    if (!this.canReset || !window.confirm('Reset the editor to the original example source?')) return;

    this.dispatchEvent(
      new CustomEvent<ResetCodeEvent>('reset-code', {
        detail: { confirmed: true },
      })
    );
    this._setDirty(false);
  }

  private _syncPendingChangesFromEditor(): void {
    if (this.editorView === null || this.sourceCode === null) {
      this._setDirty(false);
      return;
    }
    this._setDirty(this.editorView.getValue() !== this.sourceCode);
  }

  private _setDirty(next: boolean): void {
    if (this._hasPendingChanges === next) return;
    this._hasPendingChanges = next;
    this.dispatchEvent(new CustomEvent<EditorDirtyEvent>('editor-dirty', {
      detail: { dirty: next },
      bubbles: true,
      composed: true,
    }));
  }

  private _ensureInputAreaMetadata(): void {
    const inputArea = this.renderRoot.querySelector('.inputarea') as HTMLTextAreaElement | null;
    if (!inputArea) return;
    if (!inputArea.id) inputArea.id = 'example-editor-input';
    if (!inputArea.name) inputArea.name = 'example-editor-input';
  }

  private _attachCtrlSHandler(): void {
    if (!this._editorHostElement) return;

    this._detachEditorKeydownHandler();
    this._editorKeydownHandler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      this._triggerRefreshPreview();
    };
    this._editorHostElement.addEventListener('keydown', this._editorKeydownHandler);
  }

  private _detachEditorKeydownHandler(): void {
    if (!this._editorHostElement || !this._editorKeydownHandler) return;
    this._editorHostElement.removeEventListener('keydown', this._editorKeydownHandler);
    this._editorKeydownHandler = undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-code-editor': EditorCode;
  }
}
