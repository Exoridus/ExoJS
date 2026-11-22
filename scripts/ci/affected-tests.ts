import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import type { DevEnvironment, EnvironmentModuleNode } from 'vite';
import type { TestProject, TestSpecification, Vitest } from 'vitest/node';

export interface AffectedTestReason {
  readonly kind: 'dependency' | 'untracked' | 'full' | 'changed-test' | 'setup';
  readonly change?: string;
  readonly path?: string[];
  readonly detail: string;
}

export interface AffectedTestSelection {
  readonly version: 1;
  readonly changedFiles: string[];
  readonly mode: 'related' | 'full';
  readonly fallbackReasons: string[];
  readonly tests: Array<{ project: string; file: string; reasons: AffectedTestReason[] }>;
  readonly inventory: Array<{ project: string; file: string }>;
  readonly durationMs: number;
}

const CODE = /\.[cm]?[jt]sx?$/;
const MODULE = /\.(?:[cm]?[jt]sx?|json|vert|frag|glsl|wgsl)$/;
const CONTENT = /\.mdx?$|(?:^|\/)LICENSE$/;
const CONTENT_QUERY = /[?&](?:raw|url)(?:[=&]|$)/;
const GLOBAL =
  /(?:^|\/)(?:package\.json|[^/]*lock[^/]*\.(?:json|ya?ml)|tsconfig[^/]*\.json|[^/]*\.config\.[^/]+)$|^(?:scripts|\.github)\/(?!.*\.mdx?$)|^packages\/exojs-(?:build|config)\/|^packages\/exojs-cli\/src\/commands\/assetsPack\.ts$|(?:^|\/)(?:dist|generated)\//;
const SOURCE_TREE = /^(?:src|test|examples)\/|^packages\/[^/]+\/(?:src|test)\/|^site\/src\//;
const VITEST_ROOT = realpathSync(fileURLToPath(new URL('../', import.meta.resolve('vitest'))));
const STARTUP_WATCH_FILES = new WeakMap<DevEnvironment, Promise<readonly string[]>>();

const portable = (file: string): string => file.split(sep).join('/');
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const uniquePath = (path: string[]): string[] => path.filter((file, index) => index === 0 || file !== path[index - 1]);
const harnessImport = (specifier: string): boolean => specifier === 'vitest' || specifier.startsWith('vitest/');

const memberName = (node: ts.Node): string | undefined => {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }

  if (
    ts.isElementAccessExpression(node) &&
    (ts.isStringLiteralLike(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression))
  ) {
    return node.argumentExpression.text;
  }

  return undefined;
};

// These value grammars cannot contain external resources, even when supplied
// dynamically. Keep unknown properties, custom properties and whole styles
// conservative; a value such as var(--image) can otherwise hide a URL.
const CSS_VALUE_ONLY = new Set(['color', 'imagerendering', 'touchaction', 'width', 'height']);
const DOM_ASSET_PROPERTIES = new Set(['src', 'srcset', 'href', 'poster', 'innerhtml', 'outerhtml']);
const CSS_ASSET_PROPERTIES = new Set([
  'backgroundimage',
  'borderimage',
  'borderimagesource',
  'liststyleimage',
  'maskimage',
  'csstext',
  'style',
]);
const HARNESS_READERS = new Set(['importActual', 'importMock', 'toMatchFileSnapshot']);

