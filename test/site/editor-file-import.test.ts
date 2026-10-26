// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it } from 'vitest';

const file = ts.createSourceFile(
  'EditorCode.tsx',
  readFileSync('site/src/components/EditorCode.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declarations: ts.VariableDeclaration[] = [];
let cleanup!: ts.ArrowFunction;

const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && ['onFileImport', 'resetCode'].includes(node.name.getText(file))) {
    declarations.push(node);
  }

  if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect') {
    const effect = node.arguments[0];

    if (effect && ts.isArrowFunction(effect) && ts.isArrowFunction(effect.body)) {
      cleanup = effect.body;
    }
  }

  ts.forEachChild(node, visit);
};

visit(file);
const compiled = ts.transpileModule(
  `${declarations.map(node => `const ${node.getText(file)};`).join('\n')}\nconst retire = ${cleanup.getText(file)};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const fixture = () => {
  class Reader {
    static instances: Reader[] = [];
    result: string | null = null;
    aborted = false;
    onload: (() => void) | null = null;
    onloadend: (() => void) | null = null;

    constructor() {
      Reader.instances.push(this);
    }

    readAsText() {}

    abort() {
      this.aborted = true;
      this.onloadend?.();
    }

    complete(text: string) {
      this.result = text;
      this.onload?.();
      this.onloadend?.();
    }
  }

  const model = {
    text: 'original',
    disposed: false,
    isDisposed() {
      return this.disposed;
    },
    dispose() {
      this.disposed = true;
    },
    setValue(text: string) {
      if (this.disposed) {
        throw new Error('Model is disposed');
      }

      this.text = text;
    },
  };
  const state = { buffer: 'original', dirty: false };
  const entryModelRef = { current: model };
  const handlers = runInNewContext(`${compiled}\n({ onFileImport, resetCode, retire });`, {
    FileReader: Reader,
    entryModelRef,
    importReaderRef: { current: null },
    sourceCodeRef: { current: 'original' },
    filesRef: { current: new Map([['entry.ts', { model }]]) },
    fileRequestRef: { current: null },
    autoRefreshTimerRef: { current: null },
    footgunTimerRef: { current: null },
    disposablesRef: { current: [] },
    selectedVersionRef: { current: 'current' },
    readOnly: false,
    canReset: true,
    window: { confirm: () => true },
    setShowMenu() {},
    setEditorValue: (value: string) => (state.buffer = value),
    onDirty: (dirty: boolean) => (state.dirty = dirty),
    onResetCode() {},
  }) as { onFileImport(event: object): void; resetCode(): void; retire(): void };

  const importFile = () => {
    handlers.onFileImport({ currentTarget: { files: [{}], value: 'import.ts' } });

    return Reader.instances.at(-1)!;
  };

  return { ...handlers, state, model, entryModelRef, importFile };
};

it('aborts an import on editor retirement and ignores its already queued completion', () => {
  const editor = fixture();
  const reader = editor.importFile();
  editor.retire();
  expect(() => reader.complete('obsolete')).not.toThrow();
  expect(editor.model.text).toBe('original');
  expect(editor.state).toEqual({ buffer: 'original', dirty: false });
  expect(reader.aborted).toBe(true);
});

it('cancels an older import when a new file is selected', () => {
  const editor = fixture();
  const older = editor.importFile();
  const newer = editor.importFile();
  newer.complete('newer');
  older.complete('older');
  expect(editor.model.text).toBe('newer');
  expect(editor.state.buffer).toBe('newer');
  expect(older.aborted).toBe(true);
});

it('cancels a pending import when the example is reset', () => {
  const editor = fixture();
  const reader = editor.importFile();
  editor.resetCode();
  reader.complete('obsolete');
  expect(editor.model.text).toBe('original');
  expect(editor.state).toEqual({ buffer: 'original', dirty: false });
  expect(reader.aborted).toBe(true);
});

it.each(['replaced', 'disposed'])('ignores completion after the entry model is %s', state => {
  const editor = fixture();
  const reader = editor.importFile();

  if (state === 'replaced') {
    editor.entryModelRef.current = { ...editor.model, text: 'different entry' };
  } else {
    editor.model.dispose();
  }

  expect(() => reader.complete('obsolete')).not.toThrow();
  expect(editor.model.text).toBe('original');
  expect(editor.state.buffer).toBe('original');

  if (state === 'replaced') {
    expect(editor.entryModelRef.current.text).toBe('different entry');
  }
});

it('marks an imported entry dirty without relying on editor content events', () => {
  const editor = fixture();
  editor.importFile().complete('imported');
  expect(editor.model.text).toBe('imported');
  expect(editor.state).toEqual({ buffer: 'imported', dirty: true });
});
