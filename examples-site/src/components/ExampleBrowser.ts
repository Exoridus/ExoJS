import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { Example, ExamplesMap } from '../lib/types';
import { configureUrls } from '../lib/url-builder';
import {
  hasExamples,
  getLoadError,
  getNestedExamples,
  getExampleByPath,
  getExamplesList,
  getAvailableTags,
  loadExamples,
  onExamplesLoaded,
} from '../lib/example-store';
import { detectRuntimeSupport, onRuntimeDetected } from '../lib/runtime-support';
import componentStyles from './ExampleBrowser.scss?inline';
import './AppHeader';
import './Navigation';
import './Editor';

@customElement('example-browser')
export class ExampleBrowser extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @state() private _examples: ExamplesMap = new Map();
  @state() private _activeExample: Example | null = null;
  @state() private _availableTags: Array<string> = [];
  @state() private _loaded = false;
  @state() private _loadError: string | null = null;
  @state() private _sidebarOpen = window.matchMedia('(min-width: 1120px)').matches;

  private _unsubscribeExamples?: () => void;
  private _unsubscribeRuntime?: () => void;
  private _hashChangeHandler = (): void => this._onHashChange();
  private _desktopMediaQuery = window.matchMedia('(min-width: 1120px)');
  private _breakpointChangeHandler = (event: MediaQueryListEvent): void => this._onBreakpointChange(event);

  public override connectedCallback(): void {
    super.connectedCallback();

    this._desktopMediaQuery.addEventListener('change', this._breakpointChangeHandler);

    configureUrls({
      baseUrl: new URL('.', document.baseURI).toString(),
      iframeUrl: 'preview.html',
      assetsDir: 'assets',
      examplesDir: 'examples',
      publicDir: '.',
    });

    this._unsubscribeExamples = onExamplesLoaded(() => this._syncStoreState());
    this._unsubscribeRuntime = onRuntimeDetected(() => this.requestUpdate());

    window.addEventListener('hashchange', this._hashChangeHandler);

    void loadExamples();
    void detectRuntimeSupport();
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribeExamples?.();
    this._unsubscribeRuntime?.();
    window.removeEventListener('hashchange', this._hashChangeHandler);
    this._desktopMediaQuery.removeEventListener('change', this._breakpointChangeHandler);
  }

  private _onBreakpointChange(event: MediaQueryListEvent): void {
    this.setAttribute('data-resizing', '');

    if (event.matches) {
      this._sidebarOpen = true;
    } else {
      this._sidebarOpen = false;
    }

    requestAnimationFrame(() => {
      this.removeAttribute('data-resizing');
    });
  }

  private _syncStoreState(): void {
    this._loaded = hasExamples();
    this._loadError = getLoadError();
    this._examples = getNestedExamples();
    this._availableTags = getAvailableTags();

    this._onHashChange();
  }

  private _onHashChange(): void {
    if (!hasExamples()) return;

    const hash = window.location.hash.slice(1);

    if (!hash) {
      const firstExample = getExamplesList()[0];
      if (firstExample) {
        window.location.hash = firstExample.path;
      }
      return;
    }

    const example = getExampleByPath(hash);
    this._activeExample = example;
  }

  private _onToggleSidebar(): void {
    this._sidebarOpen = !this._sidebarOpen;
  }

  public render(): ReturnType<LitElement['render']> {
    return html`
      <aside class="side-content" ?data-open=${this._sidebarOpen}>
        <exo-navigation
          .examples=${this._examples}
          .activeExample=${this._activeExample}
          .availableTags=${this._availableTags}
          .loadError=${this._loadError}
          .loaded=${this._loaded}
        ></exo-navigation>
      </aside>
      <div class="right-column">
        <exo-app-header
          .activeExample=${this._activeExample}
          .sidebarOpen=${this._sidebarOpen}
          @toggle-sidebar=${this._onToggleSidebar}
        ></exo-app-header>
        <main class="main-content">
          <exo-editor
            .activeExample=${this._activeExample}
            .catalogLoadError=${this._loadError}
          ></exo-editor>
        </main>
      </div>
      ${this._sidebarOpen
        ? html`<div class="backdrop" @click=${this._onToggleSidebar}></div>`
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'example-browser': ExampleBrowser;
  }
}
