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
import { detectRuntimeSupport, onRuntimeDetected } from '../lib/runtime-support';
import { showToast } from '../lib/toast-store';
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isCompactMobile, setIsCompactMobile] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [examplesSheetOpen, setExamplesSheetOpen] = useState(false);
  const [examplesSheetOpener, setExamplesSheetOpener] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const navigationRef = useRef<HTMLElement | null>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileExamplesButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousVersionIdRef = useRef<string | null>(null);
  const missingExampleToastEnabledRef = useRef(false);
  const selectedVersionRef = useRef<VersionInfo | null>(null);
  const activeExampleRef = useRef<Example | null>(null);
  // Late-bound to break the showMissingExampleToast <-> ensureExamplesLoaded cycle
  // (the toast action calls it, but it is declared after the toast helper).
  const ensureExamplesLoadedRef = useRef<(versionId: string) => Promise<void>>(() => Promise.resolve());

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

  const showMissingExampleToast = useCallback((missingPath: string, currentVersionId: string): void => {
    const previousId = previousVersionIdRef.current;
    const action =
      previousId && previousId !== currentVersionId
        ? {
            label: `Back to v${previousId}`,
            onClick: () => {
              const next = getVersionById(previousId);

              if (!next) {
                return;
              }

              previousVersionIdRef.current = selectedVersionRef.current?.id ?? null;
              missingExampleToastEnabledRef.current = true;
              setSelectedVersion(next);
              storeSelectedVersion(previousId);
              writeUrlState({ version: previousId });
              void ensureExamplesLoadedRef.current(previousId);
            },
          }
        : undefined;
    showToast(`"${missingPath}" isn't available in @codexo/exojs@${currentVersionId}`, action ? { action } : undefined);
  }, []);

  const resolveActiveExample = useCallback(
    (options: { canonicaliseUrl: boolean }): void => {
      const selected = selectedVersionRef.current;

      if (!selected || !hasExamplesFor(selected.id)) {
        return;
      }

      const versionId = selected.id;
      const requestedPath = readUrlState().example ?? null;

      const requested = requestedPath ? getExampleByPath(versionId, requestedPath) : null;
      const fellBack = requestedPath !== null && requested === null;
      const example = requested ?? getPlaygroundDefault(getExamplesList(versionId));

      setActiveExample(example);

      if (options.canonicaliseUrl) {
        const nextExample = example?.path ?? null;
        const current = readUrlState();

        if (current.example !== nextExample || current.version !== versionId) {
          writeUrlState({ example: nextExample, version: versionId }, { replace: true });
        }
      }

      if (missingExampleToastEnabledRef.current) {
        missingExampleToastEnabledRef.current = false;

        if (fellBack && requestedPath) {
          showMissingExampleToast(requestedPath, versionId);
        }
      }
    },
    [showMissingExampleToast],
  );

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

  useEffect(() => {
    ensureExamplesLoadedRef.current = ensureExamplesLoaded;
  }, [ensureExamplesLoaded]);

  const syncVersionState = useCallback((): void => {
    const nextSelected = resolveSelectedVersion();
    setSelectedVersion(nextSelected);
    selectedVersionRef.current = nextSelected;

    if (nextSelected) {
      const current = readUrlState().version;

      if (current !== nextSelected.id) {
        writeUrlState({ version: nextSelected.id }, { replace: true });
      }
    }

    const versionError = getVersionLoadError();

    if (versionError) {
      setLoadError(versionError);
    }

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
      // Mirror viewport media-query state into React - the canonical
      // "subscribe to an external system, setState on change" effect use.
      // The synchronous initial call is the SSR-safe form of that pattern.
      /* eslint-disable @eslint-react/set-state-in-effect */
      setIsCompactMobile(compactMobileMediaQuery.matches);
      setIsDesktop(desktopMediaQuery.matches);
      setSidebarOpen(desktopMediaQuery.matches && !compactMobileMediaQuery.matches);

      if (!compactMobileMediaQuery.matches) {
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

      if (next && selectedVersionRef.current?.id !== next.id) {
        setSelectedVersion(next);
        selectedVersionRef.current = next;

        if (hasExamplesFor(next.id)) {
          setLoaded(true);
          setLoadError(getLoadErrorFor(next.id));
          setExamples(getNestedExamples(next.id));
          resolveActiveExample({ canonicaliseUrl: false });
        } else {
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

  const selectExample = (path: string): void => {
    const selected = selectedVersionRef.current;

    if (!selected) {
      return;
    }

    const example = getExampleByPath(selected.id, path);

    if (!example || example.path === activeExampleRef.current?.path) {
      return;
    }

    setActiveExample(example);
    writeUrlState({ version: selected.id, example: example.path });

    if (isCompactMobile) {
      setExamplesSheetOpen(false);
    } else if (!window.matchMedia('(min-width: 1120px)').matches) {
      setSidebarOpen(false);
    }
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
          <Editor
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
