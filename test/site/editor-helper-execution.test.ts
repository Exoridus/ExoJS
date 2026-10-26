// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it, vi } from 'vitest';

import { isEditableSharedFile } from '../../site/src/lib/preview-modules';

const source = ts.createSourceFile(
  'EditorCode.tsx',
  readFileSync('site/src/components/EditorCode.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let refresh!: ts.Expression;
let contentChanged!: ts.Expression;
let syncSource!: ts.Expression;
let importFile!: ts.Expression;

const visit = (node: ts.Node): void => {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(source) === 'triggerRefresh' &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
  ) {
    refresh = node.initializer.arguments[0]!;
  }

  if (ts.isCallExpression(node) && node.expression.getText(source) === 'editor.onDidChangeModelContent') {
    contentChanged = node.arguments[0]!;
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.getText(source) === 'useEffect' &&
    node.arguments[0]?.getText(source).includes('setEditorValue(sourceCode')
  ) {
    syncSource = node.arguments[0]!;
  }

  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'onFileImport' && node.initializer) {
    importFile = node.initializer;
  }

  ts.forEachChild(node, visit);
};

visit(source);
const compiled = ts.transpileModule(`const run = ${refresh.getText(source)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const fixture = (helperCode = 'edited helper') => {
  const entry = { getValue: () => 'main source', getVersionId: () => 1, isDisposed: () => false };
  let helperVersion = 1;
  const helper = { getValue: () => helperCode, getVersionId: () => helperVersion, isDisposed: () => false };
  const files = new Map([
    ['entry.ts', { model: entry }],
    ['shared/runtime.ts', { model: helper }],
  ]);
  const originals = new Map([['shared/runtime.ts', 'original helper']]);
  const onUpdateCode = vi.fn();
  const onDirty = vi.fn();
  const emit = vi.fn(async (model: typeof entry) => `compiled ${model.getValue()}`);
  const run = runInNewContext(`${compiled}\nrun;`, {
    readOnly: false,
    language: 'typescript',
    entryModelRef: { current: entry },
    filesRef: { current: files },
    originalFilesRef: { current: originals },
    isEditableSharedFile,
    getExecutionCode: emit,
    onUpdateCode,
    onDirty,
  }) as () => Promise<void>;

  return {
    run,
    onUpdateCode,
    onDirty,
    emit,
    changeHelper: (code = helperCode) => {
      helperCode = code;
      helperVersion++;
    },
    loadHelper: (code: string) => {
      files.set('shared/gallery-transitions.ts', {
        model: { getValue: () => code, getVersionId: () => 1, isDisposed: () => false },
      });
      originals.set('shared/gallery-transitions.ts', 'original gallery');
    },
  };
};

it('runs the entry with compiled local helper edits and retains reset availability', async () => {
  const editor = fixture();
  await editor.run();
  expect(editor.onUpdateCode).toHaveBeenCalledExactlyOnceWith({
    code: 'main source',
    executionCode: 'compiled main source',
    executionModules: { 'shared/runtime.ts': 'compiled edited helper' },
  });
  expect(editor.onDirty).toHaveBeenCalledWith(true);
});

it('does not override unmodified helpers', async () => {
  const editor = fixture('original helper');
  await editor.run();
  expect(editor.emit).toHaveBeenCalledTimes(1);
  expect(editor.onUpdateCode.mock.calls[0]![0].executionModules).toEqual({});
  expect(editor.onDirty).toHaveBeenCalledWith(false);
});

it('keeps the previous preview when a helper changes during compilation', async () => {
  const editor = fixture();
  editor.emit.mockImplementation(async model => {
    editor.changeHelper();

    return model.getValue();
  });
  await editor.run();
  expect(editor.onUpdateCode).not.toHaveBeenCalled();
});

it('keeps the previous preview when a clean helper is edited during compilation', async () => {
  const editor = fixture('original helper');
  editor.emit.mockImplementation(async model => {
    editor.changeHelper('new helper edit');

    return model.getValue();
  });
  await editor.run();
  expect(editor.onUpdateCode).not.toHaveBeenCalled();
  expect(editor.onDirty).not.toHaveBeenCalled();
});

it('keeps the previous preview when a helper is loaded and edited during compilation', async () => {
  const editor = fixture('original helper');
  editor.emit.mockImplementation(async model => {
    editor.loadHelper('edited gallery');

    return model.getValue();
  });
  await editor.run();
  expect(editor.onUpdateCode).not.toHaveBeenCalled();
});

it('can finish a run while an unmodified helper is opened', async () => {
  const editor = fixture('original helper');
  editor.emit.mockImplementation(async model => {
    editor.loadHelper('original gallery');

    return model.getValue();
  });
  await editor.run();
  expect(editor.onUpdateCode).toHaveBeenCalledOnce();
});

it.each([false, true])('auto-runs restored helper source only when the visible buffer is editable (readOnly=%s)', readOnly => {
  const entry = { getValue: () => 'main source' };
  const helper = { getValue: () => 'original helper' };
  const run = vi.fn();
  const timers = new Map<number, { callback(): void; delay: number }>();

  const setTimer = (callback: () => void, delay: number) => {
    const id = timers.size + 1;
    timers.set(id, { callback, delay });

    return id;
  };

  const code = ts.transpileModule(`const changed = ${contentChanged.getText(source)};changed();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    editor: { getModel: () => helper, getOption: () => readOnly },
    monacoApi: { editor: { EditorOption: { readOnly: 1 } } },
    entryModelRef: { current: entry },
    sourceCodeRef: { current: 'main source' },
    filesRef: { current: new Map([['shared/runtime.ts', { model: helper }]]) },
    originalFilesRef: { current: new Map([['shared/runtime.ts', 'original helper']]) },
    isEditableSharedFile,
    onDirty: vi.fn(),
    footgunTimerRef: { current: null },
    FOOTGUN_DEBOUNCE_MS: 150,
    autoRefreshRef: { current: true },
    autoRefreshTimerRef: { current: null },
    triggerRefreshRef: { current: run },
    setTimeout: setTimer,
    clearTimeout: (id: number) => timers.delete(id),
  });
  const refreshTimer = [...timers.values()].find(timer => timer.delay === 800);

  if (readOnly) {
    expect(refreshTimer).toBeUndefined();
  } else {
    expect(refreshTimer).toBeDefined();
    refreshTimer!.callback();
    expect(run).toHaveBeenCalledOnce();
  }
});

