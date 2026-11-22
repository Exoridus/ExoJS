import 'monaco-editor/min/vs/editor/editor.main.css';

import MonacoReactEditor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import {
  type ChangeEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { findExampleCompanions } from '../lib/example-companions';
import { findFootgunCandidates, footgunMessage, type QuickInfoResponse, returnsPromise } from '../lib/footgun-diagnostics';
import { type PlaygroundDraft, playgroundDraftKey, playgroundDrafts } from '../lib/playground-drafts';
import { isEditableSharedFile } from '../lib/preview-modules';
import { createRequest } from '../lib/request-manager';
import { siteBuild } from '../lib/site-build-info';
import { buildExampleUrl, buildGithubRawExampleUrl, buildPublicUrl } from '../lib/url-builder';
import { CURRENT_VERSION_ID, isCurrentVersion } from '../lib/versions';
import styles from './EditorCode.module.scss';
import { css } from './react-utils';
import { Toolbar } from './Toolbar';

export type EditorRunStatus = 'idle' | 'compiling' | 'running' | 'updated' | 'error';

export interface UpdateCodeEvent {
  code: string;
  executionCode?: string;
  executionModules?: Record<string, string>;
}

export interface ResetCodeEvent {
  confirmed: true;
}

export type EditorDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface EditorDiagnostic {
  code?: string;
  endColumn: number;
  endLineNumber: number;
  message: string;
  severity: EditorDiagnosticSeverity;
  startColumn: number;
  startLineNumber: number;
}

export interface EditorCursorEvent {
  column: number;
  lineNumber: number;
  selectionLength: number;
}

export interface EditorCodeHandle {
  jumpToLine(lineNumber: number, column?: number): void;
  triggerRefresh(): void;
}

export interface EditorCodeProps {
  canReset: boolean;
  compiledCode?: string | null;
  exampleTitle: string;
  language: 'javascript' | 'typescript';
  /** Controls shown before the toolbar's title. */
  leading?: ReactNode;
  readOnly?: boolean;
  toolbarTarget?: HTMLElement | null;
  menuItems?: ReactNode;
  ref?: Ref<EditorCodeHandle>;
  selectedVersionId: string;
  sourceCode: string | null;
  originalSourceCode?: string | null;
  sourcePath: string | null;
  onCursorChange(event: EditorCursorEvent): void;
  onDiagnostic(diagnostics: ReadonlyArray<EditorDiagnostic>): void;
  onDirty(dirty: boolean): void;
  onResetCode(event: ResetCodeEvent): void;
  onUpdateCode(event: UpdateCodeEvent): void;
  onRunStatus?(status: EditorRunStatus): void;
}

interface MonacoLanguageDefaults {
  addExtraLib(content: string, filePath?: string): unknown;
  getExtraLibs(): Record<string, unknown>;
  setCompilerOptions(options: Record<string, unknown>): void;
  setDiagnosticsOptions(options: Record<string, unknown>): void;
  setEagerModelSync(value: boolean): void;
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
  ScriptTarget: { ES2020: number; ESNext: number };
}

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(workerId: string, label: string): Worker };
    monaco?: typeof monaco;
  }
}

const MONACO_FONT_FAMILY = '"JetBrains Mono", Consolas, "SFMono-Regular", Menlo, Monaco, "Courier New", monospace';
const SHARED_LIB_FILES = [
  { path: 'examples/shared/runtime.d.ts', virtualPath: 'file:///node_modules/@examples/runtime/index.d.ts' },
  { path: 'examples/shared/editor-support.d.ts', virtualPath: 'file:///node_modules/@examples/editor-support/index.d.ts' },
  // Shared example module, imported by name from examples rather than declared:
  // without it every importer reports ts2307 for `@examples/terrain-noise`.
  { path: 'examples/shared/terrain-noise.ts', virtualPath: 'file:///node_modules/@examples/terrain-noise/index.ts' },
  { path: 'examples/shared/gallery-transitions.ts', virtualPath: 'file:///node_modules/@examples/gallery-transitions/index.ts' },
  // Ambient WebGPU names (`GPUDevice`, `GPUBuffer`, ...) used by the custom
  // renderer examples. Global declarations, so the virtual path only has to be
  // unique - nothing imports it by name.
  { path: 'vendor/webgpu/index.d.ts', virtualPath: 'file:///node_modules/@webgpu/types/index.d.ts' },
  // Bundler specifiers (`*.vert`, `*?worker`, ...) an example may import. Same
  // declarations `typecheck:examples` uses, so the editor and the gate agree.
  { path: 'vendor/exojs-build/client.d.ts', virtualPath: 'file:///node_modules/@codexo/exojs-build/client.d.ts' },
] as const;

const typingsCache = new Map<string, Promise<ReadonlyArray<ExtraLib>>>();
const typingsFileCache = new Map<string, Promise<string>>();
let monacoConfiguredPromise: Promise<void> | null = null;

loader.config({ monaco });

