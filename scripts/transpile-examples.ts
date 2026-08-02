/**
 * Shared TypeScript-to-JavaScript transpilation for playground example
 * sources.
 *
 * Every `examples/**\/*.ts` file (excluding `.d.ts`) has a generated sibling
 * `.js` that the playground iframe, smoke harness, and `typecheck:examples`
 * execute directly. See `site/scripts/sync-examples-static.ts` for why these
 * are committed rather than built on demand.
 *
 * This module is the single source of truth for that transform, shared by:
 *   - `site/scripts/sync-examples-static.ts` (writes the real `.js` files)
 *   - `scripts/check-examples-sync.ts` (drift gate; never writes real files)
 */
import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

/** Header prepended to every generated example `.js` file. */
export const generatedHeader = (tsFileBasename: string): string => `// Auto-generated from ${tsFileBasename} — edit the .ts source, not this file.\n`;

/**
 * Transpiles a single example `.ts` source string to the exact `.js` content
 * the generator writes to disk (header + transpiled body).
 */
export const transpileExampleSource = (source: string, tsFileBasename: string): string => {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: false,
      declaration: false,
      sourceMap: false,
    },
  });

  return generatedHeader(tsFileBasename) + outputText;
};

/** Recursively finds files under `dir` whose name matches `predicate`. */
export const findFiles = (dir: string, predicate: (file: string) => boolean): string[] => {
  const results: string[] = [];

  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && predicate(entry.name)) {
        results.push(fullPath);
      }
    }
  };

  walk(dir);
  return results;
};

/**
 * Transpiles every TypeScript example under `dir` to a sibling `.js` file, in
 * place. Returns the number of files written.
 */
export const transpileTypescriptExamples = (dir: string): number => {
  const tsFiles = findFiles(dir, name => name.endsWith('.ts') && !name.endsWith('.d.ts'));

  for (const tsFile of tsFiles) {
    const source = fs.readFileSync(tsFile, 'utf8');
    const jsFile = tsFile.replace(/\.ts$/, '.js');
    fs.writeFileSync(jsFile, transpileExampleSource(source, path.basename(tsFile)), 'utf8');
  }

  return tsFiles.length;
};