const cssCanLoad = (value: ts.Expression | undefined, property?: string): boolean => {
  if (property && !property.startsWith('--') && CSS_VALUE_ONLY.has(property.replaceAll('-', '').toLowerCase())) {
    return false;
  }

  return !value || !ts.isStringLiteralLike(value) || /(?:url|(?:-webkit-)?image-set)\s*\(|@import/i.test(value.text);
};

const propertyCanLoad = (property: string | undefined, value: ts.Expression | undefined, style: boolean): boolean =>
  property === undefined ||
  DOM_ASSET_PROPERTIES.has(property.toLowerCase()) ||
  ((style || CSS_ASSET_PROPERTIES.has(property.toLowerCase())) && cssCanLoad(value, property));

const assignedPropertiesCanLoad = (argument: ts.Expression, style: boolean): boolean =>
  !ts.isObjectLiteralExpression(argument) ||
  argument.properties.some(property => {
    if (ts.isSpreadAssignment(property)) {
      return true;
    }

    const name = ts.isComputedPropertyName(property.name) ? property.name.expression : property.name;
    const literal = ts.isIdentifier(property.name)
      ? property.name.text
      : ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)
        ? name.text
        : undefined;

    return propertyCanLoad(literal, ts.isPropertyAssignment(property) ? property.initializer : undefined, style);
  });

interface SourceInputs {
  readonly hazards: string[];
  readonly imports: string[];
}