export const EditorCode = ({
  canReset,
  compiledCode,
  exampleTitle,
  language,
  leading,
  onCursorChange,
  onDiagnostic,
  onDirty,
  onResetCode,
  onUpdateCode,
  onRunStatus,
  readOnly = false,
  ref,
  selectedVersionId,
  sourceCode,
  originalSourceCode,
  sourcePath,
  toolbarTarget,
  menuItems,
}: EditorCodeProps): JSX.Element => {
  const compiledPath = language === 'typescript' && sourcePath ? sourcePath.replace(/\.ts$/, '.js') : null;
  const [showCompiled, setShowCompiled] = useState(false);
  const [editorValue, setEditorValue] = useState(sourceCode ?? '');
  const [showMenu, setShowMenu] = useState(false);
  const [copyStatus, setCopyStatus] = useState('Copy');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [activeFile, setActiveFile] = useState(sourcePath);
  const [fileStatus, setFileStatus] = useState('');
  const [typingsError, setTypingsError] = useState<string | null>(null);
  const [typingsLoading, setTypingsLoading] = useState(true);
  const [typingsRetry, setTypingsRetry] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const runGenerationRef = useRef(0);
  const lastRunFilesRef = useRef(new Map<string, string>());
  const [draftStatus, setDraftStatus] = useState('Original source. Run updates the demo; Export downloads the selected file.');
  const [draftChanged, setDraftChanged] = useState(false);
  const [otherUnpersistedDrafts, setOtherUnpersistedDrafts] = useState(false);
  const originalEntryRef = useRef<string | null>(originalSourceCode ?? sourceCode);
  const suppressDraftRef = useRef(false);
  const draftDurableRef = useRef(true);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const readOnlyRef = useRef(readOnly);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const entryModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const filesRef = useRef(new Map<string, { model: monaco.editor.ITextModel; view: monaco.editor.ICodeEditorViewState | null }>());
  const originalFilesRef = useRef(new Map<string, string>());
  const fileRequestRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importReaderRef = useRef<FileReader | null>(null);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const footgunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRefreshRef = useRef(autoRefresh);
  const typingsAppliedVersionRef = useRef<string | null>(null);
  const disposablesRef = useRef<monaco.IDisposable[]>([]);
  const sourceCodeRef = useRef(sourceCode);
  const selectedVersionRef = useRef(selectedVersionId);

  // Latest-value refs, written after commit rather than during render so a
  // discarded render can't leave them pointing at props that were never
  // shown. Declared ahead of the effects below, which read them.
  useEffect(() => {
    sourceCodeRef.current = sourceCode;
    selectedVersionRef.current = selectedVersionId;
    originalEntryRef.current = originalSourceCode ?? originalEntryRef.current ?? sourceCode;
  });

  const persistDraft = useCallback((): void => {
    const model = entryModelRef.current;

    if (suppressDraftRef.current || !model || model.isDisposed() || !sourcePath) {
      return;
    }

    const draft: PlaygroundDraft = { entry: model.getValue(), helpers: {} };

    for (const [path, file] of filesRef.current) {
      const original = originalFilesRef.current.get(path);

      if (isEditableSharedFile(path) && original !== undefined && file.model.getValue() !== original) {
        draft.helpers[path] = { source: file.model.getValue(), original };
      }
    }

    const changed = draft.entry !== originalEntryRef.current || Object.keys(draft.helpers).length > 0;
    setDraftChanged(changed);
    const key = playgroundDraftKey(selectedVersionId, sourcePath);
    const result = changed ? playgroundDrafts.save(key, draft) : playgroundDrafts.remove(key);
    draftDurableRef.current = result.persistence === 'session';
    setOtherUnpersistedDrafts(playgroundDrafts.hasUnpersistedChanges() && draftDurableRef.current);

    if (result.persistence === 'memory') {
      setDraftStatus(
        'Draft kept in this page only. Reload may lose recent edits or restore an earlier draft; export your files to keep them.',
      );
    } else if (changed) {
      setDraftStatus('Session draft saved in this tab. Run updates the demo; Export downloads the selected file.');
    } else {
      setDraftStatus('Original source. Run updates the demo; Export downloads the selected file.');
    }
  }, [selectedVersionId, sourcePath]);

  useEffect(() => {
    autoRefreshRef.current = autoRefresh;
  }, [autoRefresh]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
    const editor = editorRef.current;
    const model = editor?.getModel();
    const editable =
      model === entryModelRef.current || [...filesRef.current].some(([path, file]) => file.model === model && isEditableSharedFile(path));
    editor?.updateOptions({ readOnly: readOnly || !editable });
  }, [readOnly]);

  useEffect(() => {
    // Reset the editor buffer when the selected example (sourcePath) or its loaded
    // source changes - a prop-change reset, not render-derived state.
    // eslint-disable-next-line @eslint-react/set-state-in-effect, react-hooks/set-state-in-effect
    setEditorValue(sourceCode ?? '');

    // eslint-disable-next-line @eslint-react/set-state-in-effect -- feedback belongs to the selected source, not the previous file
    setCopyStatus('Copy');
    onDirty(
      (entryModelRef.current !== null && entryModelRef.current.getValue() !== sourceCode) ||
        [...filesRef.current].some(
          ([path, file]) =>
            isEditableSharedFile(path) &&
            file.model.getValue() !== (lastRunFilesRef.current.get(path) ?? originalFilesRef.current.get(path)),
        ),
    );
  }, [onDirty, sourceCode, sourcePath]);

  useEffect(() => {
    const model = compiledPath ? filesRef.current.get(compiledPath)?.model : null;

    if (model && compiledCode !== null && compiledCode !== undefined && model.getValue() !== compiledCode) {
      model.setValue(compiledCode);
    }
  }, [compiledCode, compiledPath]);

  useEffect(() => {
    if (!selectedVersionId) {
      return;
    }

    let cancelled = false;
    typingsAppliedVersionRef.current = null;
    clearTypings();
    // Loading state belongs to this external declaration request, including retries.
    /* eslint-disable @eslint-react/set-state-in-effect, react-hooks/set-state-in-effect */
    setTypingsLoading(true);
    setTypingsError(null);
    /* eslint-enable @eslint-react/set-state-in-effect, react-hooks/set-state-in-effect */
    onDiagnostic([]);
    void ensureTypingsForVersion(selectedVersionId, selectedVersionRef, typingsAppliedVersionRef, () => {
      if (!cancelled) {
        setTypingsLoading(false);
        updateDiagnostics(modelRef.current, selectedVersionRef.current, typingsAppliedVersionRef.current, onDiagnostic);
      }
    }).catch((error: unknown) => {
      if (cancelled || selectedVersionRef.current !== selectedVersionId) {
        return;
      }

      clearTypings();
      setTypingsLoading(false);
      setTypingsError(error instanceof Error ? error.message : String(error));
      onDiagnostic([]);
    });

    return () => {
      cancelled = true;
      clearTypings();
    };
  }, [onDiagnostic, selectedVersionId, typingsRetry]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent): void => {
      if (!showMenu) {
        return;
      }

      const anchor = document.querySelector('[data-editor-menu-anchor]');

      if (anchor?.contains(event.target as Node)) {
        return;
      }

      setShowMenu(false);
    };

    document.addEventListener('click', onDocumentClick);

    return () => document.removeEventListener('click', onDocumentClick);
  }, [showMenu]);

  useEffect(
    () => () => {
      if (autoRefreshTimerRef.current !== null) {
        clearTimeout(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }

      if (footgunTimerRef.current !== null) {
        clearTimeout(footgunTimerRef.current);
        footgunTimerRef.current = null;
      }

      for (const disposable of disposablesRef.current) {
        disposable.dispose();
      }

      disposablesRef.current = [];
      selectedVersionRef.current = '';
      runGenerationRef.current++;
      fileRequestRef.current?.abort();
      importReaderRef.current?.abort();
      importReaderRef.current = null;

      for (const file of filesRef.current.values()) {
        if (!file.model.isDisposed()) {
          file.model.dispose();
        }
      }

      filesRef.current.clear();
      originalFilesRef.current.clear();
    },
    [],
  );

  const triggerRefresh = useCallback(async (): Promise<void> => {
    // A read-only buffer shows already-compiled JS, not new source - refreshing
    // from it would feed that compiled text back into `sourceCode` upstream.
    if (readOnly) {
      return;
    }

    const model = entryModelRef.current;

    if (!model) {
      return;
    }

    const generation = ++runGenerationRef.current;
    setRunError(null);
    onRunStatus?.('compiling');
    const code = model.getValue();
    const version = model.getVersionId();
    const editableHelpers = [...filesRef.current]
      .filter(([path]) => isEditableSharedFile(path))
      .map(([path, file]) => ({ path, model: file.model, version: file.model.getVersionId() }));
    const helpers = editableHelpers.filter(file => file.model.getValue() !== originalFilesRef.current.get(file.path));
    const [executionCode, ...compiledHelpers] = await Promise.all([
      language === 'typescript' ? getExecutionCode(model, language) : Promise.resolve(code),
      ...helpers.map(file => getExecutionCode(file.model, 'typescript')),
    ]);

    if (generation !== runGenerationRef.current || model.isDisposed()) {
      return;
    }

    if (executionCode === null || compiledHelpers.some(code => code === null)) {
      setRunError('Could not compile the edited files. Run again to retry; the previous demo is unchanged.');
      onRunStatus?.('error');

      return;
    }

    if (
      model.getVersionId() !== version ||
      editableHelpers.some(file => file.model.isDisposed() || file.model.getVersionId() !== file.version) ||
      [...filesRef.current].some(
        ([path, file]) =>
          isEditableSharedFile(path) &&
          !editableHelpers.some(helper => helper.path === path) &&
          file.model.getValue() !== originalFilesRef.current.get(path),
      )
    ) {
      setRunError('Files changed during compilation. Run again to apply the latest edits.');
      onRunStatus?.('error');

      return;
    }

    for (const file of editableHelpers) {
      lastRunFilesRef.current.set(file.path, file.model.getValue());
    }

    onRunStatus?.('running');
    onUpdateCode({
      code,
      executionCode,
      executionModules: Object.fromEntries(helpers.map((file, index) => [file.path, compiledHelpers[index]!])),
    });
    onDirty(false);
  }, [language, onUpdateCode, onDirty, onRunStatus, readOnly]);

  // `onMount` runs once, so the addCommand closures below would otherwise
  // capture the initial (never-read-only) triggerRefresh forever; read this
  // ref instead so they always see the current readOnly-guarded version.
  const triggerRefreshRef = useRef(triggerRefresh);
  useEffect(() => {
    triggerRefreshRef.current = triggerRefresh;
  });

  const selectFile = useCallback(
    (path: string): void => {
      const editor = editorRef.current;
      const next = filesRef.current.get(path);

      if (!editor || !next) {
        return;
      }

      for (const file of filesRef.current.values()) {
        if (file.model === editor.getModel()) {
          file.view = editor.saveViewState();
        }
      }

      // React options may arrive from an older render, so model selection owns readOnly.
      editor.updateOptions({ readOnly: readOnly || (path !== sourcePath && !isEditableSharedFile(path)) });
      editor.setModel(next.model);
      modelRef.current = next.model;

      if (next.view) {
        editor.restoreViewState(next.view);
      }

      setActiveFile(path);
      updateDiagnostics(next.model, selectedVersionRef.current, typingsAppliedVersionRef.current, onDiagnostic);
    },
    [onDiagnostic, readOnly, sourcePath],
  );

  useImperativeHandle(
    ref,
    () => ({
      jumpToLine(lineNumber: number, column = 1): void {
        const editor = editorRef.current;

        if (!editor) {
          return;
        }

        editor.revealLineInCenter(lineNumber);
        editor.setPosition({ lineNumber, column });
        editor.focus();
      },
      triggerRefresh(): void {
        void triggerRefresh();
      },
    }),
    [triggerRefresh],
  );

  const onMount: OnMount = (editor, monacoApi) => {
    editorRef.current = editor;
    modelRef.current = editor.getModel();
    entryModelRef.current = editor.getModel();
    editor.updateOptions({ readOnly: readOnlyRef.current });

    if (sourcePath && entryModelRef.current) {
      filesRef.current.set(sourcePath, { model: entryModelRef.current, view: null });
    }

    window.monaco = monacoApi;
    const draft = sourcePath ? playgroundDrafts.load(playgroundDraftKey(selectedVersionId, sourcePath)) : null;

    if (draft && sourcePath && entryModelRef.current) {
      suppressDraftRef.current = true;
      entryModelRef.current.setValue(draft.entry);
      setEditorValue(draft.entry);

      for (const [path, helper] of Object.entries(draft.helpers)) {
        const model = monacoApi.editor.createModel(
          helper.source,
          'typescript',
          monacoApi.Uri.parse(getModelUrl(path, selectedVersionId, sourcePath)),
        );
        filesRef.current.set(path, { model, view: null });
        originalFilesRef.current.set(path, helper.original);
      }

      suppressDraftRef.current = false;
      setDraftChanged(true);
      onDirty(true);
      draftDurableRef.current = playgroundDrafts.isPersisted(playgroundDraftKey(selectedVersionId, sourcePath));
      setDraftStatus(
        draftDurableRef.current
          ? 'Session draft restored. Run to apply your entry and helper edits to the demo.'
          : 'In-page draft restored. Reload may lose recent edits or restore an earlier draft; export your files to keep them.',
      );
    }

    setOtherUnpersistedDrafts(playgroundDrafts.hasUnpersistedChanges() && draftDurableRef.current);

    disposablesRef.current.push(
      editor.onDidChangeCursorSelection(event => {
        const selection = event.selection;
        const position = selection.getPosition();
        const model = editor.getModel();
        const selectionLength = selection.isEmpty() || !model ? 0 : model.getValueInRange(selection).length;
        onCursorChange({ lineNumber: position.lineNumber, column: position.column, selectionLength });
      }),
      editor.onDidChangeModelContent(() => {
        persistDraft();

        if (!suppressDraftRef.current) {
          setRunError(null);
          onRunStatus?.('idle');
        }

        const dirty =
          entryModelRef.current?.getValue() !== sourceCodeRef.current ||
          [...filesRef.current].some(
            ([path, file]) =>
              isEditableSharedFile(path) &&
              file.model.getValue() !== (lastRunFilesRef.current.get(path) ?? originalFilesRef.current.get(path)),
          );
        onDirty(dirty);

        // Scheduled from the content change rather than from
        // `onDidChangeMarkers`: this handler writes markers itself, and reacting
        // to marker changes would have it retrigger on its own output.
        if (footgunTimerRef.current !== null) {
          clearTimeout(footgunTimerRef.current);
        }

        footgunTimerRef.current = setTimeout(() => {
          footgunTimerRef.current = null;
          void updateFootgunMarkers(editor.getModel());
        }, FOOTGUN_DEBOUNCE_MS);

        if (autoRefreshRef.current && !editor.getOption(monacoApi.editor.EditorOption.readOnly)) {
          if (autoRefreshTimerRef.current !== null) {
            clearTimeout(autoRefreshTimerRef.current);
          }

          autoRefreshTimerRef.current = setTimeout(() => {
            autoRefreshTimerRef.current = null;

            if (autoRefreshRef.current) {
              void triggerRefreshRef.current();
            }
          }, 800);
        }
      }),
      monacoApi.editor.onDidChangeMarkers((resources: monaco.Uri[]) => {
        const model = editor.getModel();

        if (!model) {
          return;
        }

        if (resources.some(resource => resource.toString() === model.uri.toString())) {
          updateDiagnostics(model, selectedVersionRef.current, typingsAppliedVersionRef.current, onDiagnostic);
        }
      }),
    );

    editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.Enter, () => void triggerRefreshRef.current());

    if (typeof monacoApi.KeyCode.KeyS === 'number') {
      editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => void triggerRefreshRef.current());
    }

    onCursorChange({ lineNumber: 1, column: 1, selectionLength: 0 });
    updateDiagnostics(editor.getModel(), selectedVersionRef.current, typingsAppliedVersionRef.current, onDiagnostic);
    void updateFootgunMarkers(editor.getModel());
    requestAnimationFrame(() => {
      editor.layout();
      const learningRegion =
        editor
          .getModel()
          ?.getLinesContent()
          .findIndex(line => line.includes('#region guide:')) ?? -1;

      if (learningRegion >= 0) {
        editor.revealLineNearTop(learningRegion + 2);
      }
    });
  };

  const beforeMount = (): void => {
    window.MonacoEnvironment = {
      getWorker(_workerId: string, label: string): Worker {
        if (label === 'typescript' || label === 'javascript') {
          return new TsWorker();
        }

        return new EditorWorker();
      },
    };
    void configureMonacoOnce();
  };

  const resetCode = (): void => {
    setShowMenu(false);

    if (!(canReset || draftChanged) || !window.confirm('Reset the example and edited helper files to their original source?')) {
      return;
    }

    importReaderRef.current?.abort();
    importReaderRef.current = null;

    if (autoRefreshTimerRef.current !== null) {
      clearTimeout(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    suppressDraftRef.current = true;
    runGenerationRef.current++;
    lastRunFilesRef.current.clear();
    setRunError(null);

    for (const [path, original] of originalFilesRef.current) {
      filesRef.current.get(path)?.model.setValue(original);
    }

    setEditorValue(originalEntryRef.current ?? '');
    entryModelRef.current?.setValue(originalEntryRef.current ?? '');
    suppressDraftRef.current = false;
    setDraftChanged(false);
    const reset = sourcePath ? playgroundDrafts.remove(playgroundDraftKey(selectedVersionId, sourcePath)) : null;
    draftDurableRef.current = reset?.persistence === 'session';
    setOtherUnpersistedDrafts(playgroundDrafts.hasUnpersistedChanges() && draftDurableRef.current);
    setDraftStatus(
      reset?.persistence === 'session'
        ? 'Reset to original source. The session draft was removed.'
        : 'Reset to original source in this page. Storage is unavailable; an older draft may return after reload.',
    );

    if (autoRefreshTimerRef.current !== null) {
      clearTimeout(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    onRunStatus?.('idle');
    onResetCode({ confirmed: true });
    onDirty(false);
  };

  const openFile = useCallback(
    async (path: string): Promise<void> => {
      fileRequestRef.current?.abort();
      setFileStatus('');

      if (filesRef.current.has(path)) {
        selectFile(path);

        return;
      }

      if (path === compiledPath && compiledCode !== null && compiledCode !== undefined && sourcePath) {
        // A derived buffer must not occupy the TypeScript entry's emit target.
        const model = monaco.editor.createModel(
          compiledCode,
          'javascript',
          monaco.Uri.parse(`${getModelUrl(path, selectedVersionId, sourcePath)}?compiled-output`),
        );
        filesRef.current.set(path, { model, view: null });
        selectFile(path);

        return;
      }

      const request = new AbortController();
      fileRequestRef.current = request;
      setFileStatus(`Loading ${path}...`);

      try {
        const source = await createRequest(
          isCurrentVersion(selectedVersionId) ? buildExampleUrl(path) : buildGithubRawExampleUrl(selectedVersionId, path),
        ).getText();

        if (request.signal.aborted || !sourcePath) {
          return;
        }

        const model = monaco.editor.createModel(source, undefined, monaco.Uri.parse(getModelUrl(path, selectedVersionId, sourcePath)));
        filesRef.current.set(path, { model, view: null });
        originalFilesRef.current.set(path, source);
        selectFile(path);
        setFileStatus('');
      } catch (error) {
        if (!request.signal.aborted) {
          setFileStatus(`Cannot open ${path}: ${String(error)}`);
        }
      }
    },
    [compiledCode, compiledPath, selectFile, selectedVersionId, sourcePath],
  );

  const activeReadOnly = readOnly || (activeFile !== sourcePath && !isEditableSharedFile(activeFile));

  /**
   * Monaco's own document formatter, which for TypeScript and JavaScript is the
   * language service's - the same one an editor formats with. It follows the
   * model's own tab size, which is why that is two here: the catalog's sources
   * are, and a format that reindented them to four would report every example as
   * modified the moment it was opened.
   */
  const formatCode = (): void => {
    setShowMenu(false);
    void editorRef.current?.getAction('editor.action.formatDocument')?.run();
  };

  const companions = useMemo(
    () => (sourceCode && sourcePath ? findExampleCompanions(sourceCode, sourcePath.replace(/\.js$/, '.ts')) : []),
    [sourceCode, sourcePath],
  );

  const exportCode = (): void => {
    setShowMenu(false);
    const code = editorRef.current?.getValue() ?? editorValue;
    const fileName = activeFile?.split('/').pop() ?? 'example.js';
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCode = (): void => {
    setShowMenu(false);

    if (readOnly) {
      return;
    }

    fileInputRef.current?.click();
  };

  const onFileImport = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    const model = entryModelRef.current;

    if (!file || !model || model.isDisposed() || readOnly) {
      return;
    }

    importReaderRef.current?.abort();
    const reader = new FileReader();
    importReaderRef.current = reader;

    reader.onload = () => {
      if (
        importReaderRef.current !== reader ||
        entryModelRef.current !== model ||
        model.isDisposed() ||
        typeof reader.result !== 'string'
      ) {
        return;
      }

      setEditorValue(reader.result);
      model.setValue(reader.result);
      persistDraft();
      onDirty(
        reader.result !== sourceCodeRef.current ||
          [...filesRef.current].some(
            ([path, file]) =>
              isEditableSharedFile(path) &&
              file.model.getValue() !== (lastRunFilesRef.current.get(path) ?? originalFilesRef.current.get(path)),
          ),
      );
    };

    reader.onloadend = () => {
      if (importReaderRef.current === reader) {
        importReaderRef.current = null;
      }
    };

    reader.readAsText(file);
    event.currentTarget.value = '';
  };

  const copyCode = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(editorRef.current?.getValue() ?? editorValue);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy unavailable');
    }
  };

  const runControls = (
    <div className={css(styles, 'menu-anchor')}>
      <button
        className={css(styles, 'action-button')}
        data-action="refresh"
        type="button"
        title="Run example (Ctrl+Enter)"
        aria-keyshortcuts="Control+Enter Meta+Enter"
        disabled={readOnly || sourceCode === null}
        onClick={() => void triggerRefresh()}
      >
        Run
      </button>
      <button
        className={css(styles, 'action-button')}
        data-action="reset"
        type="button"
        disabled={!(canReset || draftChanged)}
        onClick={resetCode}
      >
        Reset
      </button>
      {menuItems}
    </div>
  );

  const toolbarControls = (
    <div className={css(styles, 'menu-anchor')} data-editor-menu-anchor>
      <button
        className={css(styles, 'action-button')}
        data-action="copy"
        type="button"
        disabled={sourceCode === null}
        onClick={() => void copyCode()}
      >
        {copyStatus}
      </button>
      <button className={css(styles, 'action-button')} type="button" disabled={activeReadOnly} onClick={formatCode}>
        Format
      </button>
      <button
        className={css(styles, 'more-button')}
        type="button"
        aria-label="File options"
        aria-expanded={showMenu}
        data-open={showMenu ? 'true' : undefined}
        onClick={() => setShowMenu(value => !value)}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
          <circle cx="10" cy="4.5" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="15.5" r="1.5" />
        </svg>
      </button>
      {showMenu && (
        <div
          className={css(styles, 'menu-dropdown')}
          role="menu"
          onClick={event => {
            if ((event.target as HTMLElement).closest('[role="menuitem"]')) {
              setShowMenu(false);
            }
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setShowMenu(false);
              event.stopPropagation();
            }
          }}
        >
          <div className={css(styles, 'compact-actions')}>
            <button className={css(styles, 'menu-item')} role="menuitem" disabled={sourceCode === null} onClick={() => void copyCode()}>
              {copyStatus}
            </button>
          </div>
          <button
            className={css(styles, 'menu-item')}
            role="menuitemcheckbox"
            aria-checked={autoRefresh}
            disabled={readOnly}
            onClick={() => setAutoRefresh(value => !value)}
          >
            Auto-run: {autoRefresh ? 'On' : 'Off'}
          </button>

          <button className={css(styles, 'menu-item')} role="menuitem" onClick={exportCode}>
            Export this file
          </button>
          {compiledPath && (
            <button
              className={css(styles, 'menu-item')}
              role="menuitem"
              disabled={!compiledCode}
              onClick={() => {
                setShowCompiled(true);
                void openFile(compiledPath);
              }}
            >
              Open compiled JavaScript
            </button>
          )}
          <button className={css(styles, 'menu-item')} role="menuitem" disabled={readOnly} onClick={importCode}>
            Import main file
          </button>
        </div>
      )}
    </div>
  );

  return (
    <section className={css(styles, 'root')} data-editor-root aria-label={`Code editor for ${exampleTitle}`}>
      {toolbarTarget && createPortal(runControls, toolbarTarget)}
      {!toolbarTarget && (
        <Toolbar title="Code" leading={leading}>
          {runControls}
        </Toolbar>
      )}
      <input ref={fileInputRef} className={css(styles, 'file-input')} type="file" accept=".js,.ts" onChange={onFileImport} />
      <div className={css(styles, 'editor-shell')} data-editor-shell>
        <div className={css(styles, 'file-toolbar')}>
          <div className={css(styles, 'file-tabs')} role="group" aria-label="Example files">
            {sourcePath &&
              [sourcePath, ...companions, ...(showCompiled && compiledPath ? [compiledPath] : [])].map(path => (
                <button
                  key={path}
                  type="button"
                  aria-pressed={activeFile === path}
                  title={path}
                  value={path}
                  onClick={event => void openFile(event.currentTarget.value)}
                >
                  {path.split('/').pop()}
                  <span>{!readOnly && (path === sourcePath || isEditableSharedFile(path)) ? 'Editable' : 'Read only'}</span>
                </button>
              ))}
          </div>
          {toolbarControls}
        </div>
        <p role="status" data-draft-status className={css(styles, 'file-status')}>
          <span data-source-provenance>
            {isCurrentVersion(selectedVersionId)
              ? `Current build: ExoJS ${siteBuild.packageVersion || 'development'}${siteBuild.sourceSha ? ` (${siteBuild.sourceSha.slice(0, 7)})` : ''}. `
              : `Pinned release: ExoJS ${selectedVersionId}. `}
          </span>
          {draftStatus}
          {otherUnpersistedDrafts &&
            ' Other drafts have changes or resets that are not stored for reload. Export any edits you need before reloading.'}
        </p>
        {typingsLoading && (
          <p role="status" data-typings-status="loading" className={css(styles, 'file-status')}>
            Loading editor types...
          </p>
        )}
        {typingsError && (
          <div role="status" data-typings-status="error" className={css(styles, 'file-status')}>
            <p>Editor types could not be fully loaded. Your source and demo are kept.</p>
            <p>{typingsError}</p>
            <button type="button" onClick={() => setTypingsRetry(value => value + 1)}>
              Retry editor types
            </button>
          </div>
        )}
        {runError && (
          <p role="alert" className={css(styles, 'file-status')}>
            {runError}
          </p>
        )}
        {fileStatus && (
          <p role="status" className={css(styles, 'file-status')}>
            {fileStatus}
          </p>
        )}
        <div className={css(styles, 'editor-host')} data-editor-host>
          {/*
            Withheld until the selected example is known. Mounting earlier would
            create a throwaway model under a placeholder path in whatever
            language the not-yet-loaded example defaults to; switching `path`
            afterwards leaves that model alive, and Monaco keeps one TypeScript
            language service - one 6.9 MB `ts.worker` download - per language
            that owns a live model.
          */}
          {sourcePath === null || sourceCode === null ? null : (
            <MonacoReactEditor
              beforeMount={beforeMount}
              height="100%"
              language={language}
              loading={null}
              onChange={(value: string | undefined) => {
                if (editorRef.current?.getModel() === entryModelRef.current) {
                  setEditorValue(value ?? '');
                }
              }}
              onMount={onMount}
              options={{
                automaticLayout: true,
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
                // shortcut: Monaco 0.55 leaves a rejected highlight delay on model switches; restore after its fix.
                occurrencesHighlight: 'off',
                renderValidationDecorations: 'on',
                scrollBeyondLastLine: false,
                tabSize: 2,
              }}
              path={getModelUrl(sourcePath, selectedVersionId, sourcePath)}
              keepCurrentModel
              saveViewState={false}
              theme="vs-dark"
              defaultValue={sourceCode ?? ''}
            />
          )}
        </div>
      </div>
    </section>
  );
};

