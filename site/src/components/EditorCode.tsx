import 'monaco-editor/min/vs/editor/editor.main.css';

import MonacoReactEditor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { type ChangeEvent, forwardRef, type RefObject, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { buildPublicUrl } from '../lib/url-builder';
import { CURRENT_VERSION_ID } from '../lib/versions';
import styles from './EditorCode.module.scss';
import { css, cx } from './react-utils';
import { Toolbar } from './Toolbar';

export interface UpdateCodeEvent {
    code: string;
    executionCode?: string;
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
    exampleTitle: string;
    language: 'javascript' | 'typescript';
    selectedVersionId: string;
    sourceCode: string | null;
    sourcePath: string | null;
    onCursorChange(event: EditorCursorEvent): void;
    onDiagnostic(diagnostics: ReadonlyArray<EditorDiagnostic>): void;
    onDirty(dirty: boolean): void;
    onResetCode(event: ResetCodeEvent): void;
    onUpdateCode(event: UpdateCodeEvent): void;
}

interface MonacoLanguageDefaults {
    addExtraLib(content: string, filePath?: string): unknown;
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
    ScriptTarget: { ES2020: number };
}

type AssetManifest = Record<string, string[]>;

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
    { path: 'examples/shared/assets-global.d.ts', virtualPath: 'file:///node_modules/@examples/assets-global/index.d.ts' },
] as const;

const typingsCache = new Map<string, Promise<ReadonlyArray<ExtraLib>>>();
let monacoConfiguredPromise: Promise<void> | null = null;
let assetCompletionProviderRegistered = false;

loader.config({ monaco });

