// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { findFiles, isTranspiledExampleSource, transpileExampleSource } from '../../scripts/transpile-examples';

// Runs in the node environment: the generator bundles `?worker` imports with
// esbuild, which rejects the jsdom TextEncoder.
//
// Vitest runs with the repository root as the working directory.
const examplesDir = path.join(process.cwd(), 'examples');

// The generator always emits LF; a Windows checkout may have normalized the
// committed files to CRLF (core.autocrlf), which must not count as drift.
const normalizeNewlines = (content: string): string => content.replace(/\r\n/g, '\n');

describe('example .js/.ts sync drift guard', () => {
  it('ships catalog workers as bundled string modules for editor-emitted imports', async () => {
    const workerPath = path.join(examplesDir, 'tilemap/worker-streamed-terrain.worker.ts');
    expect(isTranspiledExampleSource(path.basename(workerPath))).toBe(true);
    const output = await transpileExampleSource(fs.readFileSync(workerPath, 'utf8'), workerPath);
    const module = ts.createSourceFile('worker.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const exported = module.statements.find(ts.isExportAssignment)?.expression;
    expect(exported && ts.isStringLiteral(exported)).toBe(true);

    if (!exported || !ts.isStringLiteral(exported)) {
      throw new Error('Expected a worker source string');
    }

    expect(exported.text).toContain('fbm');
    expect(exported.text).not.toMatch(/\bimport\s/);
    expect(readText('site/public/preview.html')).toContain(
      "'./worker-streamed-terrain.worker.ts?worker': './examples/tilemap/worker-streamed-terrain.worker.js?no-cache='",
    );
  });
  it('every generated examples/**/*.js matches its .ts source (run `pnpm --filter @codexo/exojs-examples examples:sync`)', async () => {
    const tsFiles = findFiles(examplesDir, isTranspiledExampleSource);
    const drifted: string[] = [];

    for (const tsFile of tsFiles) {
      const relJs = path.relative(examplesDir, tsFile).replace(/\.ts$/, '.js');
      const jsFile = path.join(examplesDir, relJs);
      const generated = await transpileExampleSource(fs.readFileSync(tsFile, 'utf8'), tsFile);

      if (!fs.existsSync(jsFile)) {
        drifted.push(`examples/${relJs.split(path.sep).join('/')} (missing)`);
        continue;
      }

      const committed = fs.readFileSync(jsFile, 'utf8');

      if (normalizeNewlines(committed) !== normalizeNewlines(generated)) {
        drifted.push(`examples/${relJs.split(path.sep).join('/')}`);
      }
    }

    expect(drifted).toEqual([]);
  });
});

const readText = (file: string): string => fs.readFileSync(path.resolve(file), 'utf8');
