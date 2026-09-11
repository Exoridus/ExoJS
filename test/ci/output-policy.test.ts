import { describe, expect, it } from 'vitest';

import { atLeastOutputMode, readOutputOptions } from '../../scripts/lib/output.ts';

describe('tooling output policy', () => {
  it('uses an explicit CLI mode and removes it from the remaining arguments', () => {
    expect(readOutputOptions(['all', '--output', 'verbose'], { CI: 'true' }, false)).toEqual({ mode: 'verbose', argv: ['all'] });
    expect(readOutputOptions(['--output=normal', '--run'], { CI: 'true' }, false)).toEqual({ mode: 'normal', argv: ['--run'] });
  });

  it('uses EXOJS_OUTPUT before automatic environment detection', () => {
    expect(readOutputOptions([], { EXOJS_OUTPUT: 'silent', CI: 'true' }, true).mode).toBe('silent');
    expect(readOutputOptions([], { CI: 'true' }, true).mode).toBe('compact');
    expect(readOutputOptions([], {}, true).mode).toBe('normal');
    expect(readOutputOptions([], {}, false).mode).toBe('compact');
  });

  it('rejects unknown modes', () => {
    expect(() => readOutputOptions(['--output', 'chatty'])).toThrow("Invalid output mode 'chatty'");
  });

  it('preserves a lane minimum without overriding a more verbose request', () => {
    expect(atLeastOutputMode('silent', 'normal')).toBe('normal');
    expect(atLeastOutputMode('compact', 'normal')).toBe('normal');
    expect(atLeastOutputMode('verbose', 'normal')).toBe('verbose');
  });
});
