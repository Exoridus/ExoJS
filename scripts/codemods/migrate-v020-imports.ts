/**
 * Moves import specifiers from the seven runtime packages that ExoJS v0.20
 * folds into Core to their `@codexo/exojs/<subpath>` entries:
 *
 *   import { TileMap } from '@codexo/exojs-tilemap';           // before
 *   import { TileMap } from '@codexo/exojs/tilemap';           // after
 *   import { PhysicsDebugDraw } from '@codexo/exojs-physics/debug';
 *   import { PhysicsDebugDraw } from '@codexo/exojs/debug';
 *
 * Only module specifiers are rewritten, found by parsing each file: import and
 * export declarations, `import()`, `require()`, `declare module` names and
 * test-runner module mocks in TypeScript and JavaScript sources, and the same
 * inside fenced `ts`/`tsx`/`js`/`jsx` code blocks of Markdown and MDX files.
 * Prose, URLs, comments and every other string are left alone, and so is a
 * deep import of a retired package that has no v0.20 equivalent - those are
 * listed for a manual decision.
 *
 * Usage:
 *
 *   tsx scripts/codemods/migrate-v020-imports.ts <path>...          # rewrite in place
 *   tsx scripts/codemods/migrate-v020-imports.ts --check <path>...  # list, exit 1 if any
 *
 * A directory is walked recursively, skipping `node_modules`, `dist` and
 * dot-directories. Package manifests are not touched: replace a dependency on
 * a retired package with `@codexo/exojs` by hand.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { findModuleSpecifiers, rewriteModuleSpecifiers, scriptKindFor } from '../lib/module-specifiers.ts';

/** Every specifier the codemod rewrites, with its v0.20 replacement. */
export const V020_SPECIFIER_MIGRATIONS: Readonly<Record<string, string>> = Object.freeze({
  '@codexo/exojs-tilemap': '@codexo/exojs/tilemap',
  '@codexo/exojs-particles': '@codexo/exojs/particles',
  '@codexo/exojs-audio-fx': '@codexo/exojs/audio-fx',
  '@codexo/exojs-physics': '@codexo/exojs/physics',
  '@codexo/exojs-physics/debug': '@codexo/exojs/debug',
  '@codexo/exojs-tilemap-physics': '@codexo/exojs/tilemap-physics',
  '@codexo/exojs-lighting': '@codexo/exojs/lighting',
  '@codexo/exojs-pathfinding': '@codexo/exojs/pathfinding',
});

const RETIRED_PACKAGES = Object.keys(V020_SPECIFIER_MIGRATIONS).filter(specifier => !specifier.includes('/', '@codexo/'.length));

/** The v0.20 replacement for `specifier`, or `undefined` when it needs none. */
export const migrateSpecifier = (specifier: string): string | undefined =>
  Object.hasOwn(V020_SPECIFIER_MIGRATIONS, specifier) ? V020_SPECIFIER_MIGRATIONS[specifier] : undefined;

/** Whether `specifier` imports a retired package in a way the codemod cannot map. */
export const isUnmappedRetiredSpecifier = (specifier: string): boolean =>
  migrateSpecifier(specifier) === undefined && RETIRED_PACKAGES.some(name => specifier.startsWith(`${name}/`));

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);

const FENCE_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
  ts: ts.ScriptKind.TS,
  typescript: ts.ScriptKind.TS,
  mts: ts.ScriptKind.TS,
  cts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
  js: ts.ScriptKind.JS,
  javascript: ts.ScriptKind.JS,
  mjs: ts.ScriptKind.JS,
  cjs: ts.ScriptKind.JS,
  jsx: ts.ScriptKind.JSX,
};

/** Rewrites the specifiers of one TypeScript or JavaScript source text. */
export const migrateSource = (fileName: string, text: string, scriptKind = scriptKindFor(fileName)): string =>
  rewriteModuleSpecifiers(fileName, text, migrateSpecifier, scriptKind);

interface FencedBlock {
  /** Offset of the first content character. */
  readonly start: number;
  /** Offset just past the last content character. */
  readonly end: number;
  readonly kind: ts.ScriptKind;
}

const OPENING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)/;

