import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const invalidModules = [
  { name: 'duplicate formal parameters', code: 'export function duplicate(value, value) {}\n' },
  { name: 'legacy octal literal', code: 'export const n = 010;\n' },
] as const;

describe('ECMAScript module parse rules formerly duplicated by ESLint', () => {
  for (const fixture of invalidModules) {
    it(`rejects ${fixture.name} even without an ESLint rule`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'exojs-esm-'));
      const file = join(directory, 'invalid.mjs');

      try {
        writeFileSync(file, fixture.code);

        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });

        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/SyntaxError/u);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
