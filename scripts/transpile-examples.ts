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

import { createWorkerPlugin } from '@codexo/exojs-build';
import ts from 'typescript';

/**
 * Matches a whole-line `import name from './x.worker.ts?worker';` statement.
 *
 * The playground executes an example as one inline `<script type="module">`, so a
 * relative specifier in the emitted `.js` would resolve against the host page rather
 * than the example, and nothing bundles these files. A worker source therefore has to
 * be inlined into the example at generation time - which is also what lets the worker
 * import shared helpers instead of restating them.
 */
const WORKER_IMPORT = /^import\s+(\w+)\s+from\s+'([^']+)\?worker';[^\S\n]*$/gm;

/** True for a `.ts` example that gets a generated `.js` sibling. */
export const isTranspiledExampleSource = (name: string): boolean => name.endsWith('.ts') && !name.endsWith('.d.ts') && !name.endsWith('.worker.ts');

/**
 * The same `?worker` transform the bundlers run, driven directly: this
 * generator is not a bundler, so it resolves and loads through the plugin's
 * hooks itself. Going through the published plugin rather than its internals
 * keeps one implementation of the transform for the build, the tests and this
 * generator.
 */
const workerPlugin = createWorkerPlugin();

const bundledWorkerSource = (entryPoint: string): string => {
  const id = workerPlugin.resolveId(`${entryPoint}?worker`);

  if (id === null) throw new Error(`transpile-examples: the worker plugin did not claim ${entryPoint}.`);

  const moduleCode = workerPlugin.load.call({}, id);
  const match = moduleCode === null ? null : /^export default (.*);\n?$/s.exec(moduleCode);

  if (!match) throw new Error(`transpile-examples: the worker plugin did not emit a default-exported string for ${entryPoint}.`);

  return JSON.parse(match[1]!) as string;
};

/**
 * Replaces every `?worker` import with the bundled source of the imported module,
 * as a string constant. `.worker.ts` files are excluded from the generated `.js`
 * catalog precisely because they only ever ship inlined like this.
 */
const inlineWorkerImports = (source: string, tsFilePath: string): string =>
  source.replaceAll(WORKER_IMPORT, (_match, binding: string, specifier: string) => {
    const entryPoint = path.resolve(path.dirname(tsFilePath), specifier);

    return `const ${binding} = ${JSON.stringify(bundledWorkerSource(entryPoint))};`;
  });

/** Header prepended to every generated example `.js` file. */
export const generatedHeader = (tsFileBasename: string): string => `// Auto-generated from ${tsFileBasename} - edit the .ts source, not this file.\n`;

/**
 * Transpiles a single example `.ts` source string to the exact `.js` content
 * the generator writes to disk (header + transpiled body).
 *
 * `tsFilePath` is the source's location on disk, needed to resolve `?worker`
 * imports; only its basename reaches the emitted output.
 */
export const transpileExampleSource = (source: string, tsFilePath: string): string => {
  const { outputText } = ts.transpileModule(inlineWorkerImports(source, tsFilePath), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: false,
      declaration: false,
      sourceMap: false,
    },
  });

  return generatedHeader(path.basename(tsFilePath)) + outputText;
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
  const tsFiles = findFiles(dir, isTranspiledExampleSource);

  for (const tsFile of tsFiles) {
    const source = fs.readFileSync(tsFile, 'utf8');
    const jsFile = tsFile.replace(/\.ts$/, '.js');
    fs.writeFileSync(jsFile, transpileExampleSource(source, tsFile), 'utf8');
  }

  return tsFiles.length;
};
