import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const ids = (path: string): string[] =>
  readFileSync(resolve(root, path), 'utf8')
    .trimEnd()
    .split('\n')
    .slice(1)
    .map(line => line.slice(0, line.indexOf(',')));

describe('residual lint rule triage', () => {
  it('records each non-delegated rule exactly once', () => {
    const source = readFileSync(resolve(root, 'scripts/ci/lint-rule-coverage.csv'), 'utf8')
      .trimEnd()
      .split('\n')
      .slice(1);
    const original = source
      .filter(line => !line.includes(',native hybrid candidate,'))
      .map(line => line.slice(0, line.indexOf(',')))
      .sort();
    const ledger = ids('scripts/ci/lint-rule-rationalization.csv').sort();

    expect(new Set(ledger).size).toBe(ledger.length);
    expect(ledger).toEqual(original);
  });
});