/** The fenced code blocks of a Markdown/MDX text whose language the codemod understands. */
export const findFencedCodeBlocks = (text: string): FencedBlock[] => {
  const blocks: FencedBlock[] = [];
  const lines = text.split('\n');
  let offset = 0;
  let open: { fence: string; contentStart: number; kind: ts.ScriptKind | undefined } | undefined;

  for (const line of lines) {
    const lineEnd = offset + line.length + 1;
    const content = line.replace(/\r$/, '');

    if (open === undefined) {
      const match = OPENING_FENCE.exec(content);

      if (match) {
        open = { fence: match[1]!, contentStart: lineEnd, kind: FENCE_KINDS[match[2]!.toLowerCase()] };
      }
    } else {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(content);

      if (closing && closing[1]![0] === open.fence[0] && closing[1]!.length >= open.fence.length) {
        if (open.kind !== undefined) {
          blocks.push({ start: open.contentStart, end: offset, kind: open.kind });
        }

        open = undefined;
      }
    }

    offset = lineEnd;
  }

  return blocks;
};

/** Rewrites the specifiers inside the recognized fenced code blocks of a Markdown/MDX text. */
export const migrateMarkdown = (fileName: string, text: string): string => {
  let result = text;

  for (const block of findFencedCodeBlocks(text).reverse()) {
    const code = text.slice(block.start, block.end);
    const migrated = migrateSource(`${fileName}.block`, code, block.kind);

    if (migrated !== code) {
      result = `${result.slice(0, block.start)}${migrated}${result.slice(block.end)}`;
    }
  }

  return result;
};

/** Specifiers in `text` that import a retired package but have no mapping. */
export const findUnmappedSpecifiers = (fileName: string, text: string): string[] => {
  const extension = extname(fileName).toLowerCase();
  const sources = MARKDOWN_EXTENSIONS.has(extension)
    ? findFencedCodeBlocks(text).map(block => ({ code: text.slice(block.start, block.end), kind: block.kind }))
    : [{ code: text, kind: scriptKindFor(fileName) }];

  return sources.flatMap(({ code, kind }) =>
    findModuleSpecifiers(fileName, code, kind)
      .map(occurrence => occurrence.specifier)
      .filter(isUnmappedRetiredSpecifier),
  );
};

/** The migrated text of a file, or `undefined` for a file type the codemod does not handle. */
export const migrateText = (fileName: string, text: string): string | undefined => {
  const extension = extname(fileName).toLowerCase();

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return migrateMarkdown(fileName, text);
  }

  return SOURCE_EXTENSIONS.has(extension) && !fileName.endsWith('.d.ts.map') ? migrateSource(fileName, text) : undefined;
};

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);

const collectFiles = (path: string, out: string[]): string[] => {
  if (!statSync(path).isDirectory()) {
    out.push(path);

    return out;
  }

  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name))) {
      continue;
    }

    collectFiles(join(path, entry.name), out);
  }

  return out;
};

export interface MigrationReport {
  readonly changed: readonly string[];
  readonly unmapped: ReadonlyArray<{ readonly file: string; readonly specifier: string }>;
}

/** Migrates every handled file under `paths`; with `write: false` only reports. */
export const migratePaths = (paths: readonly string[], options: { readonly write: boolean }): MigrationReport => {
  const changed: string[] = [];
  const unmapped: Array<{ file: string; specifier: string }> = [];

  for (const file of paths.flatMap(path => collectFiles(resolve(path), []))) {
    const text = readFileSync(file, 'utf8');
    const migrated = migrateText(file, text);

    if (migrated === undefined) {
      continue;
    }

    unmapped.push(...findUnmappedSpecifiers(file, text).map(specifier => ({ file, specifier })));

    if (migrated !== text) {
      changed.push(file);

      if (options.write) {
        writeFileSync(file, migrated);
      }
    }
  }

  return { changed, unmapped };
};

if (import.meta.url.startsWith('file:') && fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const paths = args.filter(arg => arg !== '--check');

  if (paths.length === 0) {
    console.error('usage: migrate-v020-imports.ts [--check] <path>...');
    process.exit(2);
  }

  const report = migratePaths(paths, { write: !check });

  for (const file of report.changed) {
    console.log(`${check ? 'needs migration' : 'migrated'}: ${file}`);
  }

  for (const { file, specifier } of report.unmapped) {
    console.warn(`no v0.20 equivalent, migrate by hand: ${specifier} in ${file}`);
  }

  console.log(
    `${report.changed.length} file(s) ${check ? 'need migration' : 'migrated'}, ${report.unmapped.length} unmapped specifier(s).`,
  );
  process.exit(check && (report.changed.length > 0 || report.unmapped.length > 0) ? 1 : 0);
}
