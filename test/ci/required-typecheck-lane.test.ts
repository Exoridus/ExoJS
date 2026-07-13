import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Locks the required GitHub CI `Typecheck` job (`.github/workflows/_ci-checks.yml`)
 * to run the SAME typecheck set as the local `verify:quick` pre-push hook
 * (`package.json`'s `typecheck && typecheck:guides && typecheck:examples &&
 * typecheck:type-tests && typecheck:packages`). #319: the two gates had
 * drifted — CI skipped `typecheck:examples`, so 5 strict-mode example errors
 * (introduced by #298's `strict: true`) merged via automerge on green
 * required CI, then blocked every contributor's local `git push` (the
 * pre-push hook still ran `typecheck:examples`). `typecheck:type-tests` has
 * the identical gap (present in verify:quick, absent from CI) despite not
 * being named in #319's title.
 */

const workflowPath = resolve(import.meta.dirname!, '../../.github/workflows/_ci-checks.yml');

/** Extracts the `jobs.<jobName>` block's raw YAML text (up to the next top-level job key or EOF). */
function extractJobBlock(source: string, jobName: string): string {
  const headerRe = new RegExp(`\\n {2}${jobName}:\\n`);
  const startMatch = headerRe.exec(source);
  if (!startMatch) {
    throw new Error(`job "${jobName}" not found in ${workflowPath}`);
  }

  const rest = source.slice(startMatch.index + startMatch[0].length);
  const nextJobMatch = /\n {2}[a-zA-Z][\w-]*:\n/.exec(rest);

  return nextJobMatch ? rest.slice(0, nextJobMatch.index) : rest;
}

describe('CI required Typecheck job matches the local verify:quick typecheck set (#319)', () => {
  const source = readFileSync(workflowPath, 'utf8');
  const typecheckJob = extractJobBlock(source, 'typecheck');

  it('runs `pnpm typecheck` (root src/**)', () => {
    expect(typecheckJob).toContain('pnpm typecheck\n');
  });

  it('runs `pnpm typecheck:guides`', () => {
    expect(typecheckJob).toContain('pnpm typecheck:guides');
  });

  it('runs `pnpm typecheck:examples` — the strict examples config #319 found CI was skipping', () => {
    expect(typecheckJob).toContain('pnpm typecheck:examples');
  });

  it('runs `pnpm typecheck:type-tests` — same drift class as typecheck:examples, also gated locally by verify:quick', () => {
    expect(typecheckJob).toContain('pnpm typecheck:type-tests');
  });
});