const getModelUrl = (path: string, version: string, entry: string): string =>
  `file:///examples/${encodeURIComponent(version)}/${encodeURIComponent(entry)}/${path.replace(/^\/+/, '')}`;

const monacoSeverityToString = (severity: number): EditorDiagnosticSeverity => {
  if (severity >= 8) {
    return 'error';
  }

  if (severity >= 4) {
    return 'warning';
  }

  if (severity >= 2) {
    return 'info';
  }

  return 'hint';
};

const monacoMarkerCodeToString = (code: monaco.editor.IMarker['code']): string | undefined => {
  if (code === undefined || code === null) {
    return undefined;
  }

  if (typeof code === 'string') {
    return code;
  }

  if (typeof code === 'number') {
    return String(code);
  }

  if (typeof code === 'object' && 'value' in code) {
    const value = (code as { value: unknown }).value;

    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
  }

  return undefined;
};

const updateDiagnostics = (
  model: monaco.editor.ITextModel | null,
  selectedVersionId: string,
  typingsAppliedVersion: string | null,
  onDiagnostic: (diagnostics: ReadonlyArray<EditorDiagnostic>) => void,
): void => {
  if (!model || typingsAppliedVersion !== selectedVersionId) {
    onDiagnostic([]);

    return;
  }

  const diagnostics = monaco.editor.getModelMarkers({ resource: model.uri }).map(marker => ({
    severity: monacoSeverityToString(marker.severity),
    message: marker.message,
    code: monacoMarkerCodeToString(marker.code),
    startLineNumber: marker.startLineNumber,
    startColumn: marker.startColumn,
    endLineNumber: marker.endLineNumber,
    endColumn: marker.endColumn,
  }));
  onDiagnostic(diagnostics);
};

