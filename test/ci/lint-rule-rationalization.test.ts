import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const rows = (path: string): string[] => {
  const text = readFileSync(resolve(process.cwd(), path), 'utf8');

  return text.trimEnd().split('\n').slice(1);
};

const ids = (lines: readonly string[]): string[] => lines.map(line => line.slice(0, line.indexOf(','))).sort();

describe('residual lint rule triage', () => {
  it('records each non-delegated rule exactly once', () => {
    const source = rows('scripts/ci/lint-rule-coverage.csv');
    const expected = ids(source.filter(line => !line.includes(',native hybrid candidate,')));
    const ledger = ids(rows('scripts/ci/lint-rule-rationalization.csv'));

    expect(new Set(ledger).size).toBe(ledger.length);
    expect(ledger).toEqual(expected);
  });
});
