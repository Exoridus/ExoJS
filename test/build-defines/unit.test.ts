import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createBuildDefines,
  isTreeDirty,
  isValidMode,
  resolveRevision,
  resolveShortRevision,
  resolveVersion,
  validateMode,
} from '../../packages/exojs-config/build-defines/index.js';

// ---- MiniRunner fake for injectable tests ---------------------------------

interface MiniRunner {
  exec(cmd: string, args: string[], cwd?: string): { code: number; stdout: string; stderr: string };
}

const ok = (stdout = ''): { code: number; stdout: string; stderr: string } => ({ code: 0, stdout, stderr: '' });
const fail = (stderr = 'error'): { code: number; stdout: string; stderr: string } => ({ code: 1, stdout: '', stderr });

// ---- mode validation -------------------------------------------------------

describe('mode validation', () => {
  it('accepts "development"', () => {
    expect(isValidMode('development')).toBe(true);
    expect(validateMode('development')).toBe('development');
  });

  it('accepts "production"', () => {
    expect(isValidMode('production')).toBe(true);
    expect(validateMode('production')).toBe('production');
  });

  it('rejects invalid modes', () => {
    expect(isValidMode('staging')).toBe(false);
    expect(() => validateMode('staging')).toThrow('Invalid build mode');
  });
});

// ---- version resolution ----------------------------------------------------

describe('resolveVersion', () => {
  it('reads the version field from a package.json', () => {
    const rootVersion = resolveVersion(resolve(import.meta.dirname!, '..', '..'));
    // The root package version must be a valid semver string.
    expect(rootVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('falls back to "0.0.0" for a missing package.json', () => {
    expect(resolveVersion(tmpdir())).toBe('0.0.0');
  });
});

// ---- revision resolution (with fake runner) --------------------------------

describe('resolveRevision', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore any mutated env vars.
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const key of Object.keys(originalEnv)) {
      process.env[key] = originalEnv[key];
    }
  });

  it('returns EXOJS_REVISION when set', () => {
    process.env['EXOJS_REVISION'] = 'custom-rev-123';
    const runner: MiniRunner = {
      exec: () => fail('should not be called'),
    };
    expect(resolveRevision({ runner })).toBe('custom-rev-123');
  });

  it('returns GITHUB_SHA when no EXOJS_REVISION', () => {
    delete process.env['EXOJS_REVISION'];
    process.env['GITHUB_SHA'] = 'abc1234567890abcdef';
    const runner: MiniRunner = {
      exec: () => fail('should not be called when CI SHA is present'),
    };
    expect(resolveRevision({ runner })).toBe('abc1234567890abcdef');
  });

  it('returns CI_COMMIT_SHA when no EXOJS_REVISION or GITHUB_SHA', () => {
    delete process.env['EXOJS_REVISION'];
    delete process.env['GITHUB_SHA'];
    process.env['CI_COMMIT_SHA'] = 'deadbeef1234';
    const runner: MiniRunner = {
      exec: () => fail('should not be called when CI SHA is present'),
    };
    expect(resolveRevision({ runner })).toBe('deadbeef1234');
  });

  it('falls back to git rev-parse when no env vars', () => {
    delete process.env['EXOJS_REVISION'];
    delete process.env['GITHUB_SHA'];
    delete process.env['CI_COMMIT_SHA'];
    delete process.env['GIT_COMMIT'];
    delete process.env['BITBUCKET_COMMIT'];

    const runner: MiniRunner = {
      exec: (cmd, args) => {
        if (cmd === 'git' && args.join(' ') === 'rev-parse HEAD') {
          return ok('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
        }
        return fail('unexpected command');
      },
    };
    expect(resolveRevision({ runner })).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
  });

  it('returns "unknown" when git rev-parse fails', () => {
    delete process.env['EXOJS_REVISION'];
    delete process.env['GITHUB_SHA'];
    delete process.env['CI_COMMIT_SHA'];
    delete process.env['GIT_COMMIT'];
    delete process.env['BITBUCKET_COMMIT'];

    const runner: MiniRunner = {
      exec: () => fail('no git'),
    };
    expect(resolveRevision({ runner })).toBe('unknown');
  });
});

// ---- dirty-tree detection (with fake runner) -------------------------------

