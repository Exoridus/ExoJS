import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * One Node version, declared once. `.nvmrc` is the source; `devEngines` in
 * package.json enforces it for pnpm, and every workflow reads the file rather
 * than naming a version of its own. A second declaration anywhere is a second
 * place for the two to drift apart.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const nvmrc = readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim();
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  devEngines?: { runtime?: { name?: string; version?: string; onFail?: string } };
};
const workflowFiles = ['.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/actions/setup/action.yml'];

describe('the Node version is declared once', () => {
  it('.nvmrc names a bare major', () => {
    expect(nvmrc).toMatch(/^\d+$/);
  });

  it('devEngines enforces the same major and fails hard', () => {
    const runtime = packageJson.devEngines?.runtime;

    expect(runtime?.name).toBe('node');
    expect(runtime?.onFail).toBe('error');
    expect(runtime?.version).toBe(`^${nvmrc}`);
  });

  it.each(workflowFiles)('%s reads .nvmrc instead of naming a version', file => {
    const text = readFileSync(resolve(repoRoot, file), 'utf8');

    expect(text).not.toMatch(/node-version:\s*['"]?\d/);
    expect(text).toContain('node-version-file: .nvmrc');
  });
});
