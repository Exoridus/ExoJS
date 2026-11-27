// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it } from 'vitest';

const source = ts.createSourceFile(
  'EditorCode.tsx',
  readFileSync('site/src/components/EditorCode.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const expressions = new Map<string, ts.Expression>();

const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && node.initializer) {
    const name = node.name.getText(source);

    if (name === 'openFile' && ts.isCallExpression(node.initializer)) {
      expressions.set(name, node.initializer.arguments[0]!);
    } else if (name === 'getModelUrl') {
      expressions.set(name, node.initializer);
    }
  }

  ts.forEachChild(node, visit);
};

visit(source);
const compiled = ts.transpileModule(
  [...expressions].map(([name, expression]) => `const ${name} = ${expression.getText(source)};`).join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

it('keeps emitting the entry after its compiled JavaScript view joins the language service', async () => {
  const sourcePath = 'getting-started/hello-world.ts';
  const compiledPath = 'getting-started/hello-world.js';
  const models = new Map<string, { text: string; kind: ts.ScriptKind }>();
  const editor = runInNewContext(`${compiled}\n({ openFile, getModelUrl });`, {
    sourcePath,
    compiledPath,
    compiledCode: 'export const value = 0;',
    selectedVersionId: 'current',
    filesRef: { current: new Map() },
    fileRequestRef: { current: null },
    setFileStatus() {},
    selectFile() {},
    monaco: {
      Uri: { parse: (value: string) => new URL(value) },
      editor: {
        createModel(text: string, language: string, uri: URL) {
          expect(language).toBe('javascript');
          models.set(uri.toString(), { text, kind: ts.ScriptKind.JS });

          return { uri };
        },
      },
    },
  }) as { openFile(path: string): Promise<void>; getModelUrl(path: string, version: string, entry: string): string };
  const entryUri = editor.getModelUrl(sourcePath, 'current', sourcePath);
  models.set(entryUri, { text: 'export const value: number = 1;', kind: ts.ScriptKind.TS });
  await editor.openFile(compiledPath);
  const service = ts.createLanguageService({
    getCompilationSettings: () => ({
      allowJs: true,
      allowNonTsExtensions: true,
      noEmit: false,
      noLib: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    }),
    getScriptFileNames: () => [...models.keys()],
    getScriptVersion: () => '1',
    getScriptKind: file => models.get(file)?.kind ?? ts.ScriptKind.Unknown,
    getScriptSnapshot: file => {
      const model = models.get(file);

      return model ? ts.ScriptSnapshot.fromString(model.text) : undefined;
    },
    getCurrentDirectory: () => '',
    getDefaultLibFileName: () => 'lib.d.ts',
    fileExists: file => models.has(file),
    readFile: file => models.get(file)?.text,
  });

  try {
    const output = service.getEmitOutput(entryUri);
    expect(output.emitSkipped).toBe(false);
    expect(output.outputFiles.find(file => file.name.endsWith('.js'))?.text).toContain('value = 1');
    expect(service.getCompilerOptionsDiagnostics().filter(diagnostic => diagnostic.code === 5055 || diagnostic.code === 5056)).toEqual([]);
    const outputUri = [...models.keys()].find(uri => uri !== entryUri)!;
    expect(new URL(outputUri).pathname.endsWith('/hello-world.js')).toBe(true);
  } finally {
    service.dispose();
  }
});
