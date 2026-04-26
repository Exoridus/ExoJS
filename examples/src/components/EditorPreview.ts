import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import type { Example, PreviewErrorEntry, UrlParams } from '../lib/types';
import { buildIframeUrl } from '../lib/url-builder';
import componentStyles from './EditorPreview.scss?inline';
import './LoadingSpinner';

interface ExamplePreviewWindow extends Window {
  __EXAMPLE_META__?: Example | null;
  __EXAMPLE_PREVIEW_ERROR_RENDERED__?: boolean;
}

export interface PreviewShellState {
  canFocusPreview: boolean;
}

@customElement('exo-preview')
export class EditorPreview extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: String }) public sourceCode: string | null = null;
  @property({ attribute: false }) public exampleMeta: Example | null = null;
  @property({ type: String }) public selectedVersionId = '';
  @state() private _updateId = 0;
  @query('iframe') private _iframeElement?: HTMLIFrameElement;

  private _previewErrors: Array<PreviewErrorEntry> = [];
  private _canvasMutationObserver: MutationObserver | null = null;
  private _canvasAttributeObserver: MutationObserver | null = null;
  private _currentCanvasWidth = 0;
  private _currentCanvasHeight = 0;
  private _currentZoom = 1;
  private _windowResizeHandler = (): void => this._recalculateZoom();
  private _preventScrollHandler = (event: KeyboardEvent): void => {
    if (document.activeElement !== this._iframeElement) return;
    if ([32, 33, 34, 35, 36, 37, 38, 39, 40].includes(event.keyCode)) {
      event.preventDefault();
    }
  };

  public render(): ReturnType<LitElement['render']> {
    if (!this.sourceCode) {
      return html`<exo-spinner centered></exo-spinner>`;
    }

    // Phase 2: pass the selected version through to preview.html so it can
    // build a versioned import map (`vendor/exojs/<v>/exo.esm.js`). Omit the
    // key when empty so the URL stays clean and preview.html's fallback
    // (flat vendor path) kicks in until P2-09 retires the flat tree.
    const params: UrlParams = { 'no-cache': this._updateId };
    if (this.selectedVersionId) {
      params.v = this.selectedVersionId;
    }
    const iframeUrl = buildIframeUrl(params);

    return html`
      <iframe
        class="preview"
        @load=${this._onLoadIframe}
        @error=${this._onErrorIframe}
        @pointerdown=${this._onInteractWithPreview}
        allow="autoplay"
        tabindex="0"
        src=${iframeUrl}
      ></iframe>
    `;
  }

  public override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('resize', this._windowResizeHandler);
    window.addEventListener('keydown', this._preventScrollHandler);
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('resize', this._windowResizeHandler);
    window.removeEventListener('keydown', this._preventScrollHandler);
    this._disconnectCanvasObservers();
  }

  protected override willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
    if (changedProperties.has('sourceCode')) {
      this._updateId += 1;
      this._disconnectCanvasObservers();
      this._currentCanvasWidth = 0;
      this._currentCanvasHeight = 0;
      this._currentZoom = 1;
      this.style.removeProperty('--canvas-w');
      this.style.removeProperty('--canvas-h');
      this.style.removeProperty('--preview-zoom');
      this._syncShellState();
      this._emitCanvasSize();
    }
  }

  public focusPreviewSurface(): void {
    this._iframeElement?.focus();
    this._iframeElement?.contentWindow?.focus();
    this._iframeElement?.contentDocument?.body?.focus();
  }

  private _onLoadIframe(event: Event): void {
    const iframe = event.composedPath()[0] as HTMLIFrameElement;
    const iframeBody = (iframe.contentDocument ?? iframe.contentWindow?.document)?.body as HTMLBodyElement | null;

    if (!iframeBody || !this.sourceCode) {
      return;
    }

    const iframeWindow = iframe.contentWindow as ExamplePreviewWindow | null;

    this._syncPreviewErrors([]);

    if (iframeWindow) {
      iframeWindow.__EXAMPLE_META__ = this.exampleMeta;
      this._installPreviewErrorHandlers(iframeWindow, iframeBody);
    }

    iframeBody.tabIndex = -1;
    this._executePreviewSource(iframeBody);
    this._watchForCanvas(iframeBody);
    this.focusPreviewSurface();
    this._syncShellState();
  }

  private _installPreviewErrorHandlers(iframeWindow: ExamplePreviewWindow, iframeBody: HTMLBodyElement): void {
    iframeWindow.__EXAMPLE_PREVIEW_ERROR_RENDERED__ = false;

    iframeWindow.onerror = (message, _source, _lineno, _colno, error) => {
      const previewError = this._createPreviewErrorEntry(error, message);

      if (this._isRecoverablePreviewError(previewError.summary)) {
        this._blankPreviewSurface(iframeBody);
        return true;
      }

      this._syncPreviewErrors([previewError]);
      this._renderExecutionError(iframeBody);
      return true;
    };

    iframeWindow.onunhandledrejection = (event: PromiseRejectionEvent) => {
      const previewError = this._createPreviewErrorEntry(event.reason);

      if (this._isRecoverablePreviewError(previewError.summary)) {
        event.preventDefault();
        this._blankPreviewSurface(iframeBody);
        return;
      }

      event.preventDefault();
      this._syncPreviewErrors([previewError]);
      this._renderExecutionError(iframeBody);
    };
  }

  private _watchForCanvas(iframeBody: HTMLBodyElement): void {
    this._disconnectCanvasObservers();

    const existing = iframeBody.querySelector('canvas');
    if (existing) {
      this._observeCanvas(existing);
      return;
    }

    this._canvasMutationObserver = new MutationObserver(() => {
      const canvas = iframeBody.querySelector('canvas');
      if (canvas) {
        this._canvasMutationObserver?.disconnect();
        this._canvasMutationObserver = null;
        this._observeCanvas(canvas);
      }
    });

    this._canvasMutationObserver.observe(iframeBody, { childList: true, subtree: true });
  }

  private _observeCanvas(canvas: HTMLCanvasElement): void {
    this._applyCanvasSize(canvas.width, canvas.height);

    this._canvasAttributeObserver = new MutationObserver(() => {
      this._applyCanvasSize(canvas.width, canvas.height);
    });

    this._canvasAttributeObserver.observe(canvas, {
      attributes: true,
      attributeFilter: ['width', 'height'],
    });
  }

  private _applyCanvasSize(width: number, height: number): void {
    if (!width || !height) return;

    this._currentCanvasWidth = width;
    this._currentCanvasHeight = height;
    this.style.setProperty('--canvas-w', `${width}px`);
    this.style.setProperty('--canvas-h', `${height}px`);
    this._recalculateZoom();
    this._emitCanvasSize();
  }

  private _recalculateZoom(): void {
    if (!this._currentCanvasWidth) return;

    const zoom = Math.min(1, window.innerWidth / this._currentCanvasWidth);
    this._currentZoom = zoom;
    this.style.setProperty('--preview-zoom', String(zoom));
    this._emitCanvasSize();
  }

  private _emitCanvasSize(): void {
    this.dispatchEvent(
      new CustomEvent<{ width: number; height: number; zoom: number }>('preview-canvas-size', {
        detail: {
          width: this._currentCanvasWidth,
          height: this._currentCanvasHeight,
          zoom: this._currentZoom,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _disconnectCanvasObservers(): void {
    this._canvasMutationObserver?.disconnect();
    this._canvasMutationObserver = null;
    this._canvasAttributeObserver?.disconnect();
    this._canvasAttributeObserver = null;
  }

  private _isRecoverablePreviewError(message: string): boolean {
    const normalized = message.toLowerCase();

    return (
      normalized.includes('does not support webgl') ||
      normalized.includes('failed to create a webgl') ||
      normalized.includes('webgl is not supported') ||
      normalized.includes('requires browser webgpu support') ||
      normalized.includes('requires advanced webgpu support') ||
      normalized.includes('webgpu unavailable') ||
      normalized.includes('could not acquire a webgpu adapter') ||
      normalized.includes('webgpu setup failed')
    );
  }

  private _blankPreviewSurface(iframeBody: HTMLBodyElement): void {
    const iframeWindow = iframeBody.ownerDocument.defaultView as ExamplePreviewWindow | null;

    if (iframeWindow?.__EXAMPLE_PREVIEW_ERROR_RENDERED__) {
      return;
    }

    if (iframeWindow) {
      iframeWindow.__EXAMPLE_PREVIEW_ERROR_RENDERED__ = true;
    }

    // Mark the body so test environments (and future tooling) can detect that the
    // preview was intentionally blanked after a recoverable runtime failure.
    iframeBody.setAttribute('data-preview-blanked', '');
    iframeBody.replaceChildren();

    Object.assign(iframeBody.style, {
      display: 'block',
      background: '#0b0d12',
      color: '#f4f6fb',
      fontFamily: '"Segoe UI", sans-serif',
    });
  }

  private _renderExecutionError(iframeBody: HTMLBodyElement): void {
    iframeBody.replaceChildren();

    Object.assign(iframeBody.style, {
      display: 'block',
      background: '#0b0d12',
      color: '#f4f6fb',
      fontFamily: '"Segoe UI", sans-serif',
    });
  }

  private _createPreviewErrorEntry(error: unknown, fallbackMessage?: string | Event): PreviewErrorEntry {
    if (error instanceof Error) {
      return {
        summary: error.message,
        details: error.stack ?? error.message,
      };
    }

    if (typeof fallbackMessage === 'string' && fallbackMessage.trim()) {
      return {
        summary: fallbackMessage,
        details: String(error || fallbackMessage),
      };
    }

    return {
      summary: String(error),
      details: String(error),
    };
  }

  private _syncPreviewErrors(errors: Array<PreviewErrorEntry>): void {
    const nextErrors = errors.filter(error => !!error.summary);

    if (
      nextErrors.length === this._previewErrors.length &&
      nextErrors.every(
        (error, index) =>
          error.summary === this._previewErrors[index]?.summary &&
          error.details === this._previewErrors[index]?.details
      )
    ) {
      return;
    }

    this._previewErrors = nextErrors;
    this._syncShellState();

    this.dispatchEvent(
      new CustomEvent('preview-errors', {
        detail: { errors: nextErrors },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onErrorIframe(event: Event | string): void {
    const summary = typeof event === 'string' ? event : 'The preview iframe failed to load.';
    this._syncPreviewErrors([{ summary, details: summary }]);
  }

  private _syncShellState(): void {
    const shellState: PreviewShellState = {
      canFocusPreview: !!this._iframeElement,
    };

    this.dispatchEvent(
      new CustomEvent('preview-state', {
        detail: { state: shellState },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _executePreviewSource(iframeBody: HTMLBodyElement): void {
    if (!this.sourceCode) return;

    const script = iframeBody.ownerDocument.createElement('script');
    script.type = 'module';
    script.textContent = `${this.sourceCode}\n`;
    iframeBody.appendChild(script);
  }

  private _onInteractWithPreview(): void {
    this.focusPreviewSurface();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-preview': EditorPreview;
  }
}
