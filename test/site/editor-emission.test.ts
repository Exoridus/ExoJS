// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';

const source = ts.createSourceFile(
  'EditorCode.tsx',
  readFileSync('site/src/components/EditorCode.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declaration = source.statements.find(
  node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(source) === 'getExecutionCode'),
)!;
const code = ts.transpileModule(ts.createPrinter().printNode(ts.EmitHint.Unspecified, declaration, source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const load = (getTypeScriptWorker: () => Promise<unknown>) =>
  runInNewContext(`${code}\ngetExecutionCode`, {
    monaco: { languages: { typescript: { getTypeScriptWorker } } },
    setTimeout,
    clearTimeout,
  }) as (model: object, language: string) => Promise<string | null>;
const model = { uri: { toString: () => 'file:///example.ts' } };
afterEach(() => vi.useRealTimers());

it('allows a successfully emitted empty program', async () => {
  const emit = load(async () => async () => ({ getEmitOutput: async () => ({ outputFiles: [{ name: 'example.js', text: '' }] }) }));
  await expect(emit(model, 'typescript')).resolves.toBe('');
});

it('ends a worker request that never responds without returning raw TypeScript', async () => {
  vi.useFakeTimers();
  const emit = load(() => new Promise(() => {}));
  const result = emit(model, 'typescript');
  await vi.advanceTimersByTimeAsync(17000);
  await expect(result).resolves.toBeNull();
}, 1000);
