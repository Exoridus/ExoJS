import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import type { Example, ExamplesMap } from '../lib/types';
import { configureUrlsFromLocation } from '../lib/url-builder';
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
import { CURRENT_VERSION_ID, getLatestStableId, getVersionById, getVersionLoadError, getVersions, hasVersions, loadVersionCatalog, onVersionsLoaded } from '../lib/versions';
import { detectRuntimeSupport, onRuntimeDetected } from '../lib/runtime-support';
import { loadStoredVersion, readUrlState, storeSelectedVersion, writeUrlState } from '../lib/url-state';
import { showToast } from '../lib/toast-store';
import type { SelectExampleEvent } from './NavigationLink';
import type { SelectVersionEvent } from './VersionPill';
import componentStyles from './ExampleBrowser.scss?inline';
import type { BottomSheet } from './BottomSheet';
import type { Editor } from './Editor';
import './AppHeader';
import './Navigation';
import './Editor';
import './ToastStack';
import './BottomSheet';

@customElement('example-browser')
export class ExampleBrowser extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @property({ type: String, attribute: 'base-url' }) public baseUrl = '/';
    @state() private _examples: ExamplesMap = new Map();
    @state() private _activeExample: Example | null = null;
    @state() private _availableTags: Array<string> = [];
    @state() private _versions: ReadonlyArray<VersionInfo> = [];
    @state() private _selectedVersion: VersionInfo | null = null;
    @state() private _loaded = false;
    @state() private _loadError: string | null = null;
    @state() private _sidebarOpen = window.matchMedia('(min-width: 1120px)').matches;
    @state() private _isCompactMobile = window.matchMedia('(max-width: 760px)').matches;
    @state() private _mobileExamplesSheetOpen = false;

    private _unsubscribeExamples?: () => void;
    private _unsubscribeVersions?: () => void;
    private _unsubscribeRuntime?: () => void;
    private _popstateHandler = (): void => this._onPopState();
    private _desktopMediaQuery = window.matchMedia('(min-width: 1120px)');
    private _compactMobileMediaQuery = window.matchMedia('(max-width: 760px)');
    private _breakpointChangeHandler = (event: MediaQueryListEvent): void => this._onBreakpointChange(event);
    private _compactMobileBreakpointChangeHandler = (event: MediaQueryListEvent): void => this._onCompactMobileBreakpointChange(event);
    private _documentKeydownHandler = (event: KeyboardEvent): void => this._onDocumentKeyDown(event);
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
    private _bodyOverflowBeforeDrawerOpen: string | null = null;
    @query('#playground-examples-sheet') private _examplesSheet?: BottomSheet;
    @query('exo-editor') private _editor?: Editor;
    @query('.mobile-action--examples') private _mobileExamplesButton?: HTMLButtonElement;

    public override connectedCallback(): void {
        super.connectedCallback();

        this._desktopMediaQuery.addEventListener('change', this._breakpointChangeHandler);
        this._compactMobileMediaQuery.addEventListener('change', this._compactMobileBreakpointChangeHandler);
        this._isCompactMobile = this._compactMobileMediaQuery.matches;

        configureUrlsFromLocation(this.baseUrl);

        this._unsubscribeExamples = onExamplesLoaded(versionId => this._onCatalogLoaded(versionId));
        this._unsubscribeVersions = onVersionsLoaded(() => this._syncVersionState());
        this._unsubscribeRuntime = onRuntimeDetected(() => this.requestUpdate());

        window.addEventListener('popstate', this._popstateHandler);
        document.addEventListener('keydown', this._documentKeydownHandler);
        this.addEventListener('select-example', this._selectExampleHandler);
        this.addEventListener('select-version', this._selectVersionHandler);

        // Catalog ordering: versions must resolve before examples, since the
        // example catalog URL is version-aware (local for "current", remote
        // raw.githubusercontent for any released tag). The example load is
        // fired from _syncVersionState once a version is known.
        void loadVersionCatalog();
        void detectRuntimeSupport();

        if (this._isCompactMobile) {
            this._setSidebarOpen(false, { restoreFocus: false });
        }
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._unsubscribeExamples?.();
        this._unsubscribeVersions?.();
        this._unsubscribeRuntime?.();
        window.removeEventListener('popstate', this._popstateHandler);
        document.removeEventListener('keydown', this._documentKeydownHandler);
        this.removeEventListener('select-example', this._selectExampleHandler);
        this.removeEventListener('select-version', this._selectVersionHandler);
        this._desktopMediaQuery.removeEventListener('change', this._breakpointChangeHandler);
        this._compactMobileMediaQuery.removeEventListener('change', this._compactMobileBreakpointChangeHandler);
        this._unlockBodyScroll();
    }

    private _onBreakpointChange(event: MediaQueryListEvent): void {
        this.setAttribute('data-resizing', '');

        if (event.matches) {
            this._setSidebarOpen(true, { restoreFocus: false });
        } else {
            this._setSidebarOpen(false, { restoreFocus: false });
        }

        requestAnimationFrame(() => {
            this.removeAttribute('data-resizing');
        });
    }

    private _onCompactMobileBreakpointChange(event: MediaQueryListEvent): void {
        this._isCompactMobile = event.matches;

        if (event.matches) {
            this._setSidebarOpen(false, { restoreFocus: false });
            return;
        }

        this._hideExamplesSheet();
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

        const current = getVersionById(CURRENT_VERSION_ID);
        if (current) return current;

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
                writeUrlState({ example: nextExample, version: versionId }, { replace: true });
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
        const action =
            previousId && previousId !== currentVersionId
                ? {
                      label: `Back to v${previousId}`,
                      onClick: () => this._reselectVersion(previousId),
                  }
                : undefined;

        showToast(`"${missingPath}" isn't available in @codexo/exojs@${currentVersionId}`, action ? { action } : undefined);
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

        if (this._isCompactMobile) {
            this._hideExamplesSheet();
        } else if (!this._desktopMediaQuery.matches) {
            this._setSidebarOpen(false, { restoreFocus: false });
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
        this._setSidebarOpen(!this._sidebarOpen, { restoreFocus: this._sidebarOpen });
    }

    private _onDocumentKeyDown(event: KeyboardEvent): void {
        if (!this._sidebarOpen || this._desktopMediaQuery.matches) return;
        const sidebar = this._getSidebarElement();
        if (!sidebar) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this._setSidebarOpen(false, { restoreFocus: true });
            return;
        }

        if (event.key !== 'Tab') return;

        const focusables = this._getFocusableInSidebar();
        if (focusables.length === 0) {
            event.preventDefault();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
            return;
        }

        if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    private _setSidebarOpen(nextOpen: boolean, options: { restoreFocus: boolean }): void {
        if (this._sidebarOpen === nextOpen) return;
        this._sidebarOpen = nextOpen;
        this._syncDrawerAccessibility(nextOpen, options);
    }

    private _syncDrawerAccessibility(open: boolean, options: { restoreFocus: boolean }): void {
        const sidebar = this._getSidebarElement();
        const content = this._getMainColumnElement();
        if (!sidebar || !content) return;

        const isMobile = !this._desktopMediaQuery.matches;

        if (!isMobile) {
            this._unlockBodyScroll();
            content.removeAttribute('inert');
            sidebar.removeAttribute('role');
            sidebar.removeAttribute('aria-modal');
            sidebar.removeAttribute('aria-label');
            return;
        }

        if (open) {
            this._lockBodyScroll();
            content.setAttribute('inert', '');
            sidebar.setAttribute('role', 'dialog');
            sidebar.setAttribute('aria-modal', 'true');
            sidebar.setAttribute('aria-label', 'Examples navigation');
            requestAnimationFrame(() => {
                const focusables = this._getFocusableInSidebar();
                focusables[0]?.focus();
            });
            return;
        }

        this._unlockBodyScroll();
        content.removeAttribute('inert');
        sidebar.removeAttribute('role');
        sidebar.removeAttribute('aria-modal');
        sidebar.removeAttribute('aria-label');

        if (options.restoreFocus) {
            requestAnimationFrame(() => this._focusMenuButton());
        }
    }

    private _lockBodyScroll(): void {
        if (this._bodyOverflowBeforeDrawerOpen === null) {
            this._bodyOverflowBeforeDrawerOpen = document.body.style.overflow;
        }
        document.body.style.overflow = 'hidden';
    }

    private _unlockBodyScroll(): void {
        if (this._bodyOverflowBeforeDrawerOpen !== null) {
            document.body.style.overflow = this._bodyOverflowBeforeDrawerOpen;
            this._bodyOverflowBeforeDrawerOpen = null;
        }
    }

    private _focusMenuButton(): void {
        const header = this.renderRoot.querySelector('exo-app-header');
        if (header instanceof HTMLElement && 'focusMenuButton' in header) {
            (header as { focusMenuButton: () => void }).focusMenuButton();
        }
    }

    private _getSidebarElement(): HTMLElement | null {
        const sidebar = this.renderRoot.querySelector('.side-content');
        return sidebar instanceof HTMLElement ? sidebar : null;
    }

    private _getMainColumnElement(): HTMLElement | null {
        const column = this.renderRoot.querySelector('.right-column');
        return column instanceof HTMLElement ? column : null;
    }

    private _getFocusableInSidebar(): Array<HTMLElement> {
        const sidebar = this._getSidebarElement();
        if (!sidebar) return [];

        const selector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ].join(',');

        return Array.from(sidebar.querySelectorAll(selector)).filter(
            (node): node is HTMLElement => node instanceof HTMLElement && !node.hidden
        );
    }

    private _showExamplesSheet(): void {
        if (!this._isCompactMobile) return;
        this._examplesSheet?.show(this._mobileExamplesButton);
    }

    private _hideExamplesSheet(): void {
        this._examplesSheet?.hide();
    }

    private _onExamplesSheetToggle(event: CustomEvent<{ open: boolean }>): void {
        this._mobileExamplesSheetOpen = event.detail.open;
    }

    private _onMobileRun(): void {
        this._editor?.triggerReload();
    }

    public render(): ReturnType<LitElement['render']> {
        const hasActiveExample = this._activeExample !== null;

        return html`
            ${!this._isCompactMobile
                ? html`
                      <aside id="playground-navigation" class="side-content" ?data-open=${this._sidebarOpen} aria-hidden=${String(!this._sidebarOpen)}>
                          <exo-navigation
                              .examples=${this._examples}
                              .activeExample=${this._activeExample}
                              .availableTags=${this._availableTags}
                              .selectedVersion=${this._selectedVersion}
                              .loadError=${this._loadError}
                              .loaded=${this._loaded}
                          ></exo-navigation>
                      </aside>
                  `
                : null}
            <div class="right-column">
                <exo-app-header
                    role="banner"
                    .activeExample=${this._activeExample}
                    .sidebarOpen=${this._sidebarOpen}
                    .showSidebarToggle=${!this._isCompactMobile}
                    sidebarControls="playground-navigation"
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
                ${this._isCompactMobile
                    ? html`
                          <nav class="mobile-actions" aria-label="Playground actions">
                              <button
                                  class="mobile-action mobile-action--examples"
                                  type="button"
                                  aria-haspopup="dialog"
                                  aria-expanded=${String(this._mobileExamplesSheetOpen)}
                                  @click=${this._showExamplesSheet}
                              >
                                  Examples
                              </button>
                              <button class="mobile-action mobile-action--run" type="button" ?disabled=${!hasActiveExample} @click=${this._onMobileRun}>
                                  Run
                              </button>
                          </nav>
                      `
                    : null}
            </div>
            ${!this._isCompactMobile && this._sidebarOpen ? html`<div class="backdrop" @click=${this._onToggleSidebar}></div>` : ''}
            ${this._isCompactMobile
                ? html`
                      <exo-bottom-sheet id="playground-examples-sheet" title="Examples" @sheet-toggle=${this._onExamplesSheetToggle}>
                          <exo-navigation
                              class="sheet-navigation"
                              .examples=${this._examples}
                              .activeExample=${this._activeExample}
                              .availableTags=${this._availableTags}
                              .selectedVersion=${this._selectedVersion}
                              .loadError=${this._loadError}
                              .loaded=${this._loaded}
                          ></exo-navigation>
                      </exo-bottom-sheet>
                  `
                : null}
            <exo-toast-stack></exo-toast-stack>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'example-browser': ExampleBrowser;
    }
}
