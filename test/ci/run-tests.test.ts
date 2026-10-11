// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { recheckArguments, timeoutOnlyFailures, type VitestJsonReport } from '../../scripts/run-tests';

const timedOut = 'Error: Test timed out in 15000ms.\nIf this is a long-running test, pass a timeout value as the last argument.';
const hookTimedOut = 'Error: Hook timed out in 10000ms.';
const assertion = 'AssertionError: expected 2 to be 3';

const file = (name: string, failures: readonly string[][], message?: string): VitestJsonReport['testResults'][number] => ({
  name,
  status: failures.length > 0 || message !== undefined ? 'failed' : 'passed',
  ...(message !== undefined && { message }),
  assertionResults: [
    { status: 'passed', failureMessages: [] },
    ...failures.map(failureMessages => ({ status: 'failed', failureMessages })),
  ],
});

describe('timeoutOnlyFailures', () => {
  it('returns the failed files when every failure is a timeout', () => {
    const report = {
      testResults: [
        file('/repo/a.test.ts', [[timedOut]]),
        file('/repo/b.test.ts', []),
        file('/repo/c.test.ts', [[hookTimedOut], [timedOut]]),
      ],
    };

    expect(timeoutOnlyFailures(report)).toEqual(['/repo/a.test.ts', '/repo/c.test.ts']);
  });

  it('refuses a run with any failure that is not a timeout', () => {
    expect(
      timeoutOnlyFailures({ testResults: [file('/repo/a.test.ts', [[timedOut]]), file('/repo/b.test.ts', [[assertion]])] }),
    ).toBeNull();
    expect(timeoutOnlyFailures({ testResults: [file('/repo/a.test.ts', [[timedOut, assertion]])] })).toBeNull();
  });

  it('refuses a file that failed without a failed test of its own', () => {
    expect(timeoutOnlyFailures({ testResults: [file('/repo/a.test.ts', [], 'Failed to load url ./missing')] })).toBeNull();
    expect(timeoutOnlyFailures({ testResults: [{ name: '/repo/a.test.ts', status: 'failed', assertionResults: [] }] })).toBeNull();
  });

  it('refuses a failed test that reports no message', () => {
    expect(timeoutOnlyFailures({ testResults: [file('/repo/a.test.ts', [[]])] })).toBeNull();
  });

  it('returns null for a run without failures', () => {
    expect(timeoutOnlyFailures({ testResults: [file('/repo/a.test.ts', [])] })).toBeNull();
  });
});

describe('recheckArguments', () => {
  it('keeps the selection, drops reporters and outputs, and runs the files serially', () => {
    const args = [
      '--project=exojs*',
      '--reporter=minimal',
      '--reporter=junit',
      '--outputFile.junit=./test-results/unit.junit.xml',
      '--project=rendering-perf',
    ];

    expect(recheckArguments(args, ['/repo/test/a.test.ts'], '/repo')).toEqual([
      '--project=exojs*',
      '--project=rendering-perf',
      '--no-file-parallelism',
      'test/a.test.ts',
    ]);
  });
});