it.each(['source-sync', 'import'] as const)('preserves helper reset availability during %s of an unchanged main file', action => {
  const onDirty = vi.fn();
  const entry = { getValue: () => 'main source', setValue: vi.fn(), isDisposed: () => false };
  const callback = action === 'source-sync' ? syncSource : importFile;
  const code = ts.transpileModule(`const change = ${callback.getText(source)};change(event);`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  class FileReader {
    result = 'main source';
    onload = () => {};
    onloadend = () => {};

    readAsText(): void {
      this.onload();
      this.onloadend();
    }
  }

  runInNewContext(code, {
    sourceCode: 'main source',
    sourceCodeRef: { current: 'main source' },
    setEditorValue: vi.fn(),
    setCopyStatus: vi.fn(),
    entryModelRef: { current: entry },
    filesRef: { current: new Map([['shared/runtime.ts', { model: { getValue: () => 'edited helper' } }]]) },
    originalFilesRef: { current: new Map([['shared/runtime.ts', 'original helper']]) },
    isEditableSharedFile,
    onDirty,
    readOnly: false,
    importReaderRef: { current: null },
    FileReader,
    event: { currentTarget: { files: [{}], value: 'main.ts' } },
  });
  expect(onDirty).toHaveBeenLastCalledWith(true);
});