/** Local type facts only; module and library resolution remain entirely outside this proof. */
const nonAssetIndexCheck = (source: ts.SourceFile): ((expression: ts.Expression, literal: (key: string) => boolean) => boolean) => {
  const options: ts.CompilerOptions = { noResolve: true, noLib: true, noEmit: true, allowJs: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);

  const canonical = (name: string): string => {
    const normalized = name.replaceAll('\\', '/');

    return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
  };

  host.getCanonicalFileName = canonical;
  host.getSourceFile = name => (canonical(name) === canonical(source.fileName) ? source : undefined);
  host.fileExists = name => canonical(name) === canonical(source.fileName);
  host.readFile = () => undefined;
  const checker = ts.createProgram([source.fileName], options, host).getTypeChecker();
  const writes = new Map<ts.Symbol, Array<ts.Expression | undefined>>();
  const iterations = new Map<ts.Symbol, ts.Expression>();
  let opaquePropertyWrites = false;

  const recordWrite = (target: ts.Node, value?: ts.Expression): void => {
    if (ts.isIdentifier(target) || ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
      const property = memberName(target);
      const symbol =
        target.parent && ts.isShorthandPropertyAssignment(target.parent)
          ? checker.getShorthandAssignmentValueSymbol(target.parent)
          : ts.isElementAccessExpression(target) && property !== undefined
            ? checker.getPropertyOfType(checker.getTypeAtLocation(target.expression), property)
            : checker.getSymbolAtLocation(target);

      if (symbol) {
        const values = writes.get(symbol) ?? [];
        values.push(value);
        writes.set(symbol, values);
      }
    } else {
      ts.forEachChild(target, child => recordWrite(child));
    }
  };

  const scan = (node: ts.Node): void => {
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      ['Object', 'Reflect'].includes(node.expression.text) &&
      ['assign', 'defineProperty', 'defineProperties', 'set'].includes(memberName(node) ?? '')
    ) {
      opaquePropertyWrites = true;
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      ['Object', 'Reflect'].includes(node.initializer.text)
    ) {
      opaquePropertyWrites = true;
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      recordWrite(node.left, node.right);
    } else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      if (!ts.isVariableDeclarationList(node.initializer)) {
        recordWrite(node.initializer);
      } else if (ts.isForOfStatement(node)) {
        for (const declaration of node.initializer.declarations) {
          const symbol = ts.isIdentifier(declaration.name) ? checker.getSymbolAtLocation(declaration.name) : undefined;

          if (symbol) {
            iterations.set(symbol, node.expression);
          }
        }
      }
    }

    ts.forEachChild(node, scan);
  };

  scan(source);
  const safeType = (type: ts.Type, literal: (key: string) => boolean): boolean =>
    type.isUnion()
      ? type.types.every(member => safeType(member, literal))
      : (type.flags & ts.TypeFlags.NumberLike) !== 0 || (type.isStringLiteral() && literal(type.value));
  const visiting = new Set<ts.Symbol>();

  const prove = (expression: ts.Expression, known: ReadonlySet<ts.Symbol>, literal: (key: string) => boolean): boolean => {
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) ||
      ts.isNonNullExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    ) {
      return prove(expression.expression, known, literal);
    }

    const symbol =
      ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression) ? checker.getSymbolAtLocation(expression) : undefined;
    let iterable = symbol ? iterations.get(symbol) : undefined;

    while (iterable && (ts.isAsExpression(iterable) || ts.isTypeAssertionExpression(iterable) || ts.isParenthesizedExpression(iterable))) {
      iterable = iterable.expression;
    }

    if (symbol && iterable) {
      return (
        ts.isArrayLiteralExpression(iterable) &&
        iterable.elements.every(element => !ts.isSpreadElement(element) && prove(element, known, literal)) &&
        (writes.get(symbol) ?? []).every(value => value !== undefined && prove(value, new Set([...known, symbol]), literal))
      );
    }

    if (!safeType(checker.getTypeAtLocation(expression), literal)) {
      return false;
    }

    if (
      ts.isNumericLiteral(expression) ||
      ts.isStringLiteralLike(expression) ||
      ts.isPrefixUnaryExpression(expression) ||
      ts.isPostfixUnaryExpression(expression)
    ) {
      return true;
    }

    if (ts.isBinaryExpression(expression)) {
      if (expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        return prove(expression.left, known, literal) && prove(expression.right, known, literal);
      }

      return [
        ts.SyntaxKind.MinusToken,
        ts.SyntaxKind.AsteriskToken,
        ts.SyntaxKind.SlashToken,
        ts.SyntaxKind.PercentToken,
        ts.SyntaxKind.AsteriskAsteriskToken,
        ts.SyntaxKind.LessThanLessThanToken,
        ts.SyntaxKind.GreaterThanGreaterThanToken,
        ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
        ts.SyntaxKind.AmpersandToken,
        ts.SyntaxKind.BarToken,
        ts.SyntaxKind.CaretToken,
      ].includes(expression.operatorToken.kind);
    }

    if (ts.isConditionalExpression(expression)) {
      return prove(expression.whenTrue, known, literal) && prove(expression.whenFalse, known, literal);
    }

    if (
      !ts.isIdentifier(expression) &&
      !(ts.isPropertyAccessExpression(expression) && expression.expression.kind === ts.SyntaxKind.ThisKeyword)
    ) {
      return false;
    }

    const declaration = symbol?.valueDeclaration;

    if (
      !symbol ||
      !declaration ||
      (!ts.isVariableDeclaration(declaration) && !ts.isParameter(declaration) && !ts.isPropertyDeclaration(declaration))
    ) {
      return false;
    }

    if (known.has(symbol)) {
      return true;
    }

    if (visiting.has(symbol)) {
      return false;
    }

    if (ts.isPropertyDeclaration(declaration) && opaquePropertyWrites) {
      return false;
    }

    visiting.add(symbol);

    try {
      if (
        !safeType(checker.getTypeAtLocation(declaration.name), literal) ||
        (declaration.initializer ? !prove(declaration.initializer, known, literal) : !ts.isParameter(declaration))
      ) {
        return false;
      }

      const next = new Set([...known, symbol]);

      return (writes.get(symbol) ?? []).every(value => value !== undefined && prove(value, next, literal));
    } finally {
      visiting.delete(symbol);
    }
  };

  return (expression, literal) => prove(expression, new Set(), literal);
};

