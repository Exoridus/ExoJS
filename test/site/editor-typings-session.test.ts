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
