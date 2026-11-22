import { describe, expect, it } from 'vitest';

import { parseNativeDiagnostics } from '../../scripts/lib/native-compiler-diagnostics.ts';

describe('native TypeScript diagnostic parsing', () => {
  it('preserves file, global and multiple diagnostic identities', () => {
    const output = [
      'test/foo.ts(3,12): error TS2345: Argument of type string is not assignable.',
      'test/foo.ts(8,2): error TS2322: Type number is not assignable.',
      'error TS18003: No inputs were found in config file.',
      '  A multiline description that is not a new diagnostic.',
    ].join('\n');

    const result = parseNativeDiagnostics(output, '/repo');

    expect(result).toHaveLength(3);
    expect(result.map(item => item.file)).toEqual(['/repo/test/foo.ts', '/repo/test/foo.ts', null]);
  });
});
