/**
 * Assembles the module-shaped code blocks of one guide page into a single
 * TypeScript module, so a snippet can be checked against what the page already
 * established rather than only against itself.
 *
 * A guide chapter narrates one running example down the page: block 1 loads a
 * map, block 4 reads `map.tilesetTextures`, block 9 converts it. Checked one
 * file per block, everything after the first is a wall of "Cannot find name
 * 'map'" - which is why so many of them ended up tagged `no-check` instead.
 * Concatenated in page order, they read exactly as the page reads them, and the
 * member accesses that carry the actual drift risk (a renamed property, a
 * changed signature) are checked against the real type the earlier block
 * produced.
 *
 * Three things have to be reconciled to make that concatenation legal:
 *
 *  - **Imports.** Every block repeats the imports it needs. They are collected
 *    per module specifier and emitted once, so a name imported by four blocks
 *    is not four duplicate bindings.
 *
 *  - **Re-declarations.** A page re-establishes its working values constantly
 *    (`const tileMap = map.toTileMap();` opens five separate blocks of the
 *    Tiled guide). An identical re-declaration is dropped - it is the same
 *    statement, and the reader is meant to read it as the same value. A
 *    DIFFERENT declaration under a name already taken is renamed within its own
 *    block instead, because it is a different value that happens to share a
 *    name, and silently dropping it would check the block against the wrong
 *    type.
 *
 *  - **Values the prose owns.** `loader`, `app` and friends are introduced in
 *    prose and never declared in any block. They are declared with their REAL
 *    engine types rather than `any`: a page that opens with
 *    `const map = await loader.load(...)` would otherwise spend the rest of its
 *    length reading members off `any`, which type-checks whatever the guide
 *    claims. Every other unresolved name stays a hard error, because that is
 *    the typo/staleness signal this gate exists for.
 *
 * A block that does not parse as a module (an object literal shown on its own,
 * a fragment cut mid-expression) is rejected here and stays a `partial` block
 * for the caller to count.
 */
import ts from 'typescript';

export interface PageBlock {
  /** Block body as written in the MDX fence. */
  readonly body: string;
  /** Index of the fence within the page, for the marker comment. */
  readonly index: number;
}

interface ModuleImport {
  readonly defaults: Set<string>;
  readonly namespaces: Set<string>;
  /** Local binding name -> specifier text as written (`Foo`, `Foo as Bar`, `type Foo`). */
  readonly named: Map<string, string>;
  sideEffectOnly: boolean;
}

interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const parse = (body: string): ts.SourceFile => ts.createSourceFile('block.ts', body, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

/** Parse diagnostics are not on the public SourceFile type, but they are the only way to reject a fragment without re-parsing it. */
const parseDiagnostics = (file: ts.SourceFile): readonly ts.Diagnostic[] =>
  (file as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];

/** True when the body stands on its own as a module - the precondition for joining the page module at all. */
export const parsesAsModule = (body: string): boolean => parseDiagnostics(parse(body)).length === 0;

const bindingNames = (name: ts.BindingName, into: Set<string>): void => {
  if (ts.isIdentifier(name)) {
    into.add(name.text);

    return;
  }

  for (const element of name.elements) {
    if (ts.isBindingElement(element)) bindingNames(element.name, into);
  }
};

/** Names a top-level statement introduces into module scope; empty for anything that declares nothing. */
const declaredNames = (statement: ts.Statement): Set<string> => {
  const names = new Set<string>();

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) bindingNames(declaration.name, names);
  } else if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    names.add(statement.name.text);
  }

  return names;
};