export const EditorCode = forwardRef<EditorCodeHandle, EditorCodeProps>(function EditorCode(
    {
        canReset,
        exampleTitle,
        language,
        onCursorChange,
        onDiagnostic,
        onDirty,
        onResetCode,
        onUpdateCode,
        selectedVersionId,
        sourceCode,
        sourcePath,
    },
    ref,
) {
    const [editorValue, setEditorValue] = useState(sourceCode ?? '');
    const [showMenu, setShowMenu] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const modelRef = useRef<monaco.editor.ITextModel | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const autoRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoRefreshRef = useRef(autoRefresh);
    const typingsAppliedVersionRef = useRef<string | null>(null);
    const disposablesRef = useRef<monaco.IDisposable[]>([]);
    const sourceCodeRef = useRef(sourceCode);
    const selectedVersionRef = useRef(selectedVersionId);

    sourceCodeRef.current = sourceCode;
    selectedVersionRef.current = selectedVersionId;

    useEffect(() => {
        autoRefreshRef.current = autoRefresh;
    }, [autoRefresh]);

    useEffect(() => {
        // Reset the editor buffer when the selected example (sourcePath) or its loaded
        // source changes — a prop-change reset, not render-derived state.
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setEditorValue(sourceCode ?? '');
        onDirty(false);
    }, [onDirty, sourceCode, sourcePath]);

    useEffect(() => {
        if (!selectedVersionId) return;
        void ensureTypingsForVersion(selectedVersionId, selectedVersionRef, typingsAppliedVersionRef, () =>
            updateDiagnostics(modelRef.current, selectedVersionRef.current, typingsAppliedVersionRef.current, onDiagnostic),
        );
    }, [onDiagnostic, selectedVersionId]);

    useEffect(() => {
        const onDocumentClick = (event: MouseEvent): void => {
            if (!showMenu) return;
            const anchor = document.querySelector('[data-editor-menu-anchor]');
            if (anchor?.contains(event.target as Node)) return;
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
            for (const disposable of disposablesRef.current) disposable.dispose();
            disposablesRef.current = [];
        },
        [],
    );

    const triggerRefresh = useCallback(async (): Promise<void> => {
        const editor = editorRef.current;
        if (!editor) return;
        const code = editor.getValue();
        const executionCode = await getExecutionCode(editor, language);
        onUpdateCode({
            code,
            executionCode: language === 'typescript' ? executionCode : undefined,
        });
        onDirty(false);
    }, [language, onUpdateCode, onDirty]);

    useImperativeHandle(
        ref,
        () => ({
            jumpToLine(lineNumber: number, column = 1): void {
                const editor = editorRef.current;
                if (!editor) return;
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
        window.monaco = monacoApi;

        disposablesRef.current.push(
            editor.onDidChangeCursorSelection(event => {
                const selection = event.selection;
                const position = selection.getPosition();
                const model = editor.getModel();
                const selectionLength = selection.isEmpty() || !model ? 0 : model.getValueInRange(selection).length;
                onCursorChange({ lineNumber: position.lineNumber, column: position.column, selectionLength });
            }),
            editor.onDidChangeModelContent(() => {
                const dirty = editor.getValue() !== sourceCodeRef.current;
                onDirty(dirty);
                if (autoRefreshRef.current && dirty) {
                    if (autoRefreshTimerRef.current !== null) clearTimeout(autoRefreshTimerRef.current);
                    autoRefreshTimerRef.current = setTimeout(() => {
                        autoRefreshTimerRef.current = null;
                        if (autoRefreshRef.current) void triggerRefresh();
                    }, 800);
                }
            }),
            monacoApi.editor.onDidChangeMarkers((resources: monaco.Uri[]) => {
                const model = editor.getModel();
                if (!model) return;
                if (resources.some(resource => resource.toString() === model.uri.toString())) {
                    updateDiagnostics(model, selectedVersionRef.current, typingsAppliedVersionRef.current, onDiagnostic);
                }
            }),
        );

        editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.Enter, () => void triggerRefresh());
        if (typeof monacoApi.KeyCode.KeyS === 'number') {
            editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => void triggerRefresh());
        }

        onCursorChange({ lineNumber: 1, column: 1, selectionLength: 0 });
        updateDiagnostics(editor.getModel(), selectedVersionRef.current, typingsAppliedVersionRef.current, onDiagnostic);
        requestAnimationFrame(() => editor.layout());
    };

    const beforeMount = (): void => {
        window.MonacoEnvironment = {
            getWorker(_workerId: string, label: string): Worker {
                if (label === 'typescript' || label === 'javascript') return new TsWorker();
                return new EditorWorker();
            },
        };
        void configureMonacoOnce();
    };

    const resetCode = (): void => {
        setShowMenu(false);
        if (!canReset || !window.confirm('Reset the editor to the original example source?')) return;
        onResetCode({ confirmed: true });
        onDirty(false);
    };

    const exportCode = (): void => {
        setShowMenu(false);
        const code = editorRef.current?.getValue() ?? editorValue;
        const fileName = sourcePath ? (sourcePath.split('/').pop() ?? 'example.js') : 'example.js';
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
        fileInputRef.current?.click();
    };

    const onFileImport = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== 'string') return;
            setEditorValue(reader.result);
            editorRef.current?.setValue(reader.result);
        };
        reader.readAsText(file);
        event.currentTarget.value = '';
    };

    return (
        <section className={css(styles, 'root')} aria-label={`Code editor for ${exampleTitle}`}>
            <Toolbar title="Code">
                <div className={css(styles, 'menu-anchor')} data-editor-menu-anchor>
                    <button
                        className={cx(css(styles, 'auto-button'), autoRefresh && css(styles, 'auto-button--active'))}
                        type="button"
                        title="Auto-refresh the preview on every code change (800ms debounce)"
                        onClick={() => setAutoRefresh(value => !value)}
                    >
                        auto-run
                    </button>
                    <button className={css(styles, 'more-button')} data-action="refresh" type="button" title="Refresh preview (Ctrl+Enter)" onClick={() => void triggerRefresh()}>
                        <svg viewBox="0 0 16 16" width="1em" height="1em" style={{ display: 'block' }} fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
                            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
                        </svg>
                    </button>
                    <button className={css(styles, 'more-button')} data-action="reset" type="button" title="Reset to original source" disabled={!canReset} onClick={resetCode}>
                        <svg viewBox="0 0 16 16" width="1em" height="1em" style={{ display: 'block' }} fill="none" aria-hidden="true">
                            <path d="M2.2 8a5.8 5.8 0 1 0 1.4-3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            <path d="M2.1 2.8v2.8h2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <button className={css(styles, 'more-button')} type="button" aria-label="More options" aria-expanded={showMenu} data-open={showMenu ? 'true' : undefined} onClick={() => setShowMenu(value => !value)}>
                        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
                            <circle cx="10" cy="4.5" r="1.5" />
                            <circle cx="10" cy="10" r="1.5" />
                            <circle cx="10" cy="15.5" r="1.5" />
                        </svg>
                    </button>
                    {showMenu && (
                        <div className={css(styles, 'menu-dropdown')} role="menu">
                            <button className={css(styles, 'menu-item')} role="menuitem" onClick={exportCode}>
                                Export Code
                            </button>
                            <button className={css(styles, 'menu-item')} role="menuitem" onClick={importCode}>
                                Import Code
                            </button>
                            <button className={css(styles, 'menu-item')} role="menuitem" data-variant="danger" disabled={!canReset} onClick={resetCode}>
                                Reset Code
                            </button>
                        </div>
                    )}
                </div>
            </Toolbar>
            <input ref={fileInputRef} className={css(styles, 'file-input')} type="file" accept=".js,.ts" onChange={onFileImport} />
            <div className={css(styles, 'editor-shell')}>
                <div className={css(styles, 'editor-host')}>
                    <MonacoReactEditor
                        beforeMount={beforeMount}
                        height="100%"
                        language={language}
                        loading={null}
                        onChange={value => setEditorValue(value ?? '')}
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
                            renderValidationDecorations: 'on',
                            scrollBeyondLastLine: false,
                            tabSize: 4,
                        }}
                        path={getModelUrl(sourcePath, language)}
                        theme="vs-dark"
                        value={editorValue}
                    />
                </div>
            </div>
        </section>
    );
});

