// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it } from 'vitest';

import { isEditableSharedFile } from '../../site/src/lib/preview-modules';

const file = ts.createSourceFile(
  'EditorCode.tsx',
  readFileSync('site/src/components/EditorCode.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let selectFile!: ts.Expression;
let onMount!: ts.Expression;
let options!: ts.Expression;
let propSync: ts.Expression | undefined;

const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && node.initializer) {
    if (node.name.getText(file) === 'selectFile' && ts.isCallExpression(node.initializer)) {
      selectFile = node.initializer.arguments[0]!;
    } else if (node.name.getText(file) === 'onMount') {
      onMount = node.initializer;
    }
  }

  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === 'MonacoReactEditor') {
    const attribute = node.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText(file) === 'options');

    if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer)) {
      options = attribute.initializer.expression!;
    }
  }

  if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect') {
    const dependencies = node.arguments[1];
    const effect = node.arguments[0];

    if (dependencies?.getText(file) === '[readOnly]' && effect?.getText(file).includes('updateOptions')) {
      propSync = effect;
    }
  }

  ts.forEachChild(node, visit);
};

visit(file);
const compiled = ts.transpileModule(
  `const selectFile = ${selectFile.getText(file)};
   const onMount = ${onMount.getText(file)};
   const options = activeReadOnly => (${options.getText(file)});
   const syncReadOnly = ${propSync?.getText(file) ?? '() => {}'};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const fixture = (readOnly = false) => {
  const entry = { name: 'entry' };
  const helper = { name: 'helper' };
  const state = { model: entry, readOnly: false, readOnlyAtModelChange: false };
  const disposable = { dispose() {} };
  const editor = {
    getModel: () => state.model,
    saveViewState: () => null,
    setModel(model: typeof entry) {
      state.model = model;
      state.readOnlyAtModelChange = state.readOnly;
    },
    updateOptions(options: { readOnly?: boolean }) {
      if (options.readOnly !== undefined) {
        state.readOnly = options.readOnly;
      }
    },
    onDidChangeCursorSelection: () => disposable,
    onDidChangeModelContent: () => disposable,
    addCommand() {},
  };
  const context = {
    readOnly,
    isEditableSharedFile,
    readOnlyRef: { current: readOnly },
    sourcePath: 'entry.ts',
    editorRef: { current: editor },
    modelRef: { current: entry },
    entryModelRef: { current: entry },
    filesRef: { current: new Map([['helper.ts', { model: helper, view: null }]]) },
    selectedVersionRef: { current: 'current' },
    typingsAppliedVersionRef: { current: 'current' },
    disposablesRef: { current: [] },
    window: {},
    MONACO_FONT_FAMILY: 'monospace',
    setActiveFile() {},
    updateDiagnostics() {},
    updateFootgunMarkers() {},
    onDiagnostic() {},
    onCursorChange() {},
    requestAnimationFrame() {},
  };
  const handlers = runInNewContext(`${compiled}\n({selectFile, onMount, options, syncReadOnly});`, context) as {
    selectFile(path: string): void;
    onMount(editor: object, api: object): void;
    options(readOnly: boolean): { readOnly?: boolean };
    syncReadOnly(): void;
  };
  editor.updateOptions(handlers.options(readOnly));
  handlers.onMount(editor, { editor: { onDidChangeMarkers: () => disposable }, KeyMod: { CtrlCmd: 1 }, KeyCode: { Enter: 2 } });

  return { ...handlers, state, entry, editor, context };
};

it('keeps a helper read only when options from the previous entry render arrive late', () => {
  const editor = fixture();
  const pendingEntryOptions = editor.options(false);
  editor.selectFile('helper.ts');
  editor.editor.updateOptions(pendingEntryOptions);
  expect(editor.state.readOnly).toBe(true);
});

it('locks helpers before the model-change event exposes them to editor consumers', () => {
  const editor = fixture();
  editor.selectFile('helper.ts');
  expect(editor.state.readOnlyAtModelChange).toBe(true);
});

it('honors an initially read-only entry and later global read-only prop changes', () => {
  const editor = fixture(true);
  expect(editor.state.readOnly).toBe(true);
  editor.context.readOnly = false;
  editor.editor.updateOptions(editor.options(false));
  editor.syncReadOnly();
  expect(editor.state.readOnly).toBe(false);
  editor.selectFile('helper.ts');
  editor.editor.updateOptions(editor.options(true));
  editor.syncReadOnly();
  expect(editor.state.readOnly).toBe(true);
  editor.selectFile('entry.ts');
  editor.context.readOnly = true;
  editor.editor.updateOptions(editor.options(true));
  editor.syncReadOnly();
  expect(editor.state.readOnly).toBe(true);
});
