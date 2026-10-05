import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { CHECKED_README_PATHS } from '../../scripts/ci/select-lanes.ts';

describe('complete README examples', () => {
  it('typechecks every listing against the public package entry points', () => {
    const root = process.cwd();
    const virtual = new Map<string, string>();
    for (const path of CHECKED_README_PATHS) {
      const blocks = [...readFileSync(join(root, path), 'utf8').matchAll(/^```ts[ \t]*\r?\n([\s\S]*?)^```/gm)];
      expect(blocks.length, `${path} must retain its complete example`).toBeGreaterThan(0);
      for (const [index, block] of blocks.entries()) {
        virtual.set(resolve(root, `${path}.example-${index}.ts`), `${block[1]}\nexport {};\n`);
      }
    }

    const config = ts.readConfigFile(join(root, 'tsconfig.examples.json'), ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    expect(parsed.errors).toEqual([]);
    const options = { ...parsed.options, noEmit: true };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const readFile = host.readFile.bind(host);
    host.fileExists = file => virtual.has(resolve(file)) || fileExists(file);
    host.readFile = file => virtual.get(resolve(file)) ?? readFile(file);
    host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => {
      const source = virtual.get(resolve(file));
      return source === undefined
        ? getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile)
        : ts.createSourceFile(file, source, languageVersion, true);
    };

    // Reuse the real shader/worklet and build-constant declarations, not permissive test stubs.
    const program = ts.createProgram([...virtual.keys(), join(root, 'src/typings.d.ts')], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program).map(diagnostic => {
      const location = diagnostic.file && diagnostic.start !== undefined ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : undefined;
      return `${diagnostic.file?.fileName ?? 'compiler'}:${location ? location.line + 1 : ''} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
    });
    expect(diagnostics).toEqual([]);
  }, 30000);
});