function getModelUrl(sourcePath: string | null, language: 'javascript' | 'typescript'): string {
    const defaultExt = language === 'typescript' ? '.ts' : '.js';
    const normalizedPath = (sourcePath ?? `examples/active-example${defaultExt}`).replace(/^\/+/, '');
    return `file:///${normalizedPath}`;
}

function monacoSeverityToString(severity: number): EditorDiagnosticSeverity {
    if (severity >= 8) return 'error';
    if (severity >= 4) return 'warning';
    if (severity >= 2) return 'info';
    return 'hint';
}

function monacoMarkerCodeToString(code: monaco.editor.IMarker['code']): string | undefined {
    if (code === undefined || code === null) return undefined;
    if (typeof code === 'string') return code;
    if (typeof code === 'number') return String(code);
    if (typeof code === 'object' && 'value' in code) {
        const value = (code as { value: unknown }).value;
        if (typeof value === 'string' || typeof value === 'number') return String(value);
    }
    return undefined;
}

function updateDiagnostics(
    model: monaco.editor.ITextModel | null,
    selectedVersionId: string,
    typingsAppliedVersion: string | null,
    onDiagnostic: (diagnostics: ReadonlyArray<EditorDiagnostic>) => void,
): void {
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
}

async function getExecutionCode(editor: monaco.editor.IStandaloneCodeEditor, language: 'javascript' | 'typescript'): Promise<string> {
    const source = editor.getValue();
    if (language !== 'typescript') return source;
    const model = editor.getModel();
    if (!model) return source;

    try {
        type TsWorkerClient = {
            getEmitOutput(uri: string): Promise<{ outputFiles: Array<{ name: string; text: string }> }>;
        };
        type TsWorkerFactory = (...uris: monaco.Uri[]) => Promise<TsWorkerClient>;
        type MonacoTs = { getTypeScriptWorker(): Promise<TsWorkerFactory> };

        const monacoTs = (monaco.languages as unknown as { typescript: MonacoTs }).typescript;
        const workerFactory = await monacoTs.getTypeScriptWorker();
        const worker = await workerFactory(model.uri);
        const output = await worker.getEmitOutput(model.uri.toString());
        const jsFile = output.outputFiles.find(file => file.name.endsWith('.js'));
        if (jsFile?.text) return jsFile.text;
    } catch {
        // Keep preview usable if the TS worker is still warming up.
    }

    return source;
}

function configureMonacoOnce(): Promise<void> {
    if (monacoConfiguredPromise) return monacoConfiguredPromise;
    configureLanguageDefaults();
    monacoConfiguredPromise = Promise.resolve();
    return monacoConfiguredPromise;
}

async function ensureTypingsForVersion(
    versionId: string,
    selectedVersionRef: RefObject<string>,
    typingsAppliedVersion: RefObject<string | null>,
    afterApply: () => void,
): Promise<void> {
    await configureMonacoOnce();
    if (!versionId) return;

    const libs = await getTypingsForVersion(versionId);
    if (selectedVersionRef.current !== versionId) return;

    const tsApi = (monaco.languages as unknown as { typescript: MonacoTypeScriptApi }).typescript;
    tsApi.javascriptDefaults.setExtraLibs(libs);
    tsApi.typescriptDefaults.setExtraLibs(libs);
    typingsAppliedVersion.current = versionId;
    afterApply();
}