/**
 * Marker owner for the dropped-promise hints. Kept separate from the language
 * service's own owner so setting these never disturbs Monaco's markers - and so
 * `onDidChangeMarkers` can tell the two apart.
 */
const FOOTGUN_OWNER = 'exo-footguns';

/** How long the buffer has to sit still before the hints are recomputed. */
const FOOTGUN_DEBOUNCE_MS = 500;

type QuickInfoClient = {
  getQuickInfoAtPosition(uri: string, position: number): Promise<QuickInfoResponse | undefined>;
};

/**
 * Asks the language service about each candidate call and marks the ones whose
 * signature returns a promise.
 *
 * Silent on any failure: these are hints layered over a working editor, and a
 * warming-up worker or a buffer that changed mid-scan is not worth a message.
 * The next keystroke schedules another pass.
 */
const updateFootgunMarkers = async (model: monaco.editor.ITextModel | null): Promise<void> => {
  if (!model) {
    return;
  }

  const versionAtStart = model.getVersionId();
  const candidates = findFootgunCandidates(model.getValue());

  if (candidates.length === 0) {
    monaco.editor.setModelMarkers(model, FOOTGUN_OWNER, []);

    return;
  }

  try {
    const monacoTs = (
      monaco.languages as unknown as { typescript: { getTypeScriptWorker(): Promise<(...uris: monaco.Uri[]) => Promise<QuickInfoClient>> } }
    ).typescript;
    const workerFactory = await monacoTs.getTypeScriptWorker();
    const client = await workerFactory(model.uri);
    const uri = model.uri.toString();

    const markers: monaco.editor.IMarkerData[] = [];

    for (const candidate of candidates) {
      const info = await client.getQuickInfoAtPosition(uri, candidate.calleeOffset);

      if (!returnsPromise(info)) {
        continue;
      }

      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: footgunMessage(candidate.callee),
        startLineNumber: candidate.lineNumber,
        startColumn: candidate.column,
        endLineNumber: candidate.lineNumber,
        endColumn: candidate.endColumn,
        source: FOOTGUN_OWNER,
      });
    }

    // The buffer moved while the worker was answering, so these positions
    // describe text that no longer exists. Drop them; the edit scheduled a
    // fresh pass of its own.
    if (model.isDisposed() || model.getVersionId() !== versionAtStart) {
      return;
    }

    monaco.editor.setModelMarkers(model, FOOTGUN_OWNER, markers);
  } catch {
    // See the note above: hints never interrupt editing.
  }
};