const collectImport = (imports: Map<string, ModuleImport>, declaration: ts.ImportDeclaration): void => {
  if (!ts.isStringLiteral(declaration.moduleSpecifier)) return;

  const specifier = declaration.moduleSpecifier.text;
  const entry = imports.get(specifier) ?? { defaults: new Set(), namespaces: new Set(), named: new Map(), sideEffectOnly: false };

  imports.set(specifier, entry);

  const clause = declaration.importClause;

  if (clause === undefined) {
    entry.sideEffectOnly = true;

    return;
  }

  if (clause.name !== undefined) entry.defaults.add(clause.name.text);

  const bindings = clause.namedBindings;

  if (bindings === undefined) return;

  if (ts.isNamespaceImport(bindings)) {
    entry.namespaces.add(bindings.name.text);

    return;
  }

  for (const element of bindings.elements) {
    const typePrefix = clause.isTypeOnly || element.isTypeOnly ? 'type ' : '';
    const written = element.propertyName === undefined ? element.name.text : `${element.propertyName.text} as ${element.name.text}`;

    // First writing wins: a name imported as a value anywhere on the page must
    // stay a value binding, or a later `import type` would erase it.
    if (!entry.named.has(element.name.text) || typePrefix === '') entry.named.set(element.name.text, `${typePrefix}${written}`);
  }
};

const renderImports = (imports: Map<string, ModuleImport>): string[] => {
  const lines: string[] = [];

  for (const [specifier, entry] of imports) {
    for (const namespace of entry.namespaces) lines.push(`import * as ${namespace} from '${specifier}';`);

    const head = [...entry.defaults].join(', ');
    const named = [...entry.named.values()];

    if (head.length > 0 || named.length > 0) {
      const clause = [head, named.length > 0 ? `{ ${named.join(', ')} }` : ''].filter(part => part.length > 0).join(', ');

      lines.push(`import ${clause} from '${specifier}';`);
    } else if (entry.sideEffectOnly && entry.namespaces.size === 0) {
      lines.push(`import '${specifier}';`);
    }
  }

  return lines;
};

/**
 * Rename edits for one statement, positioned relative to that statement's own
 * text so the edits of different statements can never overlap.
 *
 * A member name is left alone. A binding or property that would silently change
 * which property it reads (object shorthand, a destructuring element written
 * without an explicit property name) is expanded to `property: renamed`.
 */