function getTypingsForVersion(versionId: string): Promise<ReadonlyArray<ExtraLib>> {
    let pending = typingsCache.get(versionId);
    if (!pending) {
        pending = loadTypingsForVersion(versionId);
        typingsCache.set(versionId, pending);
    }
    return pending;
}

async function loadTypingsForVersion(versionId: string): Promise<ReadonlyArray<ExtraLib>> {
    const [shared, exojs] = await Promise.all([loadSharedTypings(), loadVersionedExoJsTypings(versionId)]);
    return [...shared, ...exojs];
}

async function loadSharedTypings(): Promise<ReadonlyArray<ExtraLib>> {
    return Promise.all(
        SHARED_LIB_FILES.map(async file => ({
            content: await fetchTextFile(buildPublicUrl(file.path)),
            filePath: file.virtualPath,
        })),
    );
}

async function loadVersionedExoJsTypings(versionId: string): Promise<ReadonlyArray<ExtraLib>> {
    if (versionId === CURRENT_VERSION_ID) {
        return loadExoJsTypingsFromBase('vendor/exojs/');
    }

    const fromVersioned = await loadExoJsTypingsFromBase(`vendor/exojs/${versionId}/`);
    if (fromVersioned.length > 0) return fromVersioned;
    console.warn(`[EditorCode] Versioned typings missing for @codexo/exojs@${versionId}; falling back to flat vendor path.`);
    return loadExoJsTypingsFromBase('vendor/exojs/');
}

async function loadExoJsTypingsFromBase(baseUrl: string): Promise<ReadonlyArray<ExtraLib>> {
    const libs: ExtraLib[] = [];

    try {
        const registryResponse = await fetch(buildPublicUrl(`${baseUrl}monaco-registry.json`), { cache: 'no-cache' });
        if (registryResponse.ok) {
            const registry = (await registryResponse.json()) as Record<string, unknown>;
            if (typeof registry.packageJson === 'string') {
                libs.push({
                    content: registry.packageJson,
                    filePath: 'file:///node_modules/@codexo/exojs/package.json',
                });
            }
            const shims = registry.subpathShims;
            if (Array.isArray(shims)) {
                for (const shim of shims as Record<string, unknown>[]) {
                    if (typeof shim.virtualPath === 'string' && typeof shim.content === 'string') {
                        libs.push({ content: shim.content, filePath: shim.virtualPath });
                    }
                }
            }
        }
    } catch {
        // Fall through to legacy shims.
    }

    const manifest = await fetchTypingsManifest(`${baseUrl}esm-typings.json`);
    if (manifest && manifest.length > 0) {
        const treeLibs = await Promise.all(
            manifest.map(async relativePath => {
                try {
                    const content = await fetchTextFile(buildPublicUrl(`${baseUrl}esm/${relativePath}`));
                    return {
                        content,
                        filePath: `file:///node_modules/@codexo/exojs/dist/esm/${relativePath}`,
                    } satisfies ExtraLib;
                } catch {
                    return null;
                }
            }),
        );
        for (const lib of treeLibs) {
            if (lib) libs.push(lib);
        }
        return libs;
    }

    try {
        libs.push({
            content: await fetchTextFile(buildPublicUrl(`${baseUrl}module-shims.d.ts`)),
            filePath: 'file:///node_modules/@codexo/exojs/dist/module-shims.d.ts',
        });
    } catch {
        // Missing shims; editor still works without package-aware imports.
    }

    try {
        libs.push({
            content: await fetchTextFile(buildPublicUrl(`${baseUrl}exo.d.ts`)),
            filePath: 'file:///node_modules/@codexo/exojs/dist/exo.d.ts',
        });
    } catch {
        // No usable declarations.
    }

    return libs;
}

async function fetchTypingsManifest(relativePath: string): Promise<ReadonlyArray<string> | null> {
    try {
        const response = await fetch(buildPublicUrl(relativePath), { cache: 'no-cache' });
        if (!response.ok) return null;
        const data = (await response.json()) as unknown;
        if (!Array.isArray(data)) return null;
        return data.filter((entry): entry is string => typeof entry === 'string' && entry.endsWith('.d.ts') && !entry.includes('..') && !entry.startsWith('/'));
    } catch {
        return null;
    }
}

