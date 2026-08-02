import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { findFiles, transpileExampleSource } from '../../scripts/transpile-examples';

// Vitest runs with the repository root as the working directory.
const examplesDir = path.join(process.cwd(), 'examples');

// The generator always emits LF; a Windows checkout may have normalized the
// committed files to CRLF (core.autocrlf), which must not count as drift.
const normalizeNewlines = (content: string): string => content.replace(/\r\n/g, '\n');

describe('example .js/.ts sync drift guard', () => {
  it('every generated examples/**/*.js matches its .ts source (run `pnpm --filter @codexo/exojs-examples examples:sync`)', () => {
    const tsFiles = findFiles(examplesDir, name => name.endsWith('.ts') && !name.endsWith('.d.ts'));
    const drifted: string[] = [];

    for (const tsFile of tsFiles) {
      const relJs = path.relative(examplesDir, tsFile).replace(/\.ts$/, '.js');
      const jsFile = path.join(examplesDir, relJs);
      const generated = transpileExampleSource(fs.readFileSync(tsFile, 'utf8'), path.basename(tsFile));

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
