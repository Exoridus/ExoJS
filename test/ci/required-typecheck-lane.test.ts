import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Locks the required GitHub CI `Typecheck` job (`.github/workflows/_ci-checks.yml`)
 * to run the SAME typecheck set as the local `verify:quick` pre-push hook
 * (`package.json`'s `typecheck && typecheck:guides && typecheck:examples &&
 * typecheck:type-tests && typecheck:packages`). If the two gates drift, a
 * class of error the local hook would have caught can merge on green
 * required CI and then block every contributor's next local push instead.
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

describe('CI required Typecheck job matches the local verify:quick typecheck set', () => {
  const source = readFileSync(workflowPath, 'utf8');
  const typecheckJob = extractJobBlock(source, 'typecheck');

  it('runs `pnpm typecheck` (root src/**)', () => {
    expect(typecheckJob).toContain('pnpm typecheck\n');
  });

  it('runs `pnpm typecheck:guides`', () => {
    expect(typecheckJob).toContain('pnpm typecheck:guides');
  });

  it('runs `pnpm typecheck:examples` (strict examples config)', () => {
    expect(typecheckJob).toContain('pnpm typecheck:examples');
  });

  it('runs `pnpm typecheck:type-tests`', () => {
    expect(typecheckJob).toContain('pnpm typecheck:type-tests');
  });
});
