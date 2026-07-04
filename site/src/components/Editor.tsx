import { forwardRef, lazy, type Ref, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { loadExampleSource } from '../lib/example-store';
import { getExampleAvailability } from '../lib/runtime-support';
import type { Example, PreviewErrorEntry } from '../lib/types';
import { type DiagnosticJumpEvent, DiagnosticsStrip } from './DiagnosticsStrip';
import styles from './Editor.module.scss';
import type { EditorCodeHandle, EditorCodeProps, EditorCursorEvent, EditorDiagnostic, ResetCodeEvent, UpdateCodeEvent } from './EditorCode';
import { type CanvasSizeEvent, EditorPreview, type EditorPreviewHandle } from './EditorPreview';
import { EditorStatusBar } from './EditorStatusBar';
import { LoadingSpinner } from './LoadingSpinner';
import { PreviewToolbar } from './PreviewToolbar';
import { css, cx } from './react-utils';

const ServerEditorCodeFallback = forwardRef<EditorCodeHandle, EditorCodeProps>(function ServerEditorCodeFallback() {
    return null;
});

const EditorCode = lazy(async () => {
    if (typeof window === 'undefined') return { default: ServerEditorCodeFallback };
    const mod = await import('./EditorCode');
    return { default: mod.EditorCode };
});

export interface EditorHandle {
    openPreviewInTab(): void;
    triggerReload(): void;
}

export type EditorLayout = 'split' | 'stacked';

const LAYOUT_STORAGE_KEY = 'exo-playground-layout';

export interface EditorProps {
    activeExample: Example | null;
    catalogLoadError: string | null;
    selectedVersionId: string;
    showSidebarToggle: boolean;
    sidebarOpen: boolean;
    sidebarToggleRef: Ref<HTMLButtonElement>;
    onToggleSidebar(): void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
    { activeExample, catalogLoadError, selectedVersionId, showSidebarToggle, sidebarOpen, sidebarToggleRef, onToggleSidebar },
    ref,
) {
    const [sourceCode, setSourceCode] = useState<string | null>(null);
    const [originalSourceCode, setOriginalSourceCode] = useState<string | null>(null);
    const [executionCode, setExecutionCode] = useState<string | null>(null);
    const [originalExecutionCode, setOriginalExecutionCode] = useState<string | null>(null);
    const [sourceLoadError, setSourceLoadError] = useState<PreviewErrorEntry | null>(null);
    const [previewErrors, setPreviewErrors] = useState<PreviewErrorEntry[]>([]);
    const [canvasWidth, setCanvasWidth] = useState(0);
    const [canvasHeight, setCanvasHeight] = useState(0);
    const [previewZoom, setPreviewZoom] = useState(1);
    const [previewExpanded, setPreviewExpanded] = useState(false);
    const [cursorLine, setCursorLine] = useState(1);
    const [cursorColumn, setCursorColumn] = useState(1);
    const [selectionLength, setSelectionLength] = useState(0);
    const [dirty, setDirty] = useState(false);
    const [diagnostics, setDiagnostics] = useState<ReadonlyArray<EditorDiagnostic>>([]);
    // Split (editor left, preview right) is the desktop default; the stored
    // preference is applied after mount so SSR and first client render match.
    // Below 1120px the CSS ignores the mode and always stacks.
    const [layout, setLayout] = useState<EditorLayout>('split');
    const codeEditorRef = useRef<EditorCodeHandle | null>(null);
    const previewRef = useRef<EditorPreviewHandle | null>(null);
    const previewFrameRef = useRef<HTMLElement | null>(null);
    const loadKeyRef = useRef<string | null>(null);

    useImperativeHandle(
        ref,
        () => ({
            openPreviewInTab(): void {
                previewRef.current?.openPreviewInTab();
            },
            triggerReload(): void {
                codeEditorRef.current?.triggerRefresh();
            },
        }),
        [],
    );

    useEffect(() => {
        const path = activeExample?.path ?? null;
        const loadKey = path && selectedVersionId ? `${selectedVersionId}::${path}` : null;
        if (loadKey === loadKeyRef.current) return;
        loadKeyRef.current = loadKey;

        // Reset the editor for the newly-selected example before loading its source
        // asynchronously below. This is a prop-change reset (not a render-derived
        // value); the React-idiomatic alternative — a `key` remount — would re-init
        // Monaco on every example switch, so we suppress the heuristic here instead.
        /* eslint-disable @eslint-react/set-state-in-effect */
        setSourceCode(null);
        setOriginalSourceCode(null);
        setExecutionCode(null);
        setOriginalExecutionCode(null);
        setSourceLoadError(null);
        setPreviewErrors([]);
        setDiagnostics([]);
        /* eslint-enable @eslint-react/set-state-in-effect */

        if (!activeExample || !selectedVersionId) return;

        let cancelled = false;
        const load = async (): Promise<void> => {
            try {
                if (activeExample.language === 'typescript') {
                    const tsPath = activeExample.path.replace(/\.js$/, '.ts');
                    const [tsSource, jsSource] = await Promise.all([
                        loadExampleSource(selectedVersionId, tsPath),
                        loadExampleSource(selectedVersionId, activeExample.path),
                    ]);
                    if (cancelled) return;
                    setSourceCode(tsSource);
                    setOriginalSourceCode(tsSource);
                    setExecutionCode(jsSource);
                    setOriginalExecutionCode(jsSource);
                    return;
                }

                const nextSource = await loadExampleSource(selectedVersionId, activeExample.path);
                if (cancelled) return;
                setSourceCode(nextSource);
                setOriginalSourceCode(nextSource);
                setExecutionCode(null);
                setOriginalExecutionCode(null);
            } catch (error) {
                if (cancelled) return;
                setSourceLoadError({
                    summary: 'Failed to load example source',
                    details: error instanceof Error ? error.message : String(error),
                });
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [activeExample, selectedVersionId]);

    useEffect(() => {
        const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
        // Applying a stored preference is the canonical "sync with external
        // store on mount" effect.
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        if (stored === 'split' || stored === 'stacked') setLayout(stored);
    }, []);

    const toggleLayout = (): void => {
        setLayout(current => {
            const next: EditorLayout = current === 'split' ? 'stacked' : 'split';
            try {
                window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
            } catch {
                // localStorage disabled — the toggle still works for the session.
            }
            return next;
        });
    };

    // The in-flow expand only exists in the stacked layout; split already
    // dedicates a full column to the preview.
    const expandedActive = previewExpanded && layout === 'stacked';

    const syncExpandedWidth = useCallback((): void => {
        const frame = previewFrameRef.current;
        if (!frame) return;
        frame.style.removeProperty('margin-right');
        if (!expandedActive) return;
        const rect = frame.getBoundingClientRect();
        const gap = 16;
        const extend = Math.max(0, window.innerWidth - rect.right - gap);
        frame.style.marginRight = `${-extend}px`;
    }, [expandedActive]);

    useEffect(() => {
        syncExpandedWidth();
        window.addEventListener('resize', syncExpandedWidth);
        return () => window.removeEventListener('resize', syncExpandedWidth);
    }, [syncExpandedWidth]);

    const onUpdateCode = (event: UpdateCodeEvent): void => {
        setSourceCode(event.code);
        setExecutionCode(event.executionCode ?? null);
    };

    const onResetCode = (_event: ResetCodeEvent): void => {
        if (originalSourceCode === null) return;
        setPreviewErrors([]);
        setSourceCode(originalSourceCode);
        setExecutionCode(originalExecutionCode);
    };

    const onCursorChange = (event: EditorCursorEvent): void => {
        setCursorLine(event.lineNumber);
        setCursorColumn(event.column);
        setSelectionLength(event.selectionLength);
    };

    const onCanvasSize = useCallback((event: CanvasSizeEvent): void => {
        setCanvasWidth(event.width);
        setCanvasHeight(event.height);
        setPreviewZoom(event.zoom);
    }, []);

    const onDiagnosticJump = (event: DiagnosticJumpEvent): void => {
        codeEditorRef.current?.jumpToLine(event.lineNumber, event.column);
    };

    const combinedErrors = [
        ...(catalogLoadError ? [{ summary: 'Failed to load examples catalog', details: catalogLoadError }] : []),
        ...(sourceLoadError ? [sourceLoadError] : []),
        ...previewErrors,
    ];

    if (!activeExample && combinedErrors.length > 0) {
        return <section className={css(styles, 'root')}>{renderErrors(combinedErrors)}</section>;
    }

    const availability = getExampleAvailability(activeExample);
    const languageLabel = activeExample?.language === 'typescript' ? 'TypeScript' : 'JavaScript';
    const editorLanguage = activeExample?.language === 'typescript' ? 'typescript' : 'javascript';
    const displayPath = getDisplayPath(activeExample);

    return (
        <section className={css(styles, 'root')} data-layout={layout}>
            <section
                ref={previewFrameRef}
                className={cx(css(styles, 'preview-frame'), expandedActive && css(styles, 'preview-frame--expanded'))}
                aria-label="Example preview"
            >
                <PreviewToolbar
                    exampleTitle={activeExample?.title ?? ''}
                    capabilities={activeExample?.capabilities ?? []}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    zoom={previewZoom}
                    selectedVersionId={selectedVersionId}
                    disabled={!sourceCode}
                    expanded={expandedActive}
                    layout={layout}
                    showSidebarToggle={showSidebarToggle}
                    sidebarOpen={sidebarOpen}
                    sidebarToggleRef={sidebarToggleRef}
                    onReload={() => codeEditorRef.current?.triggerRefresh()}
                    onOpenTab={() => previewRef.current?.openPreviewInTab()}
                    onToggleExpand={() => setPreviewExpanded(value => !value)}
                    onToggleLayout={toggleLayout}
                    onToggleSidebar={onToggleSidebar}
                />
                <div className={css(styles, 'preview-surface')} data-preview-surface>
                    <div className={css(styles, 'preview-component')}>
                        <EditorPreview
                            ref={previewRef}
                            sourceCode={executionCode ?? sourceCode}
                            exampleMeta={activeExample}
                            selectedVersionId={selectedVersionId}
                            onPreviewErrors={setPreviewErrors}
                            onCanvasSize={onCanvasSize}
                        />
                    </div>
                    {!availability.available && (
                        <div className={css(styles, 'unavailable-overlay')}>
                            <svg className={css(styles, 'unavailable-icon')} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 2L2 20h20L12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                                <line x1="12" y1="9" x2="12" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                <circle cx="12" cy="17.5" r="0.8" fill="currentColor" />
                            </svg>
                            <p className={css(styles, 'unavailable-message')}>{availability.reason ?? 'This example is not available in the current browser.'}</p>
                        </div>
                    )}
                </div>
            </section>
            <div className={css(styles, 'diagnostics-slot')}>
                <DiagnosticsStrip diagnostics={diagnostics} onDiagnosticJump={onDiagnosticJump} />
            </div>
            <div className={css(styles, 'errors-slot')}>{renderErrors(combinedErrors)}</div>
            <section className={css(styles, 'editor-frame')} aria-label="Source editor">
                <Suspense fallback={<LoadingSpinner centered />}>
                    <EditorCode
                        ref={codeEditorRef}
                        sourceCode={sourceCode}
                        sourcePath={displayPath}
                        language={editorLanguage}
                        canReset={Boolean(originalSourceCode && sourceCode !== originalSourceCode)}
                        exampleTitle={activeExample?.title ?? 'Loading...'}
                        selectedVersionId={selectedVersionId}
                        onUpdateCode={onUpdateCode}
                        onResetCode={onResetCode}
                        onCursorChange={onCursorChange}
                        onDiagnostic={setDiagnostics}
                        onDirty={setDirty}
                    />
                </Suspense>
                <EditorStatusBar line={cursorLine} column={cursorColumn} selectionLength={selectionLength} dirty={dirty} language={languageLabel} />
            </section>
        </section>
    );
});

function getDisplayPath(example: Example | null): string | null {
    if (!example) return null;
    if (example.language === 'typescript') {
        return example.path.replace(/\.js$/, '.ts');
    }
    return example.path;
}

function renderErrors(errors: PreviewErrorEntry[]): JSX.Element | null {
    if (errors.length === 0) return null;
    return (
        <details className={css(styles, 'error-panel')}>
            <summary className={css(styles, 'error-summary')}>
                <span className={css(styles, 'error-summary-label')}>Errors</span>
                <span className={css(styles, 'error-summary-count')}>{errors.length}</span>
            </summary>
            <div className={css(styles, 'error-body')}>
                {errors.map(error => (
                    <article className={css(styles, 'error-item')} key={`${error.summary}::${error.details ?? ''}`}>
                        <h3 className={css(styles, 'error-item-title')}>{error.summary}</h3>
                        {error.details && error.details !== error.summary && <pre className={css(styles, 'error-details')}>{error.details}</pre>}
                    </article>
                ))}
            </div>
        </details>
    );
}
