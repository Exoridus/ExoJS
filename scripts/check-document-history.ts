import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

interface HistoryEntry {
  readonly type: string;
  readonly version: number;
  readonly name: string;
  readonly declaration: string;
  readonly fixture: string;
  readonly sha256: string;
}

const lockPath = 'document-history.lock.json';

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;

  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map(key => [key, sortJson(record[key])]),
  );
};

export const documentVersionHash = (source: string, name: string, fixture: string): string => {
  const file = ts.createSourceFile('document.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const locals = new Map<string, Array<ts.InterfaceDeclaration | ts.TypeAliasDeclaration>>();
  const used = new Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>();
  const outside = new Set<string>();

  for (const declaration of file.statements) {
    if (ts.isImportDeclaration(declaration)) {
      const clause = declaration.importClause;

      if (clause?.name !== undefined) {
        outside.add(clause.name.text);
      }

      if (clause?.namedBindings !== undefined) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          outside.add(clause.namedBindings.name.text);
        } else {
          for (const element of clause.namedBindings.elements) {
            outside.add(element.name.text);
          }
        }
      }
    } else if (
      (ts.isClassDeclaration(declaration) || ts.isEnumDeclaration(declaration) || ts.isModuleDeclaration(declaration)) &&
      declaration.name
    ) {
      outside.add(declaration.name.text);
    }

    if (!ts.isInterfaceDeclaration(declaration) && !ts.isTypeAliasDeclaration(declaration)) {
      continue;
    }

    const id = declaration.name.text;
    const list = locals.get(id);

    if (list === undefined) {
      locals.set(id, [declaration]);
    } else {
      list.push(declaration);
    }
  }

  const capture = (id: string): void => {
    if (used.has(id)) {
      return;
    }

    const declarations = locals.get(id);
    const declaration = declarations?.[0];

    if (declaration === undefined || declarations?.length !== 1) {
      throw new Error(`Expected a single type declaration for ${id}.`);
    }

    used.set(id, declaration);

    const visit = (node: ts.Node): void => {
      if (ts.isTypeQueryNode(node)) {
        throw new Error(`Frozen document ${name} must not use typeof queries.`);
      }

      const reference = ts.isTypeReferenceNode(node) ? node.typeName : ts.isExpressionWithTypeArguments(node) ? node.expression : undefined;
      let root: ts.Node | undefined = reference;

      while (root !== undefined && (ts.isQualifiedName(root) || ts.isPropertyAccessExpression(root))) {
        root = ts.isQualifiedName(root) ? root.left : root.expression;
      }

      if (root !== undefined && ts.isIdentifier(root)) {
        if (outside.has(root.text)) {
          throw new Error(`Frozen document ${name} references ${root.text}, which is not a type declared in the same file.`);
        }

        if (reference === root && locals.has(root.text)) {
          capture(root.text);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(declaration);
  };

  capture(name);

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
  const normalized = [name, ...[...used.keys()].filter(id => id !== name).sort()]
    .map(id => printer.printNode(ts.EmitHint.Unspecified, used.get(id)!, file))
    .join('\n');
  const json = sortJson(JSON.parse(fixture) as unknown);

  return createHash('sha256')
    .update(JSON.stringify([normalized, json]))
    .digest('hex');
};

const historyEntries = (data: unknown): Map<string, HistoryEntry> => {
  if (!Array.isArray(data)) {
    throw new Error('Document history must be an array.');
  }

  const entries = new Map<string, HistoryEntry>();

  for (const value of data as unknown[]) {
    if (value === null || typeof value !== 'object') {
      throw new Error('Document history entries must be objects.');
    }

    const entry = value as Partial<HistoryEntry>;

    if (
      typeof entry.type !== 'string' ||
      entry.type === '' ||
      typeof entry.version !== 'number' ||
      !Number.isSafeInteger(entry.version) ||
      entry.version < 1 ||
      typeof entry.name !== 'string' ||
      typeof entry.declaration !== 'string' ||
      typeof entry.fixture !== 'string' ||
      typeof entry.sha256 !== 'string' ||
      !/^[\da-f]{64}$/.test(entry.sha256)
    ) {
      throw new Error('Invalid document history entry.');
    }

    const key = `${entry.type}@${entry.version}`;

    if (entries.has(key)) {
      throw new Error(`Duplicate history entry ${key}.`);
    }

    entries.set(key, entry as HistoryEntry);
  }

  return entries;
};

export const verifyDocumentHistory = (before: unknown, after: unknown, read: (path: string) => string): string[] => {
  const previous = historyEntries(before);
  const current = historyEntries(after);
  const failures: string[] = [];

  for (const [key, entry] of previous) {
    const now = current.get(key);

    if (now?.sha256 !== entry.sha256 || now.name !== entry.name || now.declaration !== entry.declaration || now.fixture !== entry.fixture) {
      failures.push(`${key}: a locked version was removed, moved, or rehashed. Add a new version instead.`);
    }
  }

  for (const [key, entry] of current) {
    try {
      const hash = documentVersionHash(read(entry.declaration), entry.name, read(entry.fixture));

      if (hash !== entry.sha256) {
        failures.push(`${key}: declaration or fixture changed (computed ${hash}).`);
      }
    } catch (error) {
      failures.push(`${key}: ${(error as Error).message}`);
    }
  }

  return failures;
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, '..');

  const read = (file: string): string => {
    const path = resolve(root, file);
    const inside = relative(root, path);

    if (isAbsolute(file) || isAbsolute(inside) || /^\.\.(?:[/\\]|$)/.test(inside)) {
      throw new Error(`Expected a repository-relative path: ${file}`);
    }

    return readFileSync(path, 'utf8');
  };

  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const ref = process.argv[2] ?? process.env.EXOJS_DOCUMENT_HISTORY_BASE;
  const base =
    ref === undefined
      ? git('merge-base', 'HEAD', 'origin/next').trim()
      : git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
  const previous =
    git('ls-tree', '--name-only', base, '--', lockPath).trim() === '' ? [] : (JSON.parse(git('show', `${base}:${lockPath}`)) as unknown);
  const failures = verifyDocumentHistory(previous, JSON.parse(read(lockPath)) as unknown, read);

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