// Emits JS for the editor's current TypeScript buffer via Monaco's TS worker.
// Returns `null` (never the raw TS source) when emission isn't available yet -
// raw TypeScript fed into the preview's `<script type="module">` fails with a
// native parser SyntaxError (e.g. `private sprite!: Sprite` reads as two
// adjacent identifiers), so callers must treat `null` as "not ready" and keep
// the last successfully-compiled preview rather than swallow it into a crash.
const getExecutionCode = async (model: monaco.editor.ITextModel, language: 'javascript' | 'typescript'): Promise<string | null> => {
  if (language !== 'typescript') {
    return null;
  }

  type TsWorkerClient = {
    getEmitOutput(uri: string): Promise<{ outputFiles: Array<{ name: string; text: string }> }>;
  };
  type TsWorkerFactory = (...uris: monaco.Uri[]) => Promise<TsWorkerClient>;
  type MonacoTs = { getTypeScriptWorker(): Promise<TsWorkerFactory> };

  for (const attempt of [0, 1]) {
    let deadline: ReturnType<typeof setTimeout> | undefined;

    try {
      const output = await Promise.race([
        (async () => {
          const monacoTs = (monaco.languages as unknown as { typescript: MonacoTs }).typescript;
          const workerFactory = await monacoTs.getTypeScriptWorker();
          const worker = await workerFactory(model.uri);

          return worker.getEmitOutput(model.uri.toString());
        })(),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => reject(new Error('The TypeScript compiler did not respond.')), 8000);
        }),
      ]);
      const jsFile = output.outputFiles.find(file => file.name.endsWith('.js'));

      if (jsFile) {
        return jsFile.text;
      }
    } catch {
      // Fall through to the retry below - the TS worker may still be warming up.
    } finally {
      clearTimeout(deadline);
    }

    if (attempt === 0) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return null;
};

