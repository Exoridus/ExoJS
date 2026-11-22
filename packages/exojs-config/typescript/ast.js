/**
 * Native TypeScript 7.1 AST entry point shared by scripts that inspect syntax.
 * SourceFile leases are disposed immediately after the visitor returns.
 */
import {
  isClassDeclaration,
  isEnumDeclaration,
  isFunctionDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isModuleDeclaration,
  isStringLiteralLikeNode,
  isTemplateExpression,
  isTypeAliasDeclaration,
  isVariableStatement,
} from '@typescript/native/ast/is';
import { SyntaxKind } from '@typescript/native/ast';
import { API } from '@typescript/native/sync';

/** @type {API | undefined} */
let client;

/** @returns {API} */
const currentClient = () => {
  client ??= new API();

  return client;
};

process.once('exit', () => {
  client?.close();
});

/**
 * @template T
 * @param {string} filename
 * @param {string} text
 * @param {(sourceFile: import('@typescript/native/ast').SourceFile) => T} visit
 * @returns {T}
 */
export const withNativeSourceFile = (filename, text, visit) => {
  const lease = currentClient().createSourceFile(filename, text);

  try {
    return visit(lease.sourceFile);
  } finally {
    lease[Symbol.dispose]();
  }
};

export {
  isClassDeclaration,
  isEnumDeclaration,
  isFunctionDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isModuleDeclaration,
  isStringLiteralLikeNode,
  isTemplateExpression,
  isTypeAliasDeclaration,
  isVariableStatement,
  SyntaxKind,
};
