import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderRuntimeDts } from '../../scripts/generate-examples-runtime-dts.ts';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const committedPath = resolve(repositoryRoot, 'examples', 'shared', 'runtime.d.ts');

describe('examples/shared/runtime.d.ts', () => {
  const committed = readFileSync(committedPath, 'utf8');

  it('matches a fresh emit from runtime.ts', () => {
    expect(committed).toBe(renderRuntimeDts(repositoryRoot));
  });

  it('declares the helper kit the examples import', () => {
    expect(committed).toContain('export declare function mountControls(');
    expect(committed).toContain('export declare function mountControlPanel(');
    expect(committed).toContain('export declare function getExampleMeta(');
  });

  it('keeps the playground globals the runner injects', () => {
    expect(committed).toContain('__EXAMPLE_META__');
    expect(committed).toContain('__EXAMPLE_PREVIEW_AUTOPLAY__');
  });
});
