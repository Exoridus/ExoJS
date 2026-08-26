/**
 * Declaration emit for the shared example runtime.
 *
 * `examples/shared/runtime.ts` is the implementation the examples import. The
 * Playground editor cannot read it: Monaco resolves `@examples/runtime` through
 * a virtual `index.d.ts` it fetches over HTTP from the served snapshot (see
 * `SHARED_LIB_FILES` in the site's editor component), so the module needs a
 * declaration file next to it.
 *
 * That file used to be hand-written alongside a hand-written `runtime.js`, which
 * left the editor's view of the helper kit free to drift from the helper kit.
 * Emitting it from the implementation removes the second copy; a drift test
 * pins the committed output the same way `assets-global.d.ts` is pinned.
 */
import path from 'node:path';

import ts from 'typescript';

/** Compiler options for the emit. Kept explicit so the output does not move with an unrelated tsconfig edit. */
const EMIT_OPTIONS: ts.CompilerOptions = {
  declaration: true,
  emitDeclarationOnly: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  skipLibCheck: true,
};

/**
 * Emits the declaration file for `examples/shared/runtime.ts`.
 *
 * Throws when the emit produces no declaration output, which means the source
 * failed to compile - a silent empty write would hand the editor an empty
 * module and show up as "has no exported member" on every example.
 */
export const renderRuntimeDts = (repositoryRoot: string): string => {
  const entry = path.resolve(repositoryRoot, 'examples', 'shared', 'runtime.ts');
  const program = ts.createProgram([entry], EMIT_OPTIONS);

  let output: string | null = null;

  const result = program.emit(undefined, (fileName, text) => {
    if (fileName.endsWith('runtime.d.ts')) output = text;
  });

  if (output === null) {
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(result.diagnostics);
    const detail = ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => repositoryRoot,
      getNewLine: () => '\n',
    });

    throw new Error(`Declaration emit for examples/shared/runtime.ts produced no output.\n${detail}`);
  }

  return output;
};
