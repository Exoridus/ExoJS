import { describe, expect, it } from 'vitest';

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
