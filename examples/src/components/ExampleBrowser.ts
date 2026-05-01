import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { Example, ExamplesMap } from '../lib/types';
import { configureUrls } from '../lib/url-builder';
import {
  hasExamplesFor,
  getLoadErrorFor,
  getNestedExamples,
  getExampleByPath,
  getExamplesList,
  getAvailableTags,
  loadExamples,
  onExamplesLoaded,
} from '../lib/example-store';
import type { VersionInfo } from '../lib/versions';
import {
  getLatestStableId,
  getVersionById,
  getVersionLoadError,
  getVersions,
  hasVersions,
  loadVersionCatalog,
  onVersionsLoaded,
} from '../lib/versions';
import { detectRuntimeSupport, onRuntimeDetected } from '../lib/runtime-support';
import { appInfo } from '../lib/app-info';
import {
  loadStoredVersion,
  readUrlState,
  storeSelectedVersion,
  writeUrlState,
} from '../lib/url-state';
import { showToast } from '../lib/toast-store';
import type { SelectExampleEvent } from './NavigationLink';
import type { SelectVersionEvent } from './VersionPill';
import componentStyles from './ExampleBrowser.scss?inline';
import './AppHeader';
import './Navigation';
import './Editor';
import './ToastStack';

@customElement('example-browser')
export class ExampleBrowser extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @state() private _examples: ExamplesMap = new Map();
  @state() private _activeExample: Example | null = null;
  @state() private _availableTags: Array<string> = [];
  @state() private _versions: ReadonlyArray<VersionInfo> = [];
  @state() private _selectedVersion: VersionInfo | null = null;
  @state() private _loaded = false;
  @state() private _loadError: string | null = null;
  @state() private _sidebarOpen = window.matchMedia('(min-width: 1120px)').matches;

  private _unsubscribeExamples?: () => void;
  private _unsubscribeVersions?: () => void;
  private _unsubscribeRuntime?: () => void;
  private _popstateHandler = (): void => this._onPopState();
  private _desktopMediaQuery = window.matchMedia('(min-width: 1120px)');
  private _breakpointChangeHandler = (event: MediaQueryListEvent): void => this._onBreakpointChange(event);
  private _selectExampleHandler = (event: Event): void => this._onSelectExample(event as CustomEvent<SelectExampleEvent>);
  private _selectVersionHandler = (event: Event): void => this._onSelectVersion(event as CustomEvent<SelectVersionEvent>);

  // Tracks the version that was active before the most recent user-initiated
  // version change. Used to offer a "Back to vX" action on the missing-example
  // toast that fires when the user's active example doesn't exist in the new
  // version's catalog.
  private _previousVersionId: string | null = null;

  // Set true when the user explicitly selects a different version. Read once
  // by the next _resolveActiveExample run and then cleared. Initial loads
  // and back/forward navigation do not set this — they fall back silently.
  private _missingExampleToastEnabled = false;

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

    this._unsubscribeExamples = onExamplesLoaded(versionId => this._onCatalogLoaded(versionId));
    this._unsubscribeVersions = onVersionsLoaded(() => this._syncVersionState());
    this._unsubscribeRuntime = onRuntimeDetected(() => this.requestUpdate());

    window.addEventListener('popstate', this._popstateHandler);
    this.addEventListener('select-example', this._selectExampleHandler);
    this.addEventListener('select-version', this._selectVersionHandler);

    // Catalog ordering: versions must resolve before examples, since the
    // example catalog URL is version-aware (local for "current", remote
    // raw.githubusercontent for any released tag). The example load is
    // fired from _syncVersionState once a version is known.
    void loadVersionCatalog();
    void detectRuntimeSupport();
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribeExamples?.();
    this._unsubscribeVersions?.();
    this._unsubscribeRuntime?.();
    window.removeEventListener('popstate', this._popstateHandler);
    this.removeEventListener('select-example', this._selectExampleHandler);
    this.removeEventListener('select-version', this._selectVersionHandler);
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

  private _syncExampleState(): void {
    const selected = this._selectedVersion;
    if (!selected) return;

    this._loaded = hasExamplesFor(selected.id);
    this._loadError = getLoadErrorFor(selected.id);
    this._examples = getNestedExamples(selected.id);
    this._availableTags = getAvailableTags(selected.id);

    this._resolveActiveExample({ canonicaliseUrl: true });
  }

  private _onCatalogLoaded(loadedVersionId: string): void {
    // Late callbacks for versions the user has already moved past would
    // overwrite the visible state with stale data — drop them.
    if (this._selectedVersion?.id !== loadedVersionId) return;
    this._syncExampleState();
  }

  private _syncVersionState(): void {
    this._versions = getVersions();
    this._selectedVersion = this._resolveSelectedVersion();

    // On first load of the catalog, make sure the URL carries the version we
    // ended up on so the "share this link" surface reflects the real state.
    if (this._selectedVersion) {
      const current = readUrlState().version;
      if (current !== this._selectedVersion.id) {
        writeUrlState({ version: this._selectedVersion.id }, { replace: true });
      }
    }

    // Surface load failures in the load-error strip the editor already renders.
    const versionError = getVersionLoadError();
    if (versionError && !this._loadError) {
      this._loadError = versionError;
    }

    if (this._selectedVersion) {
      void this._ensureExamplesLoaded(this._selectedVersion.id);
    }
  }

  private _resolveSelectedVersion(): VersionInfo | null {
    if (!hasVersions()) return null;

    const fromUrl = getVersionById(readUrlState().version);
    if (fromUrl) return fromUrl;

    const stored = loadStoredVersion();
    const fromStored = getVersionById(stored);
    if (fromStored) return fromStored;

    const latest = getVersionById(getLatestStableId());
    if (latest) return latest;

    return getVersions()[0] ?? null;
  }

  // Loads the version's catalog if it isn't cached yet; otherwise refreshes
  // the view immediately. Either path eventually runs through
  // `_syncExampleState` so the active-example resolution stays in one place.
  private async _ensureExamplesLoaded(versionId: string): Promise<void> {
    if (hasExamplesFor(versionId)) {
      this._syncExampleState();
      return;
    }
    await loadExamples(versionId);
    // The examples-loaded listener fires `_onCatalogLoaded` which calls
    // `_syncExampleState` — no manual sync needed here.
  }

  private _resolveActiveExample(options: { canonicaliseUrl: boolean }): void {
    const selected = this._selectedVersion;
    if (!selected) return;
    if (!hasExamplesFor(selected.id)) return;

    const versionId = selected.id;
    const urlState = readUrlState();
    const requestedPath = urlState.example ?? null;

    const requested = requestedPath ? getExampleByPath(versionId, requestedPath) : null;
    const fellBack = requestedPath !== null && requested === null;
    const example = requested ?? getExamplesList(versionId)[0] ?? null;

    this._activeExample = example;

    if (options.canonicaliseUrl) {
      const nextExample = example?.path ?? null;
      const current = readUrlState();

      if (current.example !== nextExample || current.version !== versionId) {
        writeUrlState(
          { example: nextExample, version: versionId },
          { replace: true },
        );
      }
    }

    // The fallback toast only fires for explicit user version changes. Initial
    // page loads and back/forward navigation reach this code path with the
    // flag clear and stay quiet — the URL already represents what the user
    // asked for, and a toast on every stale link would be noisy.
    if (this._missingExampleToastEnabled) {
      this._missingExampleToastEnabled = false;
      if (fellBack && requestedPath) {
        this._showMissingExampleToast(requestedPath, versionId);
      }
    }
  }

  private _showMissingExampleToast(missingPath: string, currentVersionId: string): void {
    const previousId = this._previousVersionId;
    const action = previousId && previousId !== currentVersionId
      ? {
          label: `Back to v${previousId}`,
          onClick: () => this._reselectVersion(previousId),
        }
      : undefined;

    showToast(
      `"${missingPath}" isn't available in @codexo/exojs@${currentVersionId}`,
      action ? { action } : undefined,
    );
  }

  private _reselectVersion(versionId: string): void {
    const next = getVersionById(versionId);
    if (!next) return;
    if (this._selectedVersion?.id === versionId) return;

    this._previousVersionId = this._selectedVersion?.id ?? null;
    this._missingExampleToastEnabled = true;
    this._selectedVersion = next;
    storeSelectedVersion(versionId);
    writeUrlState({ version: versionId });
    void this._ensureExamplesLoaded(versionId);
  }

  private _onPopState(): void {
    const versionId = readUrlState().version;
    const next = getVersionById(versionId);

    if (next && this._selectedVersion?.id !== next.id) {
      this._selectedVersion = next;

      if (hasExamplesFor(next.id)) {
        this._loaded = true;
        this._loadError = getLoadErrorFor(next.id);
        this._examples = getNestedExamples(next.id);
        this._availableTags = getAvailableTags(next.id);
        // popstate should not canonicalise — back/forward landed us where the
        // history entry says, and we shouldn't fight that.
        this._resolveActiveExample({ canonicaliseUrl: false });
      } else {
        // Catalog not cached. The eventual `_onCatalogLoaded` will canonicalise,
        // but only against the URL we already have, so it's a no-op visually.
        void loadExamples(next.id);
      }
      return;
    }

    // No version change — re-resolve example against the current catalog.
    this._resolveActiveExample({ canonicaliseUrl: false });
  }

  private _onSelectExample(event: CustomEvent<SelectExampleEvent>): void {
    const path = event.detail?.path;
    if (!path) return;

    const selected = this._selectedVersion;
    if (!selected) return;

    const example = getExampleByPath(selected.id, path);
    if (!example) return;

    if (example.path === this._activeExample?.path) return;

    this._activeExample = example;
    writeUrlState({
      version: selected.id,
      example: example.path,
    });

    if (!this._desktopMediaQuery.matches) {
      this._sidebarOpen = false;
    }
  }

  private _onSelectVersion(event: CustomEvent<SelectVersionEvent>): void {
    const id = event.detail?.id;
    if (!id) return;

    const next = getVersionById(id);
    if (!next) return;

    if (this._selectedVersion?.id === id) return;

    this._previousVersionId = this._selectedVersion?.id ?? null;
    this._missingExampleToastEnabled = true;
    this._selectedVersion = next;
    storeSelectedVersion(id);
    writeUrlState({ version: id });

    showToast(`Switched to @codexo/exojs@${id}`);

    void this._ensureExamplesLoaded(id);
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
          .selectedVersion=${this._selectedVersion}
          .loadError=${this._loadError}
          .loaded=${this._loaded}
        ></exo-navigation>
      </aside>
      <div class="right-column">
        <exo-app-header
          role="banner"
          .activeExample=${this._activeExample}
          .sidebarOpen=${this._sidebarOpen}
          .version=${appInfo.version}
          .packageName=${appInfo.packageName}
          .repositoryUrl=${appInfo.repositoryUrl}
          .license=${appInfo.license}
          .author=${appInfo.author}
          .versions=${this._versions}
          .selectedVersion=${this._selectedVersion}
          @toggle-sidebar=${this._onToggleSidebar}
        ></exo-app-header>
        <main class="main-content">
          <exo-editor
            .activeExample=${this._activeExample}
            .catalogLoadError=${this._loadError}
            .selectedVersionId=${this._selectedVersion?.id ?? ''}
          ></exo-editor>
        </main>
      </div>
      ${this._sidebarOpen
        ? html`<div class="backdrop" @click=${this._onToggleSidebar}></div>`
        : ''}
      <exo-toast-stack></exo-toast-stack>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'example-browser': ExampleBrowser;
  }
}
