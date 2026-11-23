// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const load = (context: Record<string, unknown>) => {
  const file = ts.createSourceFile(
    'EditorCode.tsx',
    readFileSync('site/src/components/EditorCode.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const statement = file.statements.find(
    node =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(declaration => declaration.name.getText(file) === 'ensureTypingsForVersion'),
  )!;
  const code = ts.transpileModule(ts.createPrinter().printNode(ts.EmitHint.Unspecified, statement, file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  return runInNewContext(`${code}\nensureTypingsForVersion;`, { configureMonacoOnce: async () => undefined, ...context }) as (
    version: string,
    selected: { current: string },
    applied: { current: string | null },
    after: () => void,
  ) => Promise<void>;
};

it('updates materialized declaration models when switching library versions', async () => {
  const model = { getValue: () => 'old declaration', setValue: vi.fn() };
  const defaults = { getExtraLibs: () => ({}), setExtraLibs: vi.fn() };
  const monaco = {
    Uri: { parse: (path: string) => path },
    editor: { getModel: () => model },
    languages: { typescript: { javascriptDefaults: defaults, typescriptDefaults: defaults } },
  };
  const ensure = load({
    monaco,
    getTypingsForVersion: async () => [{ filePath: 'file:///node_modules/example/index.d.ts', content: 'new declaration' }],
  });
  const applied = { current: null as string | null };
  const after = vi.fn();
  await ensure('new', { current: 'new' }, applied, after);
  expect(model.setValue).toHaveBeenCalledExactlyOnceWith('new declaration');
  expect(applied.current).toBe('new');
  expect(after).toHaveBeenCalledOnce();
});

it('discards a delayed library request after its editor session is retired', async () => {
  let resolve!: (value: unknown[]) => void;
  const pending = new Promise<unknown[]>(done => {
    resolve = done;
  });
  const defaults = { getExtraLibs: () => ({}), setExtraLibs: vi.fn() };
  const ensure = load({
    getTypingsForVersion: () => pending,
    monaco: { languages: { typescript: { javascriptDefaults: defaults, typescriptDefaults: defaults } } },
  });
  const selected = { current: 'old' };
  const after = vi.fn();
  const result = ensure('old', selected, { current: null }, after);
  selected.current = '';
  resolve([]);
  await result;
  expect(defaults.setExtraLibs).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});

it('disposes materialized declarations removed by a version switch without touching retained libraries', async () => {
  const removed = { dispose: vi.fn() };
  const retained = { getValue: () => 'current', setValue: vi.fn(), dispose: vi.fn() };
  const defaults = { getExtraLibs: () => ({ 'file:///removed.d.ts': {}, 'file:///retained.d.ts': {} }), setExtraLibs: vi.fn() };
  const models = new Map([
    ['file:///removed.d.ts', removed],
    ['file:///retained.d.ts', retained],
  ]);
  const monaco = {
    Uri: { parse: (path: string) => path },
    editor: { getModel: (path: string) => models.get(path) },
    languages: { typescript: { javascriptDefaults: defaults, typescriptDefaults: defaults } },
  };
  const ensure = load({ monaco, getTypingsForVersion: async () => [{ filePath: 'file:///retained.d.ts', content: 'current' }] });
  await ensure('new', { current: 'new' }, { current: null }, vi.fn());
  expect(removed.dispose).toHaveBeenCalledOnce();
  expect(retained.dispose).not.toHaveBeenCalled();
});

it('clears old global declarations before the replacement request resolves and when retiring the editor', () => {
  const file = ts.createSourceFile(
    'EditorCode.tsx',
    readFileSync('site/src/components/EditorCode.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let effect!: ts.Expression;
  let clear!: ts.VariableStatement;

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === 'useEffect' &&
      node.arguments[0]?.getText(file).includes('void ensureTypingsForVersion(')
    ) {
      effect = node.arguments[0];
    }

    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(file) === 'clearTypings')) {
      clear = node;
    }

    ts.forEachChild(node, visit);
  };

  visit(file);
  const declarationPath = 'file:///node_modules/@codexo/exojs/package.json';
  let libraries: Record<string, unknown> = { [declarationPath]: { content: '{"version":"old"}' } };
  const model = { dispose: vi.fn() };
  const defaults = {
    getExtraLibs: () => libraries,
    setExtraLibs: (next: Array<{ filePath: string; content: string }>) => {
      libraries = Object.fromEntries(next.map(lib => [lib.filePath, { content: lib.content }]));
    },
  };
  const request = vi.fn(() => new Promise<void>(() => {}));
  const code = ts.transpileModule(`${ts.createPrinter().printNode(ts.EmitHint.Unspecified, clear, file)}\n(${effect.getText(file)})();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const retire = runInNewContext(code, {
    selectedVersionId: '0.19.0',
    selectedVersionRef: { current: '0.19.0' },
    typingsAppliedVersionRef: { current: 'current' },
    setTypingsLoading: vi.fn(),
    setTypingsError: vi.fn(),
    onDiagnostic: vi.fn(),
    ensureTypingsForVersion: request,
    monaco: {
      Uri: { parse: (path: string) => path },
      editor: { getModel: () => model },
      languages: { typescript: { javascriptDefaults: defaults, typescriptDefaults: defaults } },
    },
  }) as () => void;
  expect(request).toHaveBeenCalledOnce();
  expect(libraries).toEqual({});
  expect(model.dispose).toHaveBeenCalledOnce();
  libraries = { [declarationPath]: { content: '{"version":"0.19.0"}' } };
  retire();
  expect(libraries).toEqual({});
  expect(model.dispose).toHaveBeenCalledTimes(2);
});
