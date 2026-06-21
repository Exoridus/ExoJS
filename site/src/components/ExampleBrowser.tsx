import { useCallback, useEffect, useRef, useState } from 'react';

import {
    getAvailableTags,
    getExampleByPath,
    getExamplesList,
    getLoadErrorFor,
    getNestedExamples,
    hasExamplesFor,
    loadExamples,
    onExamplesLoaded,
} from '../lib/example-store';
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
import { AppHeader, type AppHeaderHandle } from './AppHeader';
import { BottomSheet } from './BottomSheet';
import { Editor, type EditorHandle } from './Editor';
import styles from './ExampleBrowser.module.scss';
import { Navigation } from './Navigation';
import { css, cx } from './react-utils';
import { ToastStack } from './ToastStack';

export interface ExampleBrowserProps {
    baseUrl: string;
}

export function ExampleBrowser({ baseUrl }: ExampleBrowserProps): JSX.Element {
    const [examples, setExamples] = useState<ExamplesMap>(new Map());
    const [activeExample, setActiveExample] = useState<Example | null>(null);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [versions, setVersions] = useState<ReadonlyArray<VersionInfo>>([]);
    const [selectedVersion, setSelectedVersion] = useState<VersionInfo | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isCompactMobile, setIsCompactMobile] = useState(false);
    const [examplesSheetOpen, setExamplesSheetOpen] = useState(false);
    const [examplesSheetOpener, setExamplesSheetOpener] = useState<HTMLElement | null>(null);
    const appHeaderRef = useRef<AppHeaderHandle | null>(null);
    const editorRef = useRef<EditorHandle | null>(null);
    const mobileExamplesButtonRef = useRef<HTMLButtonElement | null>(null);
    const previousVersionId = useRef<string | null>(null);
    const missingExampleToastEnabled = useRef(false);
    const selectedVersionRef = useRef<VersionInfo | null>(null);
    const activeExampleRef = useRef<Example | null>(null);
    const bodyOverflowBeforeDrawerOpen = useRef<string | null>(null);

    useEffect(() => {
        selectedVersionRef.current = selectedVersion;
    }, [selectedVersion]);

    useEffect(() => {
        activeExampleRef.current = activeExample;
    }, [activeExample]);

    const unlockBodyScroll = useCallback((): void => {
        if (bodyOverflowBeforeDrawerOpen.current !== null) {
            document.body.style.overflow = bodyOverflowBeforeDrawerOpen.current;
            bodyOverflowBeforeDrawerOpen.current = null;
        }
    }, []);

    const lockBodyScroll = useCallback((): void => {
        if (bodyOverflowBeforeDrawerOpen.current === null) {
            bodyOverflowBeforeDrawerOpen.current = document.body.style.overflow;
        }
        document.body.style.overflow = 'hidden';
    }, []);

    const resolveSelectedVersion = useCallback((): VersionInfo | null => {
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
    }, []);

    const showMissingExampleToast = useCallback((missingPath: string, currentVersionId: string): void => {
        const previousId = previousVersionId.current;
        const action =
            previousId && previousId !== currentVersionId
                ? {
                      label: `Back to v${previousId}`,
                      onClick: () => {
                          const next = getVersionById(previousId);
                          if (!next) return;
                          previousVersionId.current = selectedVersionRef.current?.id ?? null;
                          missingExampleToastEnabled.current = true;
                          setSelectedVersion(next);
                          storeSelectedVersion(previousId);
                          writeUrlState({ version: previousId });
                          void ensureExamplesLoaded(previousId);
                      },
                  }
                : undefined;
        showToast(`"${missingPath}" isn't available in @codexo/exojs@${currentVersionId}`, action ? { action } : undefined);
    }, []);

    const resolveActiveExample = useCallback(
        (options: { canonicaliseUrl: boolean }): void => {
            const selected = selectedVersionRef.current;
            if (!selected || !hasExamplesFor(selected.id)) return;

            const versionId = selected.id;
            const requestedPath = readUrlState().example ?? null;
            const requested = requestedPath ? getExampleByPath(versionId, requestedPath) : null;
            const fellBack = requestedPath !== null && requested === null;
            const example = requested ?? getExamplesList(versionId)[0] ?? null;

            setActiveExample(example);

            if (options.canonicaliseUrl) {
                const nextExample = example?.path ?? null;
                const current = readUrlState();
                if (current.example !== nextExample || current.version !== versionId) {
                    writeUrlState({ example: nextExample, version: versionId }, { replace: true });
                }
            }

            if (missingExampleToastEnabled.current) {
                missingExampleToastEnabled.current = false;
                if (fellBack && requestedPath) showMissingExampleToast(requestedPath, versionId);
            }
        },
        [showMissingExampleToast],
    );

    const syncExampleState = useCallback((): void => {
        const selected = selectedVersionRef.current;
        if (!selected) return;
        setLoaded(hasExamplesFor(selected.id));
        setLoadError(getLoadErrorFor(selected.id));
        setExamples(getNestedExamples(selected.id));
        setAvailableTags(getAvailableTags(selected.id));
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
        const nextVersions = getVersions();
        const nextSelected = resolveSelectedVersion();
        setVersions(nextVersions);
        setSelectedVersion(nextSelected);
        selectedVersionRef.current = nextSelected;

        if (nextSelected) {
            const current = readUrlState().version;
            if (current !== nextSelected.id) {
                writeUrlState({ version: nextSelected.id }, { replace: true });
            }
        }

        const versionError = getVersionLoadError();
        if (versionError) setLoadError(versionError);

        if (nextSelected) {
            void ensureExamplesLoaded(nextSelected.id);
        }
    }, [ensureExamplesLoaded, resolveSelectedVersion]);

    useEffect(() => {
        configureUrlsFromLocation(baseUrl);

        const unsubscribeExamples = onExamplesLoaded(versionId => {
            if (selectedVersionRef.current?.id !== versionId) return;
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
            unlockBodyScroll();
        };
    }, [baseUrl, syncExampleState, syncVersionState, unlockBodyScroll]);

    useEffect(() => {
        const desktopMediaQuery = window.matchMedia('(min-width: 1120px)');
        const compactMobileMediaQuery = window.matchMedia('(max-width: 760px)');
        const syncBreakpoints = (): void => {
            setIsCompactMobile(compactMobileMediaQuery.matches);
            setSidebarOpen(desktopMediaQuery.matches && !compactMobileMediaQuery.matches);
            if (!compactMobileMediaQuery.matches) setExamplesSheetOpen(false);
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
                    setAvailableTags(getAvailableTags(next.id));
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

    useEffect(() => {
        if (sidebarOpen && !window.matchMedia('(min-width: 1120px)').matches && !isCompactMobile) {
            lockBodyScroll();
            return;
        }
        unlockBodyScroll();
    }, [isCompactMobile, lockBodyScroll, sidebarOpen, unlockBodyScroll]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (!sidebarOpen || window.matchMedia('(min-width: 1120px)').matches) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                setSidebarOpen(false);
                window.requestAnimationFrame(() => appHeaderRef.current?.focusMenuButton());
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [sidebarOpen]);

    const selectExample = (path: string): void => {
        const selected = selectedVersionRef.current;
        if (!selected) return;
        const example = getExampleByPath(selected.id, path);
        if (!example || example.path === activeExampleRef.current?.path) return;
        setActiveExample(example);
        writeUrlState({ version: selected.id, example: example.path });
        if (isCompactMobile) setExamplesSheetOpen(false);
        else if (!window.matchMedia('(min-width: 1120px)').matches) setSidebarOpen(false);
    };

    const selectVersion = (id: string): void => {
        const next = getVersionById(id);
        if (!next || selectedVersionRef.current?.id === id) return;
        previousVersionId.current = selectedVersionRef.current?.id ?? null;
        missingExampleToastEnabled.current = true;
        setSelectedVersion(next);
        selectedVersionRef.current = next;
        storeSelectedVersion(id);
        writeUrlState({ version: id });
        showToast(`Switched to @codexo/exojs@${id}`);
        void ensureExamplesLoaded(id);
    };

    return (
        <section className={css(styles, 'root')}>
            {!isCompactMobile && (
                <aside id="playground-navigation" className={css(styles, 'side-content')} data-open={sidebarOpen ? 'true' : undefined} aria-hidden={!sidebarOpen}>
                    <Navigation
                        examples={examples}
                        activeExample={activeExample}
                        availableTags={availableTags}
                        selectedVersion={selectedVersion}
                        loadError={loadError}
                        loaded={loaded}
                        onSelectExample={selectExample}
                    />
                </aside>
            )}
            <div className={css(styles, 'right-column')}>
                <AppHeader
                    ref={appHeaderRef}
                    sidebarOpen={sidebarOpen}
                    showSidebarToggle={!isCompactMobile}
                    sidebarControls="playground-navigation"
                    versions={versions}
                    selectedVersion={selectedVersion}
                    onToggleSidebar={() => setSidebarOpen(value => !value)}
                    onSelectVersion={selectVersion}
                />
                <main className={css(styles, 'main-content')}>
                    <Editor ref={editorRef} activeExample={activeExample} catalogLoadError={loadError} selectedVersionId={selectedVersion?.id ?? ''} />
                </main>
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
                        <button
                            className={cx(css(styles, 'mobile-action'), css(styles, 'mobile-action--run'))}
                            type="button"
                            disabled={!activeExample}
                            onClick={() => editorRef.current?.triggerReload()}
                        >
                            Run
                        </button>
                    </nav>
                )}
            </div>
            {!isCompactMobile && sidebarOpen && <div className={css(styles, 'backdrop')} onClick={() => setSidebarOpen(false)} />}
            {isCompactMobile && (
                <BottomSheet open={examplesSheetOpen} title="Examples" opener={examplesSheetOpener} onOpenChange={setExamplesSheetOpen}>
                    <div className={css(styles, 'sheet-navigation')}>
                        <Navigation
                            examples={examples}
                            activeExample={activeExample}
                            availableTags={availableTags}
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
}
