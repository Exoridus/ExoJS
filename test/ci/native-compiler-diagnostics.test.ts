import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkNativeProject, parseNativeDiagnostics } from '../../scripts/lib/native-compiler-diagnostics.ts';

describe('native TypeScript diagnostic parsing', () => {
  it('preserves file, global and multiple diagnostic identities', () => {
    const output = [
      'test/foo.ts(3,12): error TS2345: Argument of type string is not assignable.',
      'test/foo.ts(8,2): error TS2322: Type number is not assignable.',
      'error TS18003: No inputs were found in config file.',
      '  A multiline description that is not a new diagnostic.',
    ].join('\n');

    const root = resolve('repo');
    const file = join(root, 'test', 'foo.ts');
    const result = parseNativeDiagnostics(output, root);

    expect(result).toHaveLength(3);
    expect(result.map(item => item.file)).toEqual([file, file, null]);
  });
});

describe('native project typecheck', () => {
  it('fails before file scoping when an inherited config is invalid', () => {
    const root = mkdtempSync(join(tmpdir(), 'exojs-native-config-'));
    const config = join(root, 'tsconfig.json');

    try {
      writeFileSync(join(root, 'source.ts'), 'export {};');
      writeFileSync(join(root, 'base.json'), '{"compilerOptions":{"unknownOption":true}}');
      writeFileSync(config, '{"extends":"./base.json","files":["source.ts"]}');

      expect(() => checkNativeProject(config, root)).toThrow(/base\.json.*TS5023/u);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});