const configureMonacoOnce = (): Promise<void> => {
  if (monacoConfiguredPromise) {
    return monacoConfiguredPromise;
  }

  configureLanguageDefaults();
  monacoConfiguredPromise = Promise.resolve();

  return monacoConfiguredPromise;
};

const ensureTypingsForVersion = async (
  versionId: string,
  selectedVersionRef: RefObject<string>,
  typingsAppliedVersion: RefObject<string | null>,
  afterApply: () => void,
): Promise<void> => {
  await configureMonacoOnce();

  if (!versionId) {
    return;
  }

  const libs = await getTypingsForVersion(versionId);

  if (selectedVersionRef.current !== versionId) {
    return;
  }

  const tsApi = (monaco.languages as unknown as { typescript: MonacoTypeScriptApi }).typescript;
  const activePaths = new Set(libs.map(lib => lib.filePath));

  for (const path of Object.keys(tsApi.typescriptDefaults.getExtraLibs())) {
    if (!activePaths.has(path)) {
      monaco.editor.getModel(monaco.Uri.parse(path))?.dispose();
    }
  }

  // Materialized declaration models override extra libs when resolving definitions.
  for (const lib of libs) {
    const model = monaco.editor.getModel(monaco.Uri.parse(lib.filePath));

    if (model && model.getValue() !== lib.content) {
      model.setValue(lib.content);
    }
  }

  tsApi.javascriptDefaults.setExtraLibs(libs);
  tsApi.typescriptDefaults.setExtraLibs(libs);
  typingsAppliedVersion.current = versionId;
  afterApply();
};

