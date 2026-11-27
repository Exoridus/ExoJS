/**
 * Fails fast when the installed native TypeScript 7.1 API is absent or broken.
 * The API client owns native Go resources, so always dispose it and parse leases.
 *
 * This does not replace the compiler/guides/consumer gates: it validates the
 * new programmatic API separately while the classic tooling is migrated.
 */
import assert from 'node:assert/strict';

import { ScriptTarget } from '@typescript/native/ast';
import { isVariableStatement } from '@typescript/native/ast/is';
import { API, ModuleKind } from '@typescript/native/sync';

const api = new API();

try {
  const lease = api.createSourceFile('native-api-probe.ts', 'export const answer: number = 42;');

  try {
    const source = lease.sourceFile;
    const statement = source.statements.find(isVariableStatement);

    assert.ok(statement, 'TypeScript 7.1 must expose variable declaration AST nodes.');
    assert.equal(statement.declarationList.declarations[0]?.name.getText(source), 'answer');
  } finally {
    lease[Symbol.dispose]();
  }

  const result = api.transpileModule('export const answer: number = 42;', {
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  assert.equal(result.diagnostics?.length ?? 0, 0);
  assert.match(result.outputText, /export const answer = 42;/u);

  console.log('typecheck:native-api: TypeScript 7.1 AST and transpile API passed.');
} finally {
  api[Symbol.dispose]();
}
