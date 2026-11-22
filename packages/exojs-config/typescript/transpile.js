// Shared native TypeScript 7.1 transpilation entry point for Node tooling.
// The client is intentionally reused: example generation transpiles hundreds
// of sources and creating one Go client per file would dominate the work.
import { ScriptTarget } from '@typescript/native/ast';
import { API, ModuleKind, formatDiagnosticsWithColorAndContext } from '@typescript/native/sync';

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
 * Transpile a TypeScript source with the native 7.1 API, retaining ES module
 * semantics and comments. The returned text is not formatted for publication.
 *
 * @param {string} source
 * @param {{ target?: 'es2022' | 'es2023' }} [options]
 * @returns {string}
 */
export const transpileNative = (source, options = {}) => {
  const api = currentClient();
  const result = api.transpileModule(source, {
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: options.target === 'es2023' ? ScriptTarget.ES2023 : ScriptTarget.ES2022,
      removeComments: false,
      declaration: false,
      sourceMap: false,
    },
    reportDiagnostics: true,
  });

  if (result.diagnostics?.length) {
    throw new Error(formatDiagnosticsWithColorAndContext(result.diagnostics, api));
  }

  return result.outputText;
};