const getTypingsForVersion = (versionId: string): Promise<ReadonlyArray<ExtraLib>> => {
  let pending = typingsCache.get(versionId);

  if (!pending) {
    pending = loadTypingsForVersion(versionId).catch((error: unknown) => {
      if (typingsCache.get(versionId) === pending) {
        typingsCache.delete(versionId);
      }

      throw error;
    });
    typingsCache.set(versionId, pending);
  }

  return pending;
};

// Extension packages whose declarations the editor registers alongside core, so
// examples that import `@codexo/exojs-tiled` & co. type-check instead of
// reporting ts2307 "Cannot find module". These always load from the current
// vendored copy (extension typings are not vendored per historical version).
const EXTENSION_PACKAGES: ReadonlyArray<{ baseUrl: string; packageName: string }> = [
  { baseUrl: 'vendor/exojs-tiled/', packageName: '@codexo/exojs-tiled' },
  { baseUrl: 'vendor/exojs-ldtk/', packageName: '@codexo/exojs-ldtk' },
  { baseUrl: 'vendor/exojs-demo-assets/', packageName: '@codexo/exojs-demo-assets' },
];

const loadTypingsForVersion = async (versionId: string): Promise<ReadonlyArray<ExtraLib>> => {
  const [shared, exojs, extensions] = await Promise.all([
    loadSharedTypings(),
    loadVersionedExoJsTypings(versionId),
    loadExtensionTypings(),
  ]);

  return [...shared, ...exojs, ...extensions];
};