/** Inspect possible hidden inputs, leaving all module resolution to Vite. */
const sourceInputs = (file: string): SourceInputs => {
  if (!CODE.test(file)) {
    // CSS URL reads and custom loaders can disappear from the SSR graph. Only
    // the repository's data-only JSON/shader formats are safe without code inspection.
    return {
      hazards: MODULE.test(file) ? [] : ['A non-code module can load inputs outside the SSR dependency graph.'],
      imports: [],
    };
  }

  const source = ts.createSourceFile(portable(file), readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const hazards = new Set<string>();
  const imports = new Set<string>();
  let nonAssetIndex: ReturnType<typeof nonAssetIndexCheck> | undefined;

  const module = (specifier: string, commands = false): void => {
    imports.add(specifier);

    if (/^(?:node:)?(?:fs(?:\/|$)|child_process$|module$)/.test(specifier)) {
      hazards.add(`Reads files or resolves runtime inputs through ${specifier}.`);
    }

    if (specifier === 'vitest/browser' && commands) {
      // Browser commands execute Node callbacks registered by configuration.
      // Their filesystem inputs cannot be inferred from the browser graph.
      hazards.add('Browser commands may read Node-side inputs outside the browser module graph.');
    }
  };

  const visit = (node: ts.Node, parent?: ts.Node): void => {
    if (
      ts.isTypeNode(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
      ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node) || ts.isExportDeclaration(node)) && node.isTypeOnly)
    ) {
      return;
    }

    // Blob URL creation/revocation and installing their test doubles do not
    // load repository inputs. Other uses, including a constructor alias, do.
    const blobURL =
      ts.isIdentifier(node) &&
      node.text === 'URL' &&
      parent &&
      ((ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        ['createObjectURL', 'revokeObjectURL'].includes(parent.name.text)) ||
        (ts.isCallExpression(parent) &&
          parent.expression.getText(source) === 'Object.defineProperty' &&
          parent.arguments[0] === node &&
          parent.arguments[1] &&
          ts.isStringLiteral(parent.arguments[1]) &&
          ['createObjectURL', 'revokeObjectURL'].includes(parent.arguments[1].text)));

    if (
      ts.isIdentifier(node) &&
      !blobURL &&
      [
        'fetch',
        'require',
        'eval',
        'Function',
        'URL',
        'Worker',
        'SharedWorker',
        'XMLHttpRequest',
        'WebSocket',
        'EventSource',
        'Image',
        'Audio',
      ].includes(node.text)
    ) {
      hazards.add(`May read dynamic input through ${node.text}, including an alias.`);
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['globalThis', 'window', 'process'].includes(node.expression.text)
    ) {
      hazards.add(`A computed ${node.expression.text} member can provide a hidden input reader.`);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
    ) {
      const property = memberName(node.left);
      const style = memberName(node.left.expression) === 'style';
      const safeIndex =
        property === undefined &&
        ts.isElementAccessExpression(node.left) &&
        (nonAssetIndex ??= nonAssetIndexCheck(source))(node.left.argumentExpression, key => !propertyCanLoad(key, node.right, style));

      if (!safeIndex && propertyCanLoad(property, node.right, style)) {
        hazards.add(`A DOM or CSS ${property ?? 'computed property'} assignment can load an asset outside the import graph.`);
      }
    }

    const method = memberName(node);

    if ((ts.isIdentifier(node) && HARNESS_READERS.has(node.text)) || (method && HARNESS_READERS.has(method))) {
      hazards.add('A Vitest runtime import or file snapshot can read inputs outside the static module graph.');
    }

    if (
      method === 'assign' &&
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Object'
    ) {
      const call = parent && ts.isCallExpression(parent) && parent.expression === node ? parent : undefined;
      const style = Boolean(call?.arguments[0] && memberName(call.arguments[0]) === 'style');

      if (!call || call.arguments.slice(1).some(argument => assignedPropertiesCanLoad(argument, style))) {
        hazards.add('Object.assign can install DOM or CSS asset properties, including unknown sources or aliases.');
      }
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === 'Object' &&
      node.name.elements.some(binding => (binding.propertyName ?? binding.name).getText(source) === 'assign')
    ) {
      hazards.add('A destructured Object.assign can install DOM or CSS asset properties.');
    }

    if (
      method &&
      ['setAttribute', 'setAttributeNS', 'setProperty', 'insertRule', 'addRule', 'replaceSync', 'insertAdjacentHTML'].includes(method)
    ) {
      const call = parent && ts.isCallExpression(parent) && parent.expression === node ? parent : undefined;
      let reads = true;

      if (call && (method === 'setAttribute' || method === 'setAttributeNS')) {
        const offset = method === 'setAttributeNS' ? 1 : 0;
        const attribute = call.arguments[offset];

        if (attribute && ts.isStringLiteralLike(attribute)) {
          const name = attribute.text.toLowerCase();
          reads = [
            'src',
            'srcset',
            'href',
            'xlink:href',
            'poster',
            'data',
            'background',
            'style',
            'fill',
            'stroke',
            'filter',
            'cursor',
          ].includes(name);

          if (name === 'style') {
            reads = cssCanLoad(call.arguments[offset + 1]);
          }
        }
      } else if (call && ['setProperty', 'insertRule', 'addRule', 'replaceSync'].includes(method)) {
        const property =
          method === 'setProperty' &&
          (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
          memberName(node.expression) === 'style' &&
          call.arguments[0] &&
          ts.isStringLiteralLike(call.arguments[0])
            ? call.arguments[0].text
            : undefined;
        reads = cssCanLoad(call.arguments[method === 'setProperty' || method === 'addRule' ? 1 : 0], property);
      }

      if (reads) {
        hazards.add(`A DOM or CSS ${method} reader can load assets outside the import graph, including through an alias.`);
      }
    }

    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      const typesOnly =
        !node.importClause?.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every(binding => binding.isTypeOnly);

      if (!typesOnly) {
        module(
          node.moduleSpecifier.text,
          Boolean(
            node.importClause?.name ||
            (bindings &&
              (ts.isNamespaceImport(bindings) ||
                bindings.elements.some(binding => !binding.isTypeOnly && (binding.propertyName ?? binding.name).text === 'commands'))),
          ),
        );
      }
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      module(
        node.moduleSpecifier.text,
        !node.exportClause ||
          ts.isNamespaceExport(node.exportClause) ||
          node.exportClause.elements.some(binding => !binding.isTypeOnly && (binding.propertyName ?? binding.name).text === 'commands'),
      );
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];

        if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
          module(argument.text, true);
        } else {
          hazards.add('Loads a module through a nonliteral dynamic import.');
        }
      } else if (ts.isIdentifier(node.expression) && ['fetch', 'require', 'eval', 'Function'].includes(node.expression.text)) {
        hazards.add(`Reads dynamic input through ${node.expression.text}.`);
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        const expression = node.expression.getText(source);

        if (
          /^import\.meta\.(?:glob(?:Eager)?|resolve)$/.test(expression) ||
          /^process\.(?:cwd|getBuiltinModule|binding)$/.test(expression) ||
          /^(?:globalThis|window)\.(?:fetch|eval)$/.test(expression)
        ) {
          hazards.add(`Reads dynamic input through ${expression}.`);
        }
      }
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['URL', 'Worker', 'SharedWorker', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Image', 'Audio', 'Function'].includes(
        node.expression.text,
      )
    ) {
      hazards.add(`Loads an asset or dynamic code through ${node.expression.text}.`);
    }

    ts.forEachChild(node, child => visit(child, node));
  };

  visit(source);

  return { hazards: [...hazards], imports: [...imports] };
};

