import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NULL_SHA, pushBase } from '../../scripts/ci/push-range.ts';
import { pushScope } from '../../scripts/ci/push-scope.ts';

// The logic under test is the SAME module .husky/pre-push branches on, so these
// assertions exercise the real narrowing decision rather than a copy of it.

describe('pre-push scope selection', () => {
  it('verifies nothing when the range changes no tracked file', () => {
    expect(pushScope([])).toBe('none');
    expect(pushScope(['', '   '])).toBe('none');
  });

  it('narrows a published-profile change to its own gate', () => {
    expect(pushScope(['packages/exojs-bench/results/rtx-5070-ti-windows-11-chromium.json'])).toBe('data');
    expect(
      pushScope([
        'packages/exojs-bench/results/apple-macos-27-beta-webkit.json',
        'packages/exojs-bench/results/m3-max-macos-27-beta-webkit.json',
        'packages/exojs-bench/results/README.md',
      ]),
    ).toBe('data');
  });

  it('reads Windows separators, which is how git diff reaches the hook there', () => {
    expect(pushScope(['packages\\exojs-bench\\results\\rtx-5070-ti-windows-11-chromium.json'])).toBe('data');
  });

  it('takes the full path as soon as one file is not published data', () => {
    expect(pushScope(['packages/exojs-bench/results/x.json', 'src/rendering/Renderer.ts'])).toBe('full');
    // The harness that PRODUCES the profiles is code, and so is its baseline.
    expect(pushScope(['packages/exojs-bench/src/suite/catalog.ts'])).toBe('full');
    expect(pushScope(['packages/exojs-bench/baselines/structural.json'])).toBe('full');
  });

  it('does not narrow on a path that merely starts like the results directory', () => {
    expect(pushScope(['packages/exojs-bench/results-notes.md'])).toBe('full');
  });
});

describe('pre-push base selection', () => {
  it('uses the merge base for the first push of a branch', () => {
    expect(pushBase('local-head', NULL_SHA, head => (head === 'local-head' ? 'merge-base\n' : ''))).toBe('merge-base');
  });

  it('uses the previous remote SHA for an incremental push', () => {
    expect(
      pushBase('local-head', 'previous-remote', () => {
        throw new Error('merge base must not run');
      }),
    ).toBe('previous-remote');
  });

  it('fails broad when a new branch has no determinable merge base', () => {
    expect(
      pushBase('local-head', NULL_SHA, () => {
        throw new Error('missing');
      }),
    ).toBe('');
    expect(pushScope(['unexpected/new.kind'])).toBe('full');
  });
});

describe('pre-push ref handling', () => {
  const hook = readFileSync(resolve(import.meta.dirname!, '../../.husky/pre-push'), 'utf8');

  it('ignores branch deletions before selecting a range', () => {
    expect(hook).toContain('[ "$local_sha" = "$null_sha" ] && continue');
  });

  it('keeps the tag trust path', () => {
    expect(hook).toContain('refs/tags/*)');
    expect(hook).toContain('node scripts/ci/trust.ts "$tag"');
  });

  it('passes the selected previous remote SHA to both static gates and test lanes', () => {
    expect(hook).toContain('node scripts/ci/push-range.ts "$push_head_sha" "${push_base_sha:-$null_sha}"');
    expect(hook).toContain('npm run gates -- affected "$lane_base" "$push_head_sha"');
    expect(hook).toContain('npm run lanes -- --run --tests-only --base "$lane_base"');
  });
});
