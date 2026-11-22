// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const file = ts.createSourceFile(
  'ExampleBrowser.tsx',
  readFileSync('site/src/components/ExampleBrowser.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let callback!: ts.Expression;

const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'onPopState' && node.initializer) {
    callback = node.initializer;
  }

  ts.forEachChild(node, visit);
};

visit(file);

it('keeps an unknown version explicit when returning through browser history', () => {
  const setSelectionError = vi.fn();
  const setActiveExample = vi.fn();
  const resolveActiveExample = vi.fn();
  const code = ts.transpileModule(`const back = ${callback.getText(file)}; back();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    readUrlState: () => ({ version: 'unknown-version' }),
    getVersionById: () => null,
    setSelectionError,
    setActiveExample,
    resolveActiveExample,
  });
  expect(setSelectionError).toHaveBeenCalledWith(expect.stringContaining('unknown-version'));
  expect(setActiveExample).toHaveBeenCalledWith(null);
  expect(resolveActiveExample).not.toHaveBeenCalled();
});