const renameEditsIn = (statement: ts.Statement, file: ts.SourceFile, renames: ReadonlyMap<string, string>, offset: number): TextEdit[] => {
  const edits: TextEdit[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const replacement = renames.get(node.text);

      if (replacement !== undefined) {
        const parent = node.parent as ts.Node | undefined;
        const start = node.getStart(file) - offset;
        const end = node.getEnd() - offset;

        const isMemberName =
          parent !== undefined &&
          ((ts.isPropertyAccessExpression(parent) && parent.name === node) ||
            (ts.isPropertyAssignment(parent) && parent.name === node) ||
            (ts.isPropertySignature(parent) && parent.name === node) ||
            (ts.isPropertyDeclaration(parent) && parent.name === node) ||
            (ts.isMethodDeclaration(parent) && parent.name === node) ||
            (ts.isBindingElement(parent) && parent.propertyName === node) ||
            (ts.isQualifiedName(parent) && parent.right === node));

        const isImplicitProperty =
          parent !== undefined &&
          ((ts.isShorthandPropertyAssignment(parent) && parent.name === node) ||
            (ts.isBindingElement(parent) && parent.name === node && parent.propertyName === undefined && ts.isObjectBindingPattern(parent.parent)));

        if (isImplicitProperty) {
          edits.push({ start, end, text: `${node.text}: ${replacement}` });
        } else if (!isMemberName) {
          edits.push({ start, end, text: replacement });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(statement);

  return edits;
};

const applyEdits = (text: string, edits: readonly TextEdit[]): string => {
  let result = text;

  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }

  return result;
};

/** Comparable form of a declaration, so a re-declaration written with different spacing still counts as the same statement. */
const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

export interface PageModule {
  /** Assembled module source, ready to be written next to the other snippet files. */
  readonly source: string;
  /** Indices of the blocks that made it in. */
  readonly accepted: readonly number[];
  /** Indices of the blocks rejected because they do not stand on their own as a module. */
  readonly rejected: readonly number[];
}

/**
 * Builds the page module. `contextVars` are the names the guide convention lets
 * a page use without ever declaring - they are declared `any` when a page reads
 * one it never introduced.
 */
export const buildPageModule = (blocks: readonly PageBlock[], contextVars: Readonly<Record<string, string>>): PageModule => {
  const imports = new Map<string, ModuleImport>();
  const declarations = new Map<string, string>();
  const bodies: string[] = [];
  const accepted: number[] = [];
  const rejected: number[] = [];
  let defaultExports = 0;

  for (const block of blocks) {
    const file = parse(block.body);

    if (parseDiagnostics(file).length > 0) {
      rejected.push(block.index);

      continue;
    }

    accepted.push(block.index);

    const renames = new Map<string, string>();
    const dropped = new Set<ts.Statement>();
    const rewrittenDefaults = new Map<ts.Statement, string>();
    const taken = new Set(declarations.keys());

    // First pass decides what happens to each statement; the second applies it.
    // Splitting them is what keeps a rename inside a statement from colliding
    // with the removal of that same statement.
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement)) {
        collectImport(imports, statement);
        dropped.add(statement);

        continue;
      }

      // A module has one default export, and a page can show several files.
      // Later ones become ordinary declarations so the block is still checked.
      if (ts.isExportAssignment(statement) && statement.isExportEquals !== true) {
        defaultExports += 1;

        if (defaultExports > 1) rewrittenDefaults.set(statement, `const pageDefault${defaultExports} = `);

        continue;
      }

      const names = declaredNames(statement);

      if (names.size === 0) continue;

      const text = normalize(statement.getText(file));
      const clashing = [...names].filter(name => taken.has(name));

      if (clashing.length === 0) {
        for (const name of names) declarations.set(name, text);

        continue;
      }

      // The same statement written again: the page is restating a value it
      // already established, and the reader is meant to read it as that value.
      if (clashing.length === names.size && [...names].every(name => declarations.get(name) === text)) {
        dropped.add(statement);

        continue;
      }

      for (const name of names) {
        if (!taken.has(name)) {
          declarations.set(name, text);

          continue;
        }

        let suffix = 2;

        while (declarations.has(`${name}_${suffix}`)) suffix += 1;

        const replacement = `${name}_${suffix}`;

        declarations.set(replacement, text);
        renames.set(name, replacement);
      }
    }

    const parts: string[] = [];

    for (const statement of file.statements) {
      if (dropped.has(statement)) continue;

      const start = statement.getFullStart();
      const text = file.text.slice(start, statement.getEnd());
      const edits = renameEditsIn(statement, file, renames, start);
      const defaultPrefix = rewrittenDefaults.get(statement);

      if (defaultPrefix !== undefined) {
        const expression = (statement as ts.ExportAssignment).expression;

        edits.push({ start: statement.getStart(file) - start, end: expression.getStart(file) - start, text: defaultPrefix });
      }

      parts.push(applyEdits(text, edits));
    }

    const body = parts.join('\n').trim();

    if (body.length > 0) bodies.push(`// block ${block.index}\n${body}`);
  }

  const importLines = renderImports(imports);
  const imported = [...imports.values()].flatMap(entry => [...entry.defaults, ...entry.namespaces, ...entry.named.keys()]);
  const known = new Set([...declarations.keys(), ...imported]);
  const used = bodies.join('\n');
  const ambient = Object.entries(contextVars)
    .filter(([name]) => !known.has(name) && new RegExp(`(?<![.\\w$])${name}(?![\\w$])`).test(used))
    .map(([name, type]) => `declare const ${name}: ${type};`);

  // A page whose blocks import nothing is still a module: top-level `await` is
  // legal only in one, and several pages open with an awaited load.
  const moduleMarker = importLines.length === 0 ? ['export {};'] : [];
  const sections = [importLines.join('\n'), ambient.join('\n'), used, ...moduleMarker].filter(section => section.length > 0);

  return { source: `${sections.join('\n\n')}\n`, accepted, rejected };
};