const loadExtensionTypings = async (): Promise<ReadonlyArray<ExtraLib>> => {
  const perPackage = await Promise.all(EXTENSION_PACKAGES.map(pkg => loadPackageTypingsFromBase(pkg.baseUrl, pkg.packageName)));

  return perPackage.flat();
};

const loadSharedTypings = async (): Promise<ReadonlyArray<ExtraLib>> =>
  Promise.all(
    SHARED_LIB_FILES.map(async file => ({
      content: await fetchTextFile(buildPublicUrl(file.path)),
      filePath: file.virtualPath,
    })),
  );

const loadVersionedExoJsTypings = (versionId: string): Promise<ReadonlyArray<ExtraLib>> =>
  loadPackageTypingsFromBase(versionId === CURRENT_VERSION_ID ? 'vendor/exojs/' : `vendor/exojs/${versionId}/`, '@codexo/exojs');

const loadPackageTypingsFromBase = async (baseUrl: string, packageName: string): Promise<ReadonlyArray<ExtraLib>> => {
  const registry = JSON.parse(await fetchTextFile(buildPublicUrl(`${baseUrl}monaco-registry.json`))) as Record<string, unknown>;

  if (typeof registry.packageJson !== 'string' || !Array.isArray(registry.subpathShims)) {
    throw new Error(`Invalid editor type registry for ${packageName}.`);
  }

  const libs: ExtraLib[] = [{ content: registry.packageJson, filePath: `file:///node_modules/${packageName}/package.json` }];

  for (const shim of registry.subpathShims as Record<string, unknown>[]) {
    if (typeof shim.virtualPath !== 'string' || typeof shim.content !== 'string') {
      throw new Error(`Invalid editor type shim for ${packageName}.`);
    }

    libs.push({ content: shim.content, filePath: shim.virtualPath });
  }

  const manifest = await fetchTypingsManifest(`${baseUrl}esm-typings.json`);
  const treeLibs = await Promise.all(
    manifest.map(async relativePath => ({
      content: await fetchTextFile(buildPublicUrl(`${baseUrl}esm/${relativePath}`)),
      filePath: `file:///node_modules/${packageName}/dist/esm/${relativePath}`,
    })),
  );

  return [...libs, ...treeLibs];
};

const fetchTypingsManifest = async (relativePath: string): Promise<ReadonlyArray<string>> => {
  const data: unknown = JSON.parse(await fetchTextFile(buildPublicUrl(relativePath)));

  if (
    !Array.isArray(data) ||
    data.length === 0 ||
    !data.every(entry => typeof entry === 'string' && entry.endsWith('.d.ts') && !entry.includes('..') && !entry.startsWith('/'))
  ) {
    throw new Error(`Invalid editor type manifest at ${relativePath}.`);
  }

  return data as string[];
};

const clearTypings = (): void => {
  const tsApi = (monaco.languages as unknown as { typescript: MonacoTypeScriptApi }).typescript;

  for (const path of Object.keys(tsApi.typescriptDefaults.getExtraLibs())) {
    monaco.editor.getModel(monaco.Uri.parse(path))?.dispose();
  }

  tsApi.javascriptDefaults.setExtraLibs([]);
  tsApi.typescriptDefaults.setExtraLibs([]);
};

const configureLanguageDefaults = (): void => {
  const tsApi = (monaco.languages as unknown as { typescript: MonacoTypeScriptApi }).typescript;
  const sharedCompilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    checkJs: true,
    esModuleInterop: true,
    module: tsApi.ModuleKind.ESNext,
    moduleResolution: tsApi.ModuleResolutionKind.NodeJs,
    noEmit: true,
    // ES2020 is below what the examples use (`String.replaceAll` is ES2021),
    // which surfaces as a ts2550 on an example that runs perfectly well.
    // Monaco's ScriptTarget stops at ES2020 and then jumps to ESNext, so this
    // is the only value above it the enum offers.
    target: tsApi.ScriptTarget.ESNext,
    baseUrl: 'file:///',
  };
  // TS examples are strict-clean at the source of truth (tsconfig.examples.json,
  // enforced by `pnpm typecheck:examples`) - mirror that here so editing one in
  // the Playground surfaces the same errors CI would.
  const tsCompilerOptions = {
    ...sharedCompilerOptions,
    // The preview runs what the worker emits for the edited model; with
    // `noEmit` the emit output is empty and an edit never reaches the preview.
    noEmit: false,
    strict: true,
  };
  // JS mode is a deliberate low-friction path for writing/pasting plain JS with
  // no TypeScript background - checkJs (above) still catches real type errors;
  // only "add an annotation" strict-mode noise is suppressed.
  const jsCompilerOptions = {
    ...sharedCompilerOptions,
    noImplicitAny: false,
    noImplicitThis: false,
    strict: false,
  };
  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  };

  tsApi.javascriptDefaults.setEagerModelSync(true);
  tsApi.typescriptDefaults.setEagerModelSync(true);
  tsApi.javascriptDefaults.setCompilerOptions(jsCompilerOptions);
  tsApi.typescriptDefaults.setCompilerOptions(tsCompilerOptions);
  tsApi.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  tsApi.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
};

const fetchTextFile = (url: string): Promise<string> => {
  // Registries/manifests must be revalidated after malformed JSON or metadata.
  if (url.endsWith('.json')) {
    return createRequest(url).getText();
  }

  let pending = typingsFileCache.get(url);

  if (!pending) {
    pending = createRequest(url)
      .getText()
      .catch((error: unknown) => {
        if (typingsFileCache.get(url) === pending) {
          typingsFileCache.delete(url);
        }

        throw error;
      });
    typingsFileCache.set(url, pending);
  }

  return pending;
};
