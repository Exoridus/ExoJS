// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { demoAssets } from '@codexo/exojs-demo-assets';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('uses the public root catalog for the Asset Browser E2E expectation', () => {
  const file = ts.createSourceFile(
    'playground-e2e.ts',
    readFileSync('site/scripts/playground-e2e.ts', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const statement = file.statements.find(
    node =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(declaration => declaration.name.getText(file) === 'readCatalog'),
  )!;
  const code = ts.transpileModule(ts.createPrinter().printNode(ts.EmitHint.Unspecified, statement, file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const catalog = runInNewContext(`${code}\nreadCatalog();`, {
    readFileSync,
    resolve,
    repoRoot: process.cwd(),
  }) as Array<{ key: string }>;

  expect(catalog.map(entry => entry.key).sort()).toEqual(Object.keys(demoAssets).sort());
});
