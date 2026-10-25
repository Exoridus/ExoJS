import {
  type CSSProperties,
  type FunctionComponent,
  lazy,
  type Ref,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import type { ExampleRendererStatus } from '../../../examples/shared/runtime';
import { loadExampleSource } from '../lib/example-store';
import { GUIDE_CHAPTERS } from '../lib/guide-structure';
import { PreviewConsole } from '../lib/preview-console';
import { getExampleAvailability } from '../lib/runtime-support';
import type { Example, PreviewErrorEntry } from '../lib/types';
import { buildPublicUrl } from '../lib/url-builder';
import { type DiagnosticJumpEvent, DiagnosticsStrip } from './DiagnosticsStrip';
import styles from './Editor.module.scss';
import type { EditorCodeHandle, EditorCodeProps, EditorDiagnostic, ResetCodeEvent, UpdateCodeEvent } from './EditorCode';
import { type CanvasSizeEvent, EditorPreview, type EditorPreviewHandle } from './EditorPreview';
import { OutputPanel } from './OutputPanel';
import { SidebarToggle } from './PlaygroundButtons';
import { PreviewToolbar } from './PreviewToolbar';
import { css, cx } from './react-utils';

/**
 * Rendered in place of the editor while there is no DOM to attach Monaco to,
 * which keeps the server from pulling the editor bundle into a Node context.
 */
const ServerEditorCodeFallback: FunctionComponent<EditorCodeProps> = () => null;

const EditorCode = lazy<FunctionComponent<EditorCodeProps>>(async () => {
  if (typeof window === 'undefined') {
    return { default: ServerEditorCodeFallback };
  }

  const mod = await import('./EditorCode');

  return { default: mod.EditorCode };
});

export interface EditorHandle {
  openPreviewInTab(): void;
  triggerReload(): void;
}

export type EditorLayout = 'split' | 'stacked';
/** Which card sits next to the example list in the split layout. */
export type EditorOrder = 'preview-first' | 'editor-first';

const LAYOUT_STORAGE_KEY = 'exo-playground-layout';
const ORDER_STORAGE_KEY = 'exo-playground-order';
const SPLIT_STORAGE_KEY = 'exo-playground-split';

export interface EditorProps {
  activeExample: Example | null;
  catalogLoadError: string | null;
  ref?: Ref<EditorHandle>;
  selectedVersionId: string;
  showSidebarToggle: boolean;
  sidebarOpen: boolean;
  sidebarToggleRef: Ref<HTMLButtonElement>;
  onToggleSidebar(): void;
}

export const Editor = ({
  activeExample,
  catalogLoadError,
  ref,
  selectedVersionId,
  showSidebarToggle,
  sidebarOpen,
  sidebarToggleRef,
  onToggleSidebar,
}: EditorProps): JSX.Element => {
  const [rendererStatus, setRendererStatus] = useState<ExampleRendererStatus | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [sourceCode, setSourceCode] = useState<string | null>(null);
  const [originalSourceCode, setOriginalSourceCode] = useState<string | null>(null);
  const [executionCode, setExecutionCode] = useState<string | null>(null);
  const [originalExecutionCode, setOriginalExecutionCode] = useState<string | null>(null);
  const [sourceLoadError, setSourceLoadError] = useState<PreviewErrorEntry | null>(null);
  const [output] = useState(() => new PreviewConsole());
  // Counts explicit runs, so running unchanged code still restarts the preview.
  const [runId, setRunId] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ReadonlyArray<EditorDiagnostic>>([]);
  const [viewMode, setViewMode] = useState<'source' | 'compiled'>('source');
  const [layout, setLayout] = useState<EditorLayout>('stacked');
  const [order, setOrder] = useState<EditorOrder>('preview-first');
  const [splitPercent, setSplitPercent] = useState(55);
  const [activeView, setActiveView] = useState<'demo' | 'code'>('demo');
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
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

    if (loadKey === loadKeyRef.current) {
      return;
    }

    loadKeyRef.current = loadKey;

    // Reset the editor for the newly-selected example before loading its source
    // asynchronously below. This is a prop-change reset (not a render-derived
    // value); the React-idiomatic alternative - a `key` remount - would re-init
    // Monaco on every example switch, so we suppress the heuristic here instead.
    /* eslint-disable @eslint-react/set-state-in-effect */
    setRendererStatus(null);
    setSourceCode(null);
    setOriginalSourceCode(null);
    setExecutionCode(null);
    setOriginalExecutionCode(null);
    setSourceLoadError(null);
    setDiagnostics([]);
    setViewMode('source');
    /* eslint-enable @eslint-react/set-state-in-effect */

    if (!activeExample || !selectedVersionId) {
      return;
    }

    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        if (activeExample.language === 'typescript') {
          const tsPath = activeExample.path.replace(/\.js$/, '.ts');
          const [tsSource, jsSource] = await Promise.all([
            loadExampleSource(selectedVersionId, tsPath),
            loadExampleSource(selectedVersionId, activeExample.path),
          ]);

          if (cancelled) {
            return;
          }

          setSourceCode(tsSource);
          setOriginalSourceCode(tsSource);
          setExecutionCode(jsSource);
          setOriginalExecutionCode(jsSource);

          return;
        }

        const nextSource = await loadExampleSource(selectedVersionId, activeExample.path);

        if (cancelled) {
          return;
        }

        setSourceCode(nextSource);
        setOriginalSourceCode(nextSource);
        setExecutionCode(null);
        setOriginalExecutionCode(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

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

  useEffect(() => () => output.dispose(), [output]);

  // Runs once the first client render has matched the server's output, which is
  // the point from which the editor can differ from it safely.
  useEffect(() => {
    // eslint-disable-next-line @eslint-react/set-state-in-effect, react-hooks/set-state-in-effect -- releasing the post-hydration render is exactly this effect's job
    setHydrated(true);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);

      // Applying a stored preference is the canonical "sync with external
      // store on mount" effect.
      if (stored === 'split' || stored === 'stacked') {
        // eslint-disable-next-line @eslint-react/set-state-in-effect, react-hooks/set-state-in-effect
        setLayout(stored);
      }

      const storedOrder = window.localStorage.getItem(ORDER_STORAGE_KEY);

      if (storedOrder === 'preview-first' || storedOrder === 'editor-first') {
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setOrder(storedOrder);
      }

      const storedSplit = window.localStorage.getItem(SPLIT_STORAGE_KEY);
      const parsedSplit = storedSplit === null ? 55 : Number(storedSplit);

      if (Number.isFinite(parsedSplit)) {
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setSplitPercent(Math.min(70, Math.max(35, parsedSplit)));
      }
    } catch {
      // Storage can be unavailable in embedded or restricted browsing contexts.
    }
  }, []);

  const resizeSplit = (percent: number): void => {
    const next = Math.min(70, Math.max(35, percent));
    setSplitPercent(next);

    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(next));
    } catch {
      // The current session remains usable without persisted preferences.
    }
  };

  const swapOrder = (): void => {
    setOrder(current => {
      const next: EditorOrder = current === 'preview-first' ? 'editor-first' : 'preview-first';

      try {
        window.localStorage.setItem(ORDER_STORAGE_KEY, next);
      } catch {
        // localStorage disabled - the swap still works for the session.
      }

      return next;
    });
  };

  const toggleLayout = (): void => {
    setLayout(current => {
      const next: EditorLayout = current === 'split' ? 'stacked' : 'split';

      try {
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
      } catch {
        // localStorage disabled - the toggle still works for the session.
      }

      return next;
    });
  };

  // The in-flow expand only exists in the stacked layout; split already
  // dedicates a full column to the preview.
  const expandedActive = previewExpanded && layout === 'stacked';

  const syncExpandedWidth = useCallback((): void => {
    const frame = previewFrameRef.current;

    if (!frame) {
      return;
    }

    frame.style.removeProperty('margin-right');

    if (!expandedActive) {
      return;
    }

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
    setRendererStatus(null);
    setRunId(id => id + 1);
    setSourceCode(event.code);
    setExecutionCode(event.executionCode ?? null);
  };

  const onResetCode = (_event: ResetCodeEvent): void => {
    if (originalSourceCode === null) {
      return;
    }

    setSourceCode(originalSourceCode);
    setExecutionCode(originalExecutionCode);
  };

  const onCanvasSize = useCallback((event: CanvasSizeEvent): void => {
    setCanvasWidth(event.width);
    setCanvasHeight(event.height);
    setPreviewZoom(event.zoom);
  }, []);

  const onDiagnosticJump = (event: DiagnosticJumpEvent): void => {
    setActiveView('code');
    requestAnimationFrame(() => codeEditorRef.current?.jumpToLine(event.lineNumber, event.column));
  };

  const combinedErrors = [
    ...(catalogLoadError ? [{ summary: 'Failed to load examples catalog', details: catalogLoadError }] : []),
    ...(sourceLoadError ? [sourceLoadError] : []),
  ];

  if (!activeExample && combinedErrors.length > 0) {
    return <section className={css(styles, 'root')}>{renderErrors(combinedErrors)}</section>;
  }

  const availability = getExampleAvailability(activeExample);
  const editorLanguage = activeExample?.language === 'typescript' ? 'typescript' : 'javascript';
  const displayPath = getDisplayPath(activeExample);
  // The toggle only makes sense for a TS example - a "compiled" view of
  // freeform JS scratch code would just be the same text back.
  const canToggleView = editorLanguage === 'typescript';
  const isCompiledView = canToggleView && viewMode === 'compiled';
  const displayedLanguage = isCompiledView ? 'javascript' : editorLanguage;
  // executionCode only reads null before the very first successful compile -
  // once set, it holds the last successful compile even while a newer edit is
  // still emitting (see getExecutionCode's contract in EditorCode.tsx), so this
  // placeholder is a first-paint-only case.
  const displayedSourceCode = isCompiledView ? (executionCode ?? '// Compiling…') : sourceCode;
  const displayedSourcePath = isCompiledView ? (activeExample?.path ?? null) : displayPath;

  const toggleViewMode = (): void => {
    setViewMode(mode => (mode === 'source' ? 'compiled' : 'source'));
  };

  // The example list's toggle sits in the header of the card beside the list,
  // and the swap in the header of the card on the right; stacked, the preview
  // is the top card and nothing swaps.
  const sidebarToggle = showSidebarToggle ? (
    <SidebarToggle open={sidebarOpen} toggleRef={sidebarToggleRef} onToggle={onToggleSidebar} />
  ) : null;

  return (
    <section
      ref={rootRef}
      className={css(styles, 'root')}
      data-layout={layout}
      data-order={order}
      data-active-view={activeView}
      style={{ '--split-percent': `${splitPercent}%` } as CSSProperties}
    >
      {activeExample && (
        <header className={css(styles, 'example-header')}>
          <div className={css(styles, 'example-heading')}>
            <h1>{activeExample.title}</h1>
            {activeExample.level && <span className={css(styles, 'example-level')}>{activeExample.level}</span>}
          </div>
          <p>{activeExample.description}</p>
          {renderLearningLinks(activeExample)}
        </header>
      )}
      <div className={css(styles, 'view-tabs')} role="tablist" aria-label="Example view">
        <button
          id="demo-view-tab"
          type="button"
          role="tab"
          aria-selected={activeView === 'demo'}
          aria-controls="playground-demo"
          onClick={() => setActiveView('demo')}
        >
          Demo
        </button>
        <button
          id="code-view-tab"
          type="button"
          role="tab"
          aria-selected={activeView === 'code'}
          aria-controls="playground-code"
          onClick={() => setActiveView('code')}
        >
          Code
        </button>
      </div>
      <div className={css(styles, 'toolbar-slot')}>
        <PreviewToolbar actionsRef={setToolbarTarget} leading={sidebarToggle} />
      </div>
      <section
        id="playground-demo"
        ref={previewFrameRef}
        className={cx(css(styles, 'preview-frame'), expandedActive && css(styles, 'preview-frame--expanded'))}
        aria-label="Example preview"
      >
        <div className={css(styles, 'preview-surface')} data-preview-surface>
          <div className={css(styles, 'preview-component')}>
            <EditorPreview
              ref={previewRef}
              sourceCode={executionCode ?? sourceCode}
              runId={runId}
              exampleMeta={activeExample}
              selectedVersionId={selectedVersionId}
              output={output}
              onCanvasSize={onCanvasSize}
              onRendererStatus={setRendererStatus}
            />
          </div>
          {!availability.available && (
            <div className={css(styles, 'unavailable-overlay')}>
              <svg className={css(styles, 'unavailable-icon')} width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2L2 20h20L12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <line x1="12" y1="9" x2="12" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="12" cy="17.5" r="0.8" fill="currentColor" />
              </svg>
              <p className={css(styles, 'unavailable-message')}>
                {availability.reason ?? 'This example is not available in the current browser.'}
              </p>
            </div>
          )}
        </div>
      </section>
      <div
        className={css(styles, 'split-divider')}
        role="separator"
        aria-label="Resize preview and editor"
        aria-orientation="vertical"
        aria-valuemin={35}
        aria-valuemax={70}
        aria-valuenow={Math.round(splitPercent)}
        tabIndex={0}
        onPointerDown={event => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            const bounds = rootRef.current!.getBoundingClientRect();
            resizeSplit(((event.clientX - bounds.left) / bounds.width) * 100);
          }
        }}
        onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={event => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const boundary = event.key === 'Home' ? 35 : 70;
            const next = event.key === 'Home' || event.key === 'End' ? boundary : splitPercent + (event.key === 'ArrowRight' ? 2 : -2);
            resizeSplit(next);
          }
        }}
      />
      <div className={css(styles, 'diagnostics-slot')}>
        <DiagnosticsStrip diagnostics={diagnostics} onDiagnosticJump={onDiagnosticJump} />
      </div>
      <div className={css(styles, 'output-slot')}>
        <OutputPanel output={output} systemErrors={combinedErrors} />
      </div>
      <section id="playground-code" className={css(styles, 'editor-frame')} aria-label="Source editor">
        <div className={css(styles, 'source-caption')}>
          <span>Code</span>
          <code>{displayedSourcePath}</code>
        </div>
        {/*
          Held back until after hydration. The lazy loader resolves to an empty
          component on the server and to Monaco in the browser, so rendering it
          on the first client pass would put a populated subtree where the
          server left an empty one - the mismatch React reports as #418, after
          which it discards and rebuilds this tree on every page load.
        */}
        {/* No spinner of its own: the preview beside it already shows one
            while the example boots, and two spinners on one screen read as
            two things being broken rather than one page loading. */}
        <Suspense fallback={null}>
          {!hydrated ? null : (
            <EditorCode
              ref={codeEditorRef}
              toolbarTarget={toolbarTarget}
              menuItems={
                <div className={css(styles, 'preview-options')} role="group" aria-label="Preview and layout">
                  <button type="button" role="menuitem" data-layout-action onClick={toggleLayout}>
                    {layout === 'stacked' ? 'Split view' : 'Demo above code'}
                  </button>
                  {layout === 'split' && (
                    <button type="button" role="menuitem" data-layout-action onClick={swapOrder}>
                      Swap panes
                    </button>
                  )}
                  <button type="button" role="menuitem" onClick={() => previewRef.current?.openPreviewInTab()}>
                    Open demo in new tab
                  </button>
                  {layout === 'stacked' && (
                    <button type="button" role="menuitem" onClick={() => setPreviewExpanded(value => !value)}>
                      {expandedActive ? 'Normal demo size' : 'Expand demo'}
                    </button>
                  )}
                  {canToggleView && (
                    <button type="button" role="menuitem" onClick={toggleViewMode}>
                      {isCompiledView ? 'Show TypeScript source' : 'Show compiled JavaScript'}
                    </button>
                  )}
                  <p>
                    {canvasWidth > 0 ? `${canvasWidth} x ${canvasHeight} | ${Math.round(previewZoom * 100)}% | ` : ''}exojs@
                    {selectedVersionId}
                    {rendererStatus?.actual ? ` | ${rendererStatus.actual}` : ''}
                  </p>
                </div>
              }
              sourceCode={displayedSourceCode}
              sourcePath={displayedSourcePath}
              language={displayedLanguage}
              readOnly={isCompiledView}
              canReset={Boolean(originalSourceCode && (dirty || sourceCode !== originalSourceCode))}
              exampleTitle={activeExample?.title ?? 'Loading...'}
              selectedVersionId={selectedVersionId}
              onUpdateCode={onUpdateCode}
              onResetCode={onResetCode}
              onCursorChange={() => undefined}
              onDiagnostic={setDiagnostics}
              onDirty={setDirty}
            />
          )}
        </Suspense>
      </section>
    </section>
  );
};

