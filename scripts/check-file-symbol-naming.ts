/**
 * Keeps a source file's name and its public surface describing the same thing.
 *
 * Two spellings are allowed under `src/`, and the choice between them carries
 * information a reader relies on before opening anything:
 *
 * - **PascalCase** promises the file has one primary exported symbol and is
 *   named after it - a class, an interface, a type alias, an enum, or a const
 *   namespace object. `Sprite.ts` exports `Sprite`.
 * - **camelCase** promises the opposite: a module that is a set of functions,
 *   constants or a family of related declarations with no single symbol worth
 *   naming the file after. `pixelSnap.ts`, `cachePolicies.ts`.
 *
 * ESLint's `unicorn/filename-case` decides that a name is one of the two
 * spellings. It cannot decide whether the file earned that spelling, because
 * that depends on what the file exports - which is what this gate reads.
 *
 * Both directions are checked. A PascalCase file that exports no symbol of its
 * own name sends readers looking for something that is not there. A camelCase
 * file whose entire public surface is a single class hides that class from
 * anyone scanning the directory listing for it.
 *
 * A file is parsed with the TypeScript compiler rather than matched with a
 * regular expression, so a name in a comment, a string or a local declaration
 * is never mistaken for an export.
 *
 * Run over `src/` by default; pass explicit paths to check a subset.
 */
import { readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

import ts from 'typescript';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const SCAN_ROOTS = ['src'];

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage']);

/** `__name__` marks a directory a suite creates and removes; it holds no authored source. */
const isTransientDirectory = (name: string): boolean => name.startsWith('__') && name.endsWith('__');

/**
 * Names that describe a module's role rather than a symbol, so neither
 * direction of the rule applies to them.
 */
const ROLE_FILENAMES = new Set(['index', 'types', 'utils', 'public']);

/**
 * Files whose name cannot follow from their exports, with the reason each one
 * is exempt. An entry is a claim that the mismatch is the correct outcome.
 */
const ALLOWED: readonly { readonly file: string; readonly reason: string }[] = [
  {
    file: 'src/assets/Asset.ts',
    reason: 'the public `Asset` value and interface are declaration-merged here; the class behind them is `AssetImpl` on purpose',
  },
  {
    file: 'src/assets/Assets.ts',
    reason: 'same facade shape as `Asset.ts`: the public `Assets` value is `AssetsImpl` retyped, and the class stays unexported',
  },
  {
    file: 'src/renderer-sdk.ts',
    reason: 'the file name is the published `@codexo/exojs/renderer-sdk` subpath, so it names an entry point rather than a symbol',
  },
];

if (ALLOWED.some(entry => entry.reason.trim() === '')) {
  throw new Error('check-file-symbol-naming: every allowlist entry needs a reason.');
}

const isAllowed = (file: string): boolean => ALLOWED.some(entry => entry.file === file);

const isPascalCase = (name: string): boolean => /^[A-Z]/u.test(name);

interface Surface {
  /** Every exported name, whatever kind it is. */
  readonly exported: ReadonlySet<string>;
  /** Exported class declarations, in source order. */
  readonly classes: readonly string[];
  /** Exported values that are not classes - a const, a function, an enum. */
  readonly otherValues: readonly string[];
}

const readSurface = (absolutePath: string): Surface => {
  const source = ts.createSourceFile(absolutePath, readFileSync(absolutePath, 'utf8'), ts.ScriptTarget.Latest, true);

  const exported = new Set<string>();
  const classes: string[] = [];
  const otherValues: string[] = [];

  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);

  for (const statement of source.statements) {
    if (ts.isClassDeclaration(statement) && statement.name && isExported(statement)) {
      exported.add(statement.name.text);
      classes.push(statement.name.text);
    } else if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && isExported(statement)) {
      exported.add(statement.name.text);
    } else if (ts.isEnumDeclaration(statement) && isExported(statement)) {
      exported.add(statement.name.text);
      otherValues.push(statement.name.text);
    } else if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      exported.add(statement.name.text);
      otherValues.push(statement.name.text);
    } else if (ts.isModuleDeclaration(statement) && isExported(statement) && ts.isIdentifier(statement.name)) {
      exported.add(statement.name.text);
      otherValues.push(statement.name.text);
    } else if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          exported.add(declaration.name.text);
          otherValues.push(declaration.name.text);
        }
      }
    }
  }

  return { classes, exported, otherValues };
};

interface Violation {
  readonly file: string;
  readonly message: string;
}

const checkFile = (file: string): Violation[] => {
  if (isAllowed(file)) return [];

  const stem = basename(file, '.ts');

  if (ROLE_FILENAMES.has(stem) || stem.endsWith('.d')) return [];

  const surface = readSurface(join(REPO_ROOT, file));

  if (isPascalCase(stem)) {
    if (surface.exported.has(stem)) return [];

    const nearest = surface.classes[0] ?? surface.otherValues[0];

    return [
      {
        file,
        message: nearest
          ? `exports no '${stem}' - rename the file to '${nearest}.ts', or rename the symbol`
          : `exports no '${stem}' - a file with no symbol of its own name belongs in camelCase`,
      },
    ];
  }

  // A family of related classes is what camelCase is FOR (`cachePolicies.ts`),
  // so only a lone class with nothing else public is reported: there the file
  // name and the one thing it offers should agree.
  if (surface.classes.length === 1 && surface.otherValues.length === 0) {
    return [{ file, message: `exports only the class '${surface.classes[0]}' - name the file '${surface.classes[0]}.ts'` }];
  }

  return [];
};

const collectFiles = async (root: string): Promise<string[]> => {
  const absolute = join(REPO_ROOT, root);

  if (statSync(absolute, { throwIfNoEntry: false })?.isFile()) return [relative(REPO_ROOT, absolute).replaceAll('\\', '/')];

  // The tree is live: a suite running in parallel can remove a directory
  // between this walk reaching it and reading it. Nothing to check is the
  // correct answer there, not a failed gate.
  const entries = await readdir(absolute, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];

    throw error;
  });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.isDirectory()) {
        return SKIPPED_DIRECTORIES.has(entry.name) || isTransientDirectory(entry.name) ? [] : collectFiles(join(root, entry.name));
      }

      return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [join(root, entry.name).replaceAll('\\', '/')] : [];
    }),
  );

  return files.flat();
};

const main = async (): Promise<void> => {
  const requested = process.argv.slice(2);
  const roots = requested.length > 0 ? requested : SCAN_ROOTS;

  console.log(`Checking file names against their exports (${roots.join(', ')})...\n`);

  const files = (await Promise.all(roots.map(collectFiles))).flat();
  const violations = files.flatMap(checkFile);

  if (violations.length > 0) {
    console.error(`\x1b[31m${violations.length} file(s) named against their exports:\x1b[0m`);

    for (const violation of violations) {
      console.error(`  ${violation.file}  ${violation.message}`);
    }

    console.error('\nA PascalCase file is named after the one symbol it exports; a camelCase file has no such symbol.');
    process.exit(1);
  }

  console.log(`\x1b[32m${files.length} file(s) checked, every name matches its exports.\x1b[0m`);
};

await main();
