import { useCallback, useEffect, useRef, useState } from 'react';

import { getNextPlaygroundHighlight, getPlaygroundDefault } from '../lib/curation-catalog';
import {
  getExampleByPath,
  getExamplesList,
  getLoadErrorFor,
  getNestedExamples,
  hasExamplesFor,
  loadExamples,
  onExamplesLoaded,
} from '../lib/example-store';
import { activateModalFocus } from '../lib/modal-focus';
import { playgroundDrafts } from '../lib/playground-drafts';
import { detectRuntimeSupport, onRuntimeDetected } from '../lib/runtime-support';
import type { Example, ExamplesMap } from '../lib/types';
import { configureUrlsFromLocation } from '../lib/url-builder';
import { loadStoredVersion, readUrlState, storeSelectedVersion, writeUrlState } from '../lib/url-state';
import {
  CURRENT_VERSION_ID,
  getLatestStableId,
  getVersionById,
  getVersionLoadError,
  getVersions,
  hasVersions,
  loadVersionCatalog,
  onVersionsLoaded,
  type VersionInfo,
} from '../lib/versions';
import { BottomSheet } from './BottomSheet';
import { Editor } from './Editor';
import styles from './ExampleBrowser.module.scss';
import { Navigation } from './Navigation';
import { SidebarToggle } from './PlaygroundButtons';
import { css, cx } from './react-utils';
import { ToastStack } from './ToastStack';

export interface ExampleBrowserProps {
  baseUrl: string;
  locale?: 'en' | 'de';
}

