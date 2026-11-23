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
const callbacks = new Map<string, ts.Expression>();

const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && node.initializer) {
    callbacks.set(node.name.getText(file), ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer);
  }

  ts.forEachChild(node, visit);
};

visit(file);

it.each(['onPopState', 'syncVersionState'])('retires the selected version for an invalid URL through %s', callbackName => {
  const setSelectionError = vi.fn();
  const setActiveExample = vi.fn();
  const resolveActiveExample = vi.fn();
  const selectedVersionRef = { current: { id: 'current' } as { id: string } | null };
  const activeExampleRef = { current: { path: 'hello-world.js' } as { path: string } | null };
  const setSelectedVersion = vi.fn();
  const code = ts.transpileModule(
    `const reject = ${callbacks.get(callbackName)!.getText(file)}; reject(); const sync = ${callbacks.get('syncExampleState')!.getText(file)}; sync();`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  runInNewContext(code, {
    readUrlState: () => ({ version: 'unknown-version' }),
    getVersionById: () => null,
    selectedVersionRef,
    activeExampleRef,
    setSelectedVersion,
    setSelectionError,
    setActiveExample,
    setExamples: vi.fn(),
    setLoaded: vi.fn(),
    setLoadError: vi.fn(),
    hasExamplesFor: () => true,
    getLoadErrorFor: () => null,
    getNestedExamples: () => new Map(),
    resolveActiveExample,
  });
  expect(setSelectionError).toHaveBeenCalledWith(expect.stringContaining('unknown-version'));
  expect(setActiveExample).toHaveBeenCalledWith(null);
  expect(setSelectedVersion).toHaveBeenCalledWith(null);
  expect(selectedVersionRef.current).toBeNull();
  expect(activeExampleRef.current).toBeNull();
  expect(resolveActiveExample).not.toHaveBeenCalled();
});

it('does not canonicalize a newer URL from a stale selected version', () => {
  const writeUrlState = vi.fn();
  const setActiveExample = vi.fn();
  const example = { path: 'getting-started/hello-world.js' };
  const code = ts.transpileModule(
    `const resolve = ${callbacks.get('resolveActiveExample')!.getText(file)}; resolve({canonicaliseUrl:true});`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  runInNewContext(code, {
    selectedVersionRef: { current: { id: 'current' } },
    readUrlState: () => ({ version: 'unknown-version', example: example.path }),
    hasExamplesFor: () => true,
    getExampleByPath: () => example,
    getExamplesList: () => [example],
    setSelectionError: vi.fn(),
    setActiveExample,
    writeUrlState,
  });
  expect(writeUrlState).not.toHaveBeenCalled();
  expect(setActiveExample).not.toHaveBeenCalled();
});
