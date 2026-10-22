/**
 * Finds and rewrites the module specifiers of a TypeScript or JavaScript file
 * without touching anything else in it.
 *
 * The file is parsed, not pattern-matched, so only real module references are
 * visited: import and export declarations, `import x = require()`, `import()`
 * expressions and types (including `typeof import()`), the names of
 * `declare module` blocks, `require()` / `require.resolve()` /
 * `import.meta.resolve()`, and the module argument of the test runners' module
 * mocks (`vi.mock()` and friends). A specifier-shaped string anywhere else - a
 * comment, a JSDoc example, a string literal type, a URL - is left alone.
 */
import ts from 'typescript';

export interface SpecifierOccurrence {
  readonly specifier: string;
  /** Offset of the opening quote. */
  readonly start: number;
  /** Offset just past the closing quote. */
  readonly end: number;
}

const MOCK_RECEIVERS = new Set(['vi', 'jest']);
const MOCK_METHODS = new Set(['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock', 'requireActual', 'requireMock']);

/**
 * The script kind a file name implies. A `.ts` file is never parsed as TSX:
 * there `<T>(x) => x` is a JSX element, not a generic arrow function.
 */
export const scriptKindFor = (fileName: string): ts.ScriptKind => {
  if (/\.tsx$/i.test(fileName)) {
    return ts.ScriptKind.TSX;
  }

  if (/\.jsx$/i.test(fileName)) {
    return ts.ScriptKind.JSX;
  }

  if (/\.[cm]?js$/i.test(fileName)) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
};

const literalOf = (node: ts.Node | undefined): ts.StringLiteralLike | undefined =>
  node !== undefined && ts.isStringLiteralLike(node) ? node : undefined;

const isSpecifierCall = (node: ts.CallExpression): boolean => {
  const callee = node.expression;

  if (callee.kind === ts.SyntaxKind.ImportKeyword) {
    return true;
  }

  if (ts.isIdentifier(callee)) {
    return callee.text === 'require';
  }

  if (!ts.isPropertyAccessExpression(callee)) {
    return false;
  }

  const receiver = callee.expression;
  const method = callee.name.text;

  if (ts.isIdentifier(receiver)) {
    return (receiver.text === 'require' && method === 'resolve') || (MOCK_RECEIVERS.has(receiver.text) && MOCK_METHODS.has(method));
  }

  return ts.isMetaProperty(receiver) && receiver.keywordToken === ts.SyntaxKind.ImportKeyword && method === 'resolve';
};

/** Every module specifier the file references, in source order. */
export const findModuleSpecifiers = (fileName: string, text: string, scriptKind = scriptKindFor(fileName)): SpecifierOccurrence[] => {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, scriptKind);
  const found: SpecifierOccurrence[] = [];

  const record = (literal: ts.StringLiteralLike | undefined): void => {
    if (literal !== undefined) {
      found.push({ specifier: literal.text, start: literal.getStart(source), end: literal.getEnd() });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(literalOf(node.moduleSpecifier));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      record(literalOf(node.moduleReference.expression));
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      record(literalOf(node.argument.literal));
    } else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      record(node.name);
    } else if (ts.isCallExpression(node) && isSpecifierCall(node)) {
      record(literalOf(node.arguments[0]));
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
};

/**
 * Returns `text` with each module specifier replaced by `map(specifier)`, or
 * kept when `map` returns `undefined`. The original quote character is kept.
 */
export const rewriteModuleSpecifiers = (
  fileName: string,
  text: string,
  map: (specifier: string) => string | undefined,
  scriptKind = scriptKindFor(fileName),
): string => {
  let result = text;

  for (const occurrence of findModuleSpecifiers(fileName, text, scriptKind).reverse()) {
    const replacement = map(occurrence.specifier);

    if (replacement === undefined || replacement === occurrence.specifier) {
      continue;
    }

    const quote = text[occurrence.start];
    result = `${result.slice(0, occurrence.start)}${quote}${replacement}${quote}${result.slice(occurrence.end)}`;
  }

  return result;
};
