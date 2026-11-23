// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const source = ts.createSourceFile(
  'EditorCode.tsx',
  readFileSync('site/src/components/EditorCode.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

const load = (name: string, context: Record<string, unknown>) => {
  const declaration = source.statements.find(
    node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(source) === name),
  )!;
  const code = ts.transpileModule(ts.createPrinter().printNode(ts.EmitHint.Unspecified, declaration, source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  return runInNewContext(`${code}\n${name}`, context) as (...args: string[]) => Promise<unknown>;
};

const registry = JSON.stringify({ packageJson: '{}', subpathShims: [] });

it('rejects an incomplete declaration tree instead of marking partial types ready', async () => {
  const fetchTextFile = async (url: string) => {
    if (url.endsWith('missing.d.ts')) {
      throw new Error('missing declaration');
    }

    return url.endsWith('monaco-registry.json') ? registry : 'export const value: number;';
  };

  const download = load('loadPackageTypingsFromBase', {
    fetch: async () => new Response(registry),
    buildPublicUrl: (path: string) => path,
    fetchTextFile,
    fetchTypingsManifest: async () => ['index.d.ts', 'missing.d.ts'],
  });
  await expect(download('vendor/example/', 'example')).rejects.toThrow(/missing declaration/);
});

it('requires the package registry instead of silently using an incomplete legacy tree', async () => {
  const download = load('loadPackageTypingsFromBase', {
    fetch: async () => new Response('missing registry', { status: 404 }),
    buildPublicUrl: (path: string) => path,
    fetchTextFile: async (path: string) => {
      if (path.endsWith('monaco-registry.json')) {
        throw new Error('registry unavailable');
      }

      return 'export const value: number;';
    },
    fetchTypingsManifest: async () => ['index.d.ts'],
  });
  await expect(download('vendor/example/', 'example')).rejects.toThrow(/registry unavailable/);
});

it('evicts failed version downloads so a retry can install complete declarations', async () => {
  const download = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce([{ filePath: 'index.d.ts', content: 'ready' }]);
  const get = load('getTypingsForVersion', { typingsCache: new Map(), loadTypingsForVersion: download });
  await expect(get('current')).rejects.toThrow('offline');
  await expect(get('current')).resolves.toEqual([{ filePath: 'index.d.ts', content: 'ready' }]);
});