describe('isTreeDirty', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const key of Object.keys(originalEnv)) {
      process.env[key] = originalEnv[key];
    }
  });

  it('returns false for a clean tree (git diff-index exit 0)', () => {
    delete process.env['EXOJS_REVISION'];
    delete process.env['GITHUB_SHA'];
    delete process.env['CI_COMMIT_SHA'];
    delete process.env['GIT_COMMIT'];
    delete process.env['BITBUCKET_COMMIT'];

    const runner: MiniRunner = {
      exec: (cmd, args) => {
        if (cmd === 'git' && args.join(' ') === 'rev-parse HEAD') return ok('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
        if (cmd === 'git' && args.join(' ') === 'diff-index --quiet HEAD --') return ok();
        return fail('unexpected');
      },
    };
    expect(isTreeDirty({ runner })).toBe(false);
  });

  it('returns true for a dirty tree (git diff-index exit 1)', () => {
    delete process.env['EXOJS_REVISION'];
    delete process.env['GITHUB_SHA'];
    delete process.env['CI_COMMIT_SHA'];
    delete process.env['GIT_COMMIT'];
    delete process.env['BITBUCKET_COMMIT'];

    let revCalled = false;
    const runner: MiniRunner = {
      exec: (cmd, args) => {
        if (cmd === 'git' && args.join(' ') === 'rev-parse HEAD') {
          revCalled = true;
          return ok('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
        }
        if (cmd === 'git' && args.join(' ') === 'diff-index --quiet HEAD --') return fail('dirty');
        return fail('unexpected');
      },
    };
    expect(isTreeDirty({ runner })).toBe(true);
    expect(revCalled).toBe(true);
  });

  it('returns false when revision is unknown (no reference to compare)', () => {
    delete process.env['EXOJS_REVISION'];
    delete process.env['GITHUB_SHA'];
    delete process.env['CI_COMMIT_SHA'];
    delete process.env['GIT_COMMIT'];
    delete process.env['BITBUCKET_COMMIT'];

    const runner: MiniRunner = {
      exec: () => fail('no git'),
    };
    expect(isTreeDirty({ runner })).toBe(false);
  });
});

// ---- short revision --------------------------------------------------------

describe('resolveShortRevision', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const key of Object.keys(originalEnv)) {
      process.env[key] = originalEnv[key];
    }
  });

  it('returns 7-char short SHA for a clean build', () => {
    delete process.env['EXOJS_REVISION'];
    delete process.env['GITHUB_SHA'];
    delete process.env['CI_COMMIT_SHA'];
    delete process.env['GIT_COMMIT'];
    delete process.env['BITBUCKET_COMMIT'];

    const runner: MiniRunner = {
      exec: (cmd, args) => {
        if (cmd === 'git' && args.join(' ') === 'rev-parse HEAD') return ok('abcdef1234567890abcdef1234567890abcdef12');
        if (cmd === 'git' && args.join(' ') === 'diff-index --quiet HEAD --') return ok();
        return fail('unexpected');
      },
    };
    expect(resolveShortRevision({ runner })).toBe('abcdef1');
  });

  it('returns dirty suffix when tree has changes', () => {
    delete process.env['EXOJS_REVISION'];
    delete process.env['GITHUB_SHA'];
    delete process.env['CI_COMMIT_SHA'];
    delete process.env['GIT_COMMIT'];
    delete process.env['BITBUCKET_COMMIT'];

    const runner: MiniRunner = {
      exec: (cmd, args) => {
        if (cmd === 'git' && args.join(' ') === 'rev-parse HEAD') return ok('abcdef1234567890');
        if (cmd === 'git' && args.join(' ') === 'diff-index --quiet HEAD --') return fail('dirty');
        return fail('unexpected');
      },
    };
    expect(resolveShortRevision({ runner })).toBe('abcdef1-dirty');
  });

  it('returns "unknown" when git metadata is missing', () => {
    delete process.env['EXOJS_REVISION'];
    delete process.env['GITHUB_SHA'];
    delete process.env['CI_COMMIT_SHA'];
    delete process.env['GIT_COMMIT'];
    delete process.env['BITBUCKET_COMMIT'];

    const runner: MiniRunner = {
      exec: () => fail('no git at all'),
    };
    expect(resolveShortRevision({ runner })).toBe('unknown');
  });

  it('respects explicit EXOJS_REVISION override', () => {
    process.env['EXOJS_REVISION'] = 'release-42';
    const runner: MiniRunner = {
      exec: () => fail('should not use git'),
    };
    expect(resolveShortRevision({ runner })).toBe('release'); // 7-char truncation
  });
});

// ---- createBuildDefines ----------------------------------------------------

describe('createBuildDefines', () => {
  it('returns source-code expression strings for production mode', () => {
    const defines = createBuildDefines({
      mode: 'production',
      version: '1.2.3',
      revision: 'abc1234',
    });
    expect(defines).toEqual({
      __DEV__: 'false',
      __VERSION__: '"1.2.3"',
      __REVISION__: '"abc1234"',
    });
  });

  it('returns source-code expression strings for development mode', () => {
    const defines = createBuildDefines({
      mode: 'development',
      version: '0.0.0',
      revision: 'unknown',
    });
    expect(defines).toEqual({
      __DEV__: 'true',
      __VERSION__: '"0.0.0"',
      __REVISION__: '"unknown"',
    });
  });

  it('rejects invalid modes', () => {
    expect(() =>
      createBuildDefines({
        mode: 'staging' as 'production',
        version: '0.0.0',
        revision: 'x',
      }),
    ).toThrow('Invalid build mode');
  });

  it('serializes special characters in version string properly', () => {
    const defines = createBuildDefines({
      mode: 'production',
      version: '0.12.0-beta.1',
      revision: 'abc"quoted"',
    });
    expect(defines.__VERSION__).toBe('"0.12.0-beta.1"');
    // JSON.stringify should escape the embedded quotes.
    expect(defines.__REVISION__).toContain('\\"');
  });
});