function configureLanguageDefaults(): void {
    const tsApi = (monaco.languages as unknown as { typescript: MonacoTypeScriptApi }).typescript;
    const compilerOptions = {
        allowJs: true,
        allowNonTsExtensions: true,
        allowSyntheticDefaultImports: true,
        checkJs: true,
        esModuleInterop: true,
        module: tsApi.ModuleKind.ESNext,
        moduleResolution: tsApi.ModuleResolutionKind.NodeJs,
        noEmit: true,
        noImplicitAny: false,
        noImplicitThis: false,
        strict: false,
        target: tsApi.ScriptTarget.ES2020,
        baseUrl: 'file:///',
        paths: { '@/*': ['node_modules/@codexo/exojs/dist/esm/*'] },
    };
    const diagnosticsOptions = {
        noSemanticValidation: false,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: true,
    };

    tsApi.javascriptDefaults.setEagerModelSync(true);
    tsApi.typescriptDefaults.setEagerModelSync(true);
    tsApi.javascriptDefaults.setCompilerOptions(compilerOptions);
    tsApi.typescriptDefaults.setCompilerOptions(compilerOptions);
    tsApi.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
    tsApi.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

    if (!assetCompletionProviderRegistered) {
        assetCompletionProviderRegistered = true;
        void registerAssetCompletionProvider();
    }
}

async function registerAssetCompletionProvider(): Promise<void> {
    let manifest: AssetManifest;
    try {
        const response = await fetch(buildPublicUrl('assets/assets.json'), { cache: 'no-cache' });
        if (!response.ok) return;
        manifest = (await response.json()) as AssetManifest;
    } catch {
        return;
    }
    monaco.languages.registerCompletionItemProvider('javascript', {
        triggerCharacters: ["'", '"'],
        provideCompletionItems: (model, position) => provideAssetCompletions(model, position, manifest),
    });
    monaco.languages.registerCompletionItemProvider('typescript', {
        triggerCharacters: ["'", '"'],
        provideCompletionItems: (model, position) => provideAssetCompletions(model, position, manifest),
    });
}

function resolveAssetPaths(tokenName: string, manifest: AssetManifest): string[] {
    let category: string | null = null;
    switch (tokenName) {
        case 'Texture':
        case 'HTMLImageElement':
            category = 'image';
            break;
        case 'FontFace':
            category = 'font';
            break;
        case 'AudioStream':
        case 'Sound':
            category = 'audio';
            break;
        case 'Json':
            category = 'json';
            break;
        case 'SvgAsset':
            category = 'svg';
            break;
        case 'Video':
            category = 'video';
            break;
    }
    if (!category) return [];
    return (manifest[category] ?? []).map(file => `${category}/${file}`);
}

function provideAssetCompletions(model: monaco.editor.ITextModel, position: monaco.Position, manifest: AssetManifest): monaco.languages.CompletionList | null {
    const lineContent = model.getLineContent(position.lineNumber);
    const column = position.column - 1;
    let quoteChar = '';
    let quoteStart = -1;

    for (let index = column - 1; index >= 0; index -= 1) {
        const character = lineContent[index];
        if (character === '"' || character === "'") {
            quoteChar = character;
            quoteStart = index;
            break;
        }
        if (character === '{' || character === '}' || character === ';') break;
    }
    if (quoteStart === -1) return null;

    let cursor = quoteStart - 1;
    while (cursor >= 0 && (lineContent[cursor] === ' ' || lineContent[cursor] === '\t')) cursor -= 1;
    if (cursor < 0 || lineContent[cursor] !== ':') return null;

    let quoteEnd = lineContent.length;
    for (let index = column; index < lineContent.length; index += 1) {
        if (lineContent[index] === quoteChar) {
            quoteEnd = index;
            break;
        }
    }

    const startLine = Math.max(1, position.lineNumber - 30);
    const textBefore = model.getValueInRange({
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
    });

    const loaderLoadExpression = /loader\.load\(\s*([A-Z][A-Za-z]*)\s*,/g;
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = loaderLoadExpression.exec(textBefore)) !== null) lastMatch = match;
    if (!lastMatch) return null;

    const paths = resolveAssetPaths(lastMatch[1], manifest);
    if (paths.length === 0) return null;

    const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: quoteStart + 2,
        endLineNumber: position.lineNumber,
        endColumn: quoteEnd + 1,
    };

    return {
        suggestions: paths.map(path => ({
            label: path,
            kind: monaco.languages.CompletionItemKind.File,
            insertText: path,
            range,
        })),
        incomplete: false,
    };
}

async function fetchTextFile(url: string): Promise<string> {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to fetch editor support file at ${url}.`);
    return response.text();
}