const renderLearningLinks = (example: Example): JSX.Element | null => {
  const path = example.path.replace(/\.js$/, '');
  const chapter = GUIDE_CHAPTERS.find(chapter => chapter.examples.includes(path));

  const apiLinks = example.apiLinks ?? chapter?.apiLinks ?? [];

  if (!chapter && apiLinks.length === 0) {
    return null;
  }

  const locale = typeof document !== 'undefined' && document.documentElement.lang === 'de' ? 'de' : 'en';

  return (
    <nav className={css(styles, 'learning-links')} aria-label="Learn about this example">
      {chapter && <a href={buildPublicUrl(`${locale}/guide/${chapter.path}/`)}>Learn in the Guide</a>}
      {apiLinks.slice(0, 3).map(symbol => (
        <a key={symbol} href={buildPublicUrl(`${locale}/api/${symbol}/`)}>
          API:{' '}
          {symbol
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('')}
        </a>
      ))}
    </nav>
  );
};

const getDisplayPath = (example: Example | null): string | null => {
  if (!example) {
    return null;
  }

  if (example.language === 'typescript') {
    return example.path.replace(/\.js$/, '.ts');
  }

  return example.path;
};

const renderErrors = (errors: PreviewErrorEntry[]): JSX.Element | null => {
  if (errors.length === 0) {
    return null;
  }

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
};