/**
 * Selects tests without executing them. The caller owns the fresh Vitest context.
 * Uncertain graphs return the complete inventory; an inventory failure is fatal,
 * because an empty list cannot stand in for an unknown validation scope.
 */
export const selectAffectedTests = async (context: Vitest, changedFiles: readonly string[]): Promise<AffectedTestSelection> => {
  const started = performance.now();
  const root = realpathSync(context.config.root);
  const display = (file: string): string => portable(relative(root, file));
  const specifications = await context.globTestSpecifications();

  if (specifications.length === 0) {
    throw new Error('No test inventory was discovered; affected selection cannot establish the validation scope.');
  }

  const keys = new Map<string, { project: string; file: string }>();

  for (const spec of specifications) {
    const entry = { project: spec.project.name, file: display(spec.moduleId) };
    keys.set(JSON.stringify([entry.project, entry.file]), entry);
  }

  const inventory = [...keys.values()].sort((a, b) => a.project.localeCompare(b.project) || a.file.localeCompare(b.file));
  const files = [...new Set(changedFiles)];
  const finish = (
    mode: AffectedTestSelection['mode'],
    fallbackReasons: string[],
    tests: AffectedTestSelection['tests'],
  ): AffectedTestSelection => ({
    version: 1,
    changedFiles: files,
    mode,
    fallbackReasons,
    tests,
    inventory,
    durationMs: performance.now() - started,
  });
  const full = (reasons: string[]): AffectedTestSelection =>
    finish(
      'full',
      reasons,
      inventory.map(entry => ({ ...entry, reasons: reasons.map(detail => ({ kind: 'full', detail })) })),
    );
  const changed = new Map<string, string>();
  const fallbackReasons: string[] = [];

  if (files.length === 0) {
    fallbackReasons.push('The changed-file inventory is empty; the affected scope is unknown.');
  }

  for (const file of files) {
    const absolute = resolve(root, file);

    if (isAbsolute(file) || display(absolute) !== file || file.includes('\0')) {
      fallbackReasons.push(`The path is not an exact repository-relative file: ${file}`);
      continue;
    }

    try {
      if (!statSync(absolute).isFile()) {
        throw new Error('not a regular file');
      }

      const canonical = realpathSync(absolute);

      if (display(canonical).startsWith('../') || isAbsolute(display(canonical))) {
        fallbackReasons.push(`The input resolves outside the repository: ${file}`);
      } else if (GLOBAL.test(file) || (!SOURCE_TREE.test(file) && !CONTENT.test(file))) {
        fallbackReasons.push(`Global, generated or unclassified input requires the complete inventory: ${file}`);
      } else if (/\.d\.[cm]?ts$/.test(file)) {
        fallbackReasons.push(`A declaration has no complete runtime dependency graph: ${file}`);
      } else {
        changed.set(canonical, file);
      }
    } catch {
      fallbackReasons.push(`A deleted, renamed or unreadable input cannot be resolved: ${file}`);
    }
  }

  if (fallbackReasons.length) {
    return full(fallbackReasons);
  }

  const saved = { related: context.config.related, changed: context.config.changed, triggers: context.config.forceRerunTriggers };
  const selected = new Map<string, AffectedTestSelection['tests'][number]>();
  const sourceCache = new Map<string, SourceInputs>();
  const observedFiles = new Set<string>();

  const keep = (spec: TestSpecification, reason: AffectedTestReason): void => {
    const file = display(spec.moduleId);
    const key = JSON.stringify([spec.project.name, file]);
    let entry = selected.get(key);

    if (!entry) {
      entry = { project: spec.project.name, file, reasons: [] };
      selected.set(key, entry);
    }

    if (!entry.reasons.some(existing => JSON.stringify(existing) === JSON.stringify(reason))) {
      entry.reasons.push(reason);
    }
  };

  try {
    const projects = new Map<TestProject, TestSpecification[]>();

    for (const spec of specifications) {
      const projectSpecs = projects.get(spec.project) ?? [];
      projectSpecs.push(spec);
      projects.set(spec.project, projectSpecs);
    }

    for (const project of projects.keys()) {
      for (const environment of Object.values(project.vite.environments)) {
        let startup = STARTUP_WATCH_FILES.get(environment);

        if (!startup) {
          startup = environment.pluginContainer.buildStart().then(() => [...environment.pluginContainer.watchFiles]);
          STARTUP_WATCH_FILES.set(environment, startup);
        }

        // Startup readers have no importing module to carry their watch edges.
        // Vite normally runs shared startup hooks in the client environment.
        // Reusing a context must not reclassify earlier module-owned inputs.
        for (const watched of await startup) {
          const change = changed.get(realpathSync(resolve(project.config.root, watched)));

          if (change) {
            return full([`A plugin startup watch input has no dependency owner: ${change}`]);
          }
        }
      }
    }

    // Explicit related paths bypass Vitest's newline-delimited Git parser. Its
    // discovery primes Vite; selection below also follows query and worker nodes.
    context.config.related = [...changed.keys()];
    context.config.changed = false;
    context.config.forceRerunTriggers = [];
    await context.getRelevantTestSpecifications();

    for (const [project, projectSpecs] of projects) {
      const environment = project.vite.environments.ssr;

      if (!environment) {
        throw new Error(`No SSR dependency environment for project ${project.name}.`);
      }

      const graph = environment.moduleGraph;
      const importers = new Map<EnvironmentModuleNode, Set<EnvironmentModuleNode>>();
      const testNodes = new Map<EnvironmentModuleNode, TestSpecification[]>();
      const setupNodes = new Set<EnvironmentModuleNode>();
      const byFile = new Map<string, Set<EnvironmentModuleNode>>();
      const hazards = new Map<EnvironmentModuleNode, string>();
      const queued = new Set<EnvironmentModuleNode>();
      const queue: EnvironmentModuleNode[] = [];
      const nodePath = (node: EnvironmentModuleNode): string =>
        node.file && isAbsolute(node.file) ? display(node.file) : (node.id ?? node.url).replaceAll('\0', '<virtual>');

      const enqueue = (node: EnvironmentModuleNode): void => {
        if (!queued.has(node)) {
          queued.add(node);
          queue.push(node);
        }
      };

      const edge = (dependency: EnvironmentModuleNode, importer: EnvironmentModuleNode): void => {
        const parents = importers.get(dependency) ?? new Set<EnvironmentModuleNode>();
        parents.add(importer);
        importers.set(dependency, parents);
        enqueue(dependency);
      };

      const load = async (id: string): Promise<EnvironmentModuleNode> => {
        const result = await environment.transformRequest(id);
        const node = graph.getModuleById(id) ?? (await graph.getModuleByUrl(id));

        if (!result || !node) {
          throw new Error(`Cannot transform graph input ${display(id)} in ${project.name}.`);
        }

        return node;
      };

      for (const spec of projectSpecs) {
        const node = await load(spec.moduleId);
        const owners = testNodes.get(node) ?? [];
        owners.push(spec);
        testNodes.set(node, owners);
        enqueue(node);
      }

      for (const setup of [...project.config.setupFiles, ...project.config.globalSetup]) {
        const node = await load(resolve(project.config.root, setup));
        setupNodes.add(node);
        enqueue(node);
      }

      for (const node of queue) {
        const contentOnly = CONTENT_QUERY.test(node.id ?? '');

        if (!node.file || !isAbsolute(node.file) || node.file.includes('\0')) {
          hazards.set(node, 'A virtual module can read inputs outside the filesystem graph.');
        } else {
          const canonical = realpathSync(node.file);
          const local = display(canonical);
          const external = local.startsWith('../') || isAbsolute(local) || /(?:^|\/)node_modules\//.test(local);

          if (canonical.startsWith(`${VITEST_ROOT}${sep}`)) {
            continue;
          }

          if (external) {
            hazards.set(node, `External module inputs are not inspected: ${local}`);
            continue;
          }

          observedFiles.add(canonical);
          const nodes = byFile.get(canonical) ?? new Set<EnvironmentModuleNode>();
          nodes.add(node);
          byFile.set(canonical, nodes);

          if (!node.transformResult) {
            await load(node.id ?? node.url);
          }

          let inputs: SourceInputs | undefined = contentOnly ? { hazards: [], imports: [] } : sourceCache.get(canonical);

          if (!inputs) {
            inputs = sourceInputs(canonical);
            sourceCache.set(canonical, inputs);
          }

          if (inputs.hazards.length) {
            hazards.set(node, inputs.hazards.join(' '));
          }

          for (const specifier of inputs.imports) {
            if (isBuiltin(specifier) || harnessImport(specifier)) {
              continue;
            }

            // This is a safety check through Vite's configured resolver, not a
            // parallel alias/package resolver or a source-derived dependency edge.
            const resolved = await environment.pluginContainer.resolveId(specifier, node.id ?? undefined);

            if (!resolved) {
              throw new Error(`Unresolved graph import ${specifier} from ${nodePath(node)}.`);
            }

            if (resolved.external || /(?:^|[\\/])node_modules[\\/]/.test(resolved.id)) {
              hazards.set(node, `External import may read inputs outside the graph: ${specifier}`);
            }
          }

          // Vite's worker-query wrapper does not import its worker source in
          // SSR. Use its already-resolved file, then connect that source back
          // to the wrapper; nested imports still come entirely from Vite.
          if (/[?&](?:worker|sharedworker)(?:[=&]|$)/.test(node.id ?? '')) {
            const worker = await load(node.file);
            edge(worker, node);
          }
        }

        for (const dependency of node.importedModules) {
          // Raw/URL imports expose bytes, not the source's runtime imports.
          // Their same-file watch node is already represented by this node.file.
          // A separate executable importer still enqueues the ordinary module.
          if (contentOnly && dependency.file === node.file) {
            continue;
          }

          edge(dependency, node);
        }
      }

      // Vite includes load/transform addWatchFile dependencies in importedModules.
      // Refuse a changed watch input without an attributed edge, even if another
      // project happens to import the same file normally.
      for (const watched of environment.pluginContainer.watchFiles) {
        const canonical = realpathSync(resolve(project.config.root, watched));
        const change = changed.get(canonical);
        const nodes = byFile.get(canonical);

        if (change && (!nodes || [...nodes].every(node => !importers.get(node)?.size))) {
          return full([`A plugin watch input has no resolved dependency edge: ${change}`]);
        }
      }

      const walk = (seeds: Array<{ node: EnvironmentModuleNode; reason: AffectedTestReason }>): void => {
        const pending = seeds.map(seed => ({ ...seed, path: seed.reason.path ?? [nodePath(seed.node)] }));
        const visited = new Set<EnvironmentModuleNode>();

        for (const { node, reason, path } of pending) {
          if (visited.has(node)) {
            continue;
          }

          visited.add(node);

          for (const spec of testNodes.get(node) ?? []) {
            keep(spec, { ...reason, path: uniquePath(path) });
          }

          if (setupNodes.has(node)) {
            for (const spec of projectSpecs) {
              keep(spec, {
                ...reason,
                kind: 'setup',
                path: uniquePath([...path, display(spec.moduleId)]),
                detail: `Project setup depends on this input. ${reason.detail}`,
              });
            }
          }

          for (const importer of [...(importers.get(node) ?? [])].sort((a, b) => nodePath(a).localeCompare(nodePath(b)))) {
            pending.push({ node: importer, reason, path: [...path, nodePath(importer)] });
          }
        }
      };

      for (const [canonical, change] of changed) {
        walk(
          [...(byFile.get(canonical) ?? [])].map(node => ({
            node,
            reason: {
              kind: testNodes.has(node) ? 'changed-test' : 'dependency',
              change,
              path: [change],
              detail: 'Resolved Vite imports reach this changed file.',
            },
          })),
        );
      }

      walk(
        [...hazards]
          .sort(([a], [b]) => nodePath(a).localeCompare(nodePath(b)))
          .map(([node, detail]) => ({ node, reason: { kind: 'untracked', detail } })),
      );
    }

    for (const [canonical, file] of changed) {
      if (!MODULE.test(file) && !CONTENT.test(file) && !observedFiles.has(canonical)) {
        fallbackReasons.push(`An asset or unknown module has no resolved graph identity: ${file}`);
      }
    }

    if (fallbackReasons.length) {
      return full(fallbackReasons);
    }

    return finish(
      'related',
      [],
      [...selected.values()].sort((a, b) => a.project.localeCompare(b.project) || a.file.localeCompare(b.file)),
    );
  } catch (error) {
    return full([`Dependency graph could not be proven complete: ${errorMessage(error)}`]);
  } finally {
    context.config.related = saved.related;
    context.config.changed = saved.changed;
    context.config.forceRerunTriggers = saved.triggers;
  }
};