export const ExampleBrowser = ({ baseUrl, locale = 'en' }: ExampleBrowserProps): JSX.Element => {
  const [examples, setExamples] = useState<ExamplesMap>(() => new Map());
  const [activeExample, setActiveExample] = useState<Example | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<VersionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [versionLoadError, setVersionLoadError] = useState<string | null>(null);
  const [searchRequest, setSearchRequest] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isCompactMobile, setIsCompactMobile] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [examplesSheetOpen, setExamplesSheetOpen] = useState(false);
  const [examplesSheetOpener, setExamplesSheetOpener] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const navigationRef = useRef<HTMLElement | null>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileExamplesButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedVersionRef = useRef<VersionInfo | null>(null);
  const activeExampleRef = useRef<Example | null>(null);
  const breakpointRef = useRef<{ desktop: boolean; compact: boolean } | null>(null);

  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent): void => {
      if (playgroundDrafts.hasUnpersistedChanges()) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', warnUnsaved);

    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, []);

  useEffect(() => {
    selectedVersionRef.current = selectedVersion;
  }, [selectedVersion]);

  useEffect(() => {
    activeExampleRef.current = activeExample;
  }, [activeExample]);

  useEffect(() => {
    const root = rootRef.current;
    const chrome = Array.from(document.querySelectorAll<HTMLElement>('[data-app-header], [data-channel-banner]'));

    const measureChrome = (): void => {
      const height = chrome.reduce((sum, element) => sum + element.getBoundingClientRect().height, 0);
      root?.style.setProperty('--playground-chrome-height', `${height}px`);
    };

    const observer = new ResizeObserver(measureChrome);

    chrome.forEach(element => observer.observe(element));
    measureChrome();

    return () => observer.disconnect();
  }, []);

  const resolveSelectedVersion = useCallback((): VersionInfo | null => {
    if (!hasVersions()) {
      return null;
    }

    const fromUrl = getVersionById(readUrlState().version);

    if (fromUrl) {
      return fromUrl;
    }

    const stored = loadStoredVersion();
    const fromStored = getVersionById(stored);

    if (fromStored) {
      return fromStored;
    }

    const current = getVersionById(CURRENT_VERSION_ID);

    if (current) {
      return current;
    }

    const latest = getVersionById(getLatestStableId());

    if (latest) {
      return latest;
    }

    return getVersions()[0] ?? null;
  }, []);

  const resolveActiveExample = useCallback((options: { canonicaliseUrl: boolean }): void => {
    const selected = selectedVersionRef.current;
    const requestedState = readUrlState();

    if (!selected || (requestedState.version && requestedState.version !== selected.id) || !hasExamplesFor(selected.id)) {
      return;
    }

    const versionId = selected.id;
    const requestedPath = requestedState.example;
    const requested = requestedPath ? getExampleByPath(versionId, requestedPath) : null;

    if (requestedPath && !requested) {
      setActiveExample(null);
      setSelectionError(
        `The example "${requestedPath.replace(/\.js$/, '')}" is not available in ${versionId}. Choose an example from the list or open the starting example.`,
      );

      return;
    }

    const example = requested ?? getPlaygroundDefault(getExamplesList(versionId));
    setSelectionError(example ? null : 'This version has no examples. Open the current Playground to continue.');
    setActiveExample(example);

    if (options.canonicaliseUrl) {
      const nextExample = example?.path ?? null;
      const current = readUrlState();

      if (current.example !== nextExample || current.version !== versionId) {
        writeUrlState({ example: nextExample, version: versionId }, { replace: true });
      }
    }
  }, []);

  const syncExampleState = useCallback((): void => {
    const selected = selectedVersionRef.current;

    if (!selected) {
      return;
    }

    setLoaded(hasExamplesFor(selected.id));
    setLoadError(getLoadErrorFor(selected.id));
    setExamples(getNestedExamples(selected.id));
    resolveActiveExample({ canonicaliseUrl: true });
  }, [resolveActiveExample]);

  const ensureExamplesLoaded = useCallback(
    async (versionId: string): Promise<void> => {
      if (hasExamplesFor(versionId)) {
        syncExampleState();

        return;
      }

      await loadExamples(versionId);
    },
    [syncExampleState],
  );

  const syncVersionState = useCallback((): void => {
    const requestedVersion = readUrlState().version;

    if (requestedVersion && !getVersionById(requestedVersion)) {
      selectedVersionRef.current = null;
      activeExampleRef.current = null;
      setSelectedVersion(null);
      setExamples(new Map());
      setLoaded(false);
      setLoadError(null);
      setSelectionError(`The requested version "${requestedVersion}" is not recognized. Open the current Playground to continue.`);
      setActiveExample(null);

      return;
    }

    const nextSelected = resolveSelectedVersion();
    setSelectedVersion(nextSelected);
    selectedVersionRef.current = nextSelected;

    if (nextSelected) {
      const current = readUrlState().version;

      if (current !== nextSelected.id) {
        writeUrlState({ version: nextSelected.id }, { replace: true });
      }
    }

    setVersionLoadError(getVersionLoadError());

    if (nextSelected) {
      void ensureExamplesLoaded(nextSelected.id);
    }
  }, [ensureExamplesLoaded, resolveSelectedVersion]);

  useEffect(() => {
    configureUrlsFromLocation(baseUrl);

    const unsubscribeExamples = onExamplesLoaded(versionId => {
      if (selectedVersionRef.current?.id !== versionId) {
        return;
      }

      syncExampleState();
    });
    const unsubscribeVersions = onVersionsLoaded(syncVersionState);
    const unsubscribeRuntime = onRuntimeDetected(() => {
      setExamples(current => new Map(current));
    });

    void loadVersionCatalog();
    void detectRuntimeSupport();

    return () => {
      unsubscribeExamples();
      unsubscribeVersions();
      unsubscribeRuntime();
    };
  }, [baseUrl, syncExampleState, syncVersionState]);

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia('(min-width: 1120px)');
    const compactMobileMediaQuery = window.matchMedia('(max-width: 760px)');

    const syncBreakpoints = (): void => {
      const desktop = desktopMediaQuery.matches;
      const compact = compactMobileMediaQuery.matches;

      if (breakpointRef.current?.desktop === desktop && breakpointRef.current.compact === compact) {
        return;
      }

      breakpointRef.current = { desktop, compact };
      // Mirror viewport media-query state into React - the canonical
      // "subscribe to an external system, setState on change" effect use.
      // The synchronous initial call is the SSR-safe form of that pattern.
      /* eslint-disable @eslint-react/set-state-in-effect */
      setIsCompactMobile(compact);
      setIsDesktop(desktop);
      setSidebarOpen(desktop && !compact);

      if (!compact) {
        setExamplesSheetOpen(false);
      }
      /* eslint-enable @eslint-react/set-state-in-effect */
    };

    syncBreakpoints();
    desktopMediaQuery.addEventListener('change', syncBreakpoints);
    compactMobileMediaQuery.addEventListener('change', syncBreakpoints);

    return () => {
      desktopMediaQuery.removeEventListener('change', syncBreakpoints);
      compactMobileMediaQuery.removeEventListener('change', syncBreakpoints);
    };
  }, []);

  useEffect(() => {
    const onPopState = (): void => {
      const versionId = readUrlState().version;
      const next = getVersionById(versionId);

      if (versionId && !next) {
        selectedVersionRef.current = null;
        activeExampleRef.current = null;
        setSelectedVersion(null);
        setExamples(new Map());
        setLoaded(false);
        setLoadError(null);
        setSelectionError(`The requested version "${versionId}" is not recognized. Open the current Playground to continue.`);
        setActiveExample(null);

        return;
      }

      if (next && selectedVersionRef.current?.id !== next.id) {
        setSelectedVersion(next);
        selectedVersionRef.current = next;

        if (hasExamplesFor(next.id)) {
          setLoaded(true);
          setLoadError(getLoadErrorFor(next.id));
          setExamples(getNestedExamples(next.id));
          resolveActiveExample({ canonicaliseUrl: false });
        } else {
          setActiveExample(null);
          setLoaded(false);
          setLoadError(null);
          setSelectionError(null);
          setExamples(new Map());
          void loadExamples(next.id);
        }

        return;
      }

      resolveActiveExample({ canonicaliseUrl: false });
    };

    window.addEventListener('popstate', onPopState);

    return () => window.removeEventListener('popstate', onPopState);
  }, [resolveActiveExample]);

  const drawerOpen = sidebarOpen && !isDesktop && !isCompactMobile;

  useEffect(() => {
    if (!drawerOpen || !navigationRef.current) {
      return;
    }

    return activateModalFocus(
      navigationRef.current,
      () => setSidebarOpen(false),
      () => sidebarToggleRef.current,
    );
  }, [drawerOpen]);

  useEffect(() => {
    const focusFilter = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;

      if (
        event.key === '/' &&
        !event.defaultPrevented &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !target?.closest?.(
          'input, textarea, select, [role="textbox"], [role="searchbox"], [contenteditable]:not([contenteditable="false"]), .monaco-editor',
        )
      ) {
        event.preventDefault();
        const compact = window.matchMedia('(max-width: 760px)').matches;
        // A queued media-query event must not close the navigation immediately
        // after this shortcut opens it for the live viewport.
        const desktop = window.matchMedia('(min-width: 1120px)').matches;
        breakpointRef.current = { compact, desktop };
        setIsCompactMobile(compact);
        setIsDesktop(desktop);

        if (compact) {
          setExamplesSheetOpener(document.activeElement as HTMLElement | null);
          setExamplesSheetOpen(true);
        } else {
          setSidebarOpen(true);
        }

        setSearchRequest(request => request + 1);
      }
    };

    document.addEventListener('keydown', focusFilter);

    return () => document.removeEventListener('keydown', focusFilter);
  }, []);

  const selectExample = (path: string): void => {
    const selected = selectedVersionRef.current;

    if (!selected) {
      return;
    }

    const example = getExampleByPath(selected.id, path);

    if (!example || example.path === activeExampleRef.current?.path) {
      return;
    }

    setSelectionError(null);
    setActiveExample(example);
    writeUrlState({ version: selected.id, example: example.path });

    if (isCompactMobile) {
      setExamplesSheetOpen(false);
    } else if (!window.matchMedia('(min-width: 1120px)').matches) {
      setSidebarOpen(false);
    }
  };

  const openCurrent = (): void => {
    const current = getVersionById(CURRENT_VERSION_ID)!;
    const requestedPath = readUrlState().example;
    const path =
      requestedPath && (selectedVersionRef.current?.id !== CURRENT_VERSION_ID || getExampleByPath(CURRENT_VERSION_ID, requestedPath))
        ? requestedPath
        : null;
    writeUrlState({ version: CURRENT_VERSION_ID, example: path });
    storeSelectedVersion(CURRENT_VERSION_ID);
    setSelectionError(null);
    setSelectedVersion(current);
    selectedVersionRef.current = current;
    void ensureExamplesLoaded(CURRENT_VERSION_ID);
  };

  const selectStartingExample = (): void => {
    writeUrlState({ example: null });
    resolveActiveExample({ canonicaliseUrl: true });
  };

  const toggleSidebar = (): void => {
    setSidebarOpen(value => !value);

    if (isDesktop) {
      window.requestAnimationFrame(() => sidebarToggleRef.current?.focus());
    }
  };

  return (
    // The grid has a column for the navigation only while the navigation is
    // actually rendered: a `display: none` sidebar leaves its track behind, and
    // the preview then folds itself into the 280px meant for the list.
    <section ref={rootRef} className={css(styles, 'root')} data-sidebar={!isCompactMobile && sidebarOpen ? 'open' : 'closed'}>
      {!isCompactMobile && (
        <aside
          id="playground-navigation"
          ref={navigationRef}
          role={drawerOpen ? 'dialog' : undefined}
          aria-modal={drawerOpen ? true : undefined}
          aria-label="Examples"
          tabIndex={-1}
          className={css(styles, 'side-content')}
          data-open={sidebarOpen ? 'true' : undefined}
          aria-hidden={!sidebarOpen}
        >
          <Navigation
            focusSearchRequest={searchRequest}
            locale={locale}
            headerAction={sidebarOpen ? <SidebarToggle open toggleRef={sidebarToggleRef} onToggle={toggleSidebar} /> : undefined}
            examples={examples}
            activeExample={activeExample}
            selectedVersion={selectedVersion}
            loadError={loadError}
            loaded={loaded}
            onSelectExample={selectExample}
          />
        </aside>
      )}
      <div className={css(styles, 'right-column')}>
        <div className={css(styles, 'main-content')}>
          {versionLoadError && (
            <p role="status">
              Release list unavailable. The current Playground is still available.{' '}
              <button type="button" onClick={() => void loadVersionCatalog()}>
                Retry release list
              </button>
            </p>
          )}
          <Editor
            selectionError={selectionError}
            onSelectStartingExample={selectStartingExample}
            onRecoverCurrent={openCurrent}
            onRetryCatalog={() => selectedVersion && void loadExamples(selectedVersion.id)}
            activeExample={activeExample}
            nextExample={getNextPlaygroundHighlight(Array.from(examples.values()).flat(), activeExample?.path ?? '')}
            compact={isCompactMobile}
            onSelectExample={selectExample}
            catalogLoadError={loadError}
            selectedVersionId={selectedVersion?.id ?? ''}
            showSidebarToggle={!isCompactMobile}
            sidebarOpen={sidebarOpen}
            sidebarToggleRef={sidebarToggleRef}
            onToggleSidebar={toggleSidebar}
          />
        </div>
        {isCompactMobile && (
          <nav className={css(styles, 'mobile-actions')} aria-label="Playground actions">
            <button
              ref={mobileExamplesButtonRef}
              className={cx(css(styles, 'mobile-action'), css(styles, 'mobile-action--examples'))}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={examplesSheetOpen}
              onClick={() => {
                setExamplesSheetOpener(mobileExamplesButtonRef.current);
                setExamplesSheetOpen(true);
              }}
            >
              Examples
            </button>
          </nav>
        )}
      </div>
      {!isCompactMobile && sidebarOpen && (
        <button
          className={css(styles, 'backdrop')}
          data-modal-backdrop
          type="button"
          tabIndex={-1}
          aria-label="Close examples"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {isCompactMobile && (
        <BottomSheet open={examplesSheetOpen} title="Examples" opener={examplesSheetOpener} onOpenChange={setExamplesSheetOpen}>
          <div className={css(styles, 'sheet-navigation')}>
            <Navigation
              focusSearchRequest={searchRequest}
              locale={locale}
              examples={examples}
              activeExample={activeExample}
              selectedVersion={selectedVersion}
              loadError={loadError}
              loaded={loaded}
              onSelectExample={selectExample}
            />
          </div>
        </BottomSheet>
      )}
      <ToastStack />
    </section>
  );
};
