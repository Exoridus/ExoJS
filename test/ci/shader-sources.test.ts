// @vitest-environment node
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { formatShaderProblem, scanShaderSources } from '../../scripts/check-shader-sources';

/**
 * Proves `scripts/check-shader-sources.ts` actually fails on each defect it
 * claims to catch, by introducing that defect into a real shader and putting it
 * back afterwards. A hygiene gate that silently matches nothing is worse than no
 * gate: it reports a clean tree either way.
 *
 * A real file is mutated rather than a fixture written, because two of the rules
 * - orphan detection and the stripped-output check - are properties of the file
 * in its place in the tree, which a fixture would not have.
 */
const REPO_ROOT = resolve(__dirname, '../..');

/** A GLSL shader with an entry point, a version line and an engine directive. */
const GLSL_TARGET = 'src/rendering/webgl2/shaders/sprite.vert';
/** A WGSL shader carrying substitution placeholders. */
const WGSL_TARGET = 'src/rendering/webgpu/shaders/text.wgsl';

const backups = new Map<string, string>();

/** Rewrites a tracked shader for the duration of one test. */
const mutate = (file: string, transform: (text: string) => string): void => {
  const path = join(REPO_ROOT, file);

  if (!backups.has(file)) backups.set(file, readFileSync(path, 'utf8'));

  writeFileSync(path, transform(backups.get(file)!), 'utf8');
};

/** Runs the gate; returns its report on failure, or null when it passed. */
const scan = async (): Promise<string | null> => {
  const { problems } = await scanShaderSources();

  return problems.length === 0 ? null : problems.map(formatShaderProblem).join('\n');
};

afterEach(() => {
  for (const [file, text] of backups) {
    writeFileSync(join(REPO_ROOT, file), text, 'utf8');
  }

  backups.clear();
  rmSync(join(REPO_ROOT, 'src/rendering/webgl2/shaders/__orphan-probe.frag'), { force: true });
});

describe('check-shader-sources', () => {
  it('passes over the repository as it stands', async () => {
    expect(await scan()).toBeNull();
  });

  it('rejects a GLSL entry-point shader whose first line is not the version directive', async () => {
    mutate(GLSL_TARGET, text => text.replace('#version 300 es\n', ''));

    expect(await scan()).toContain('line 1 is not');
  });

  it('rejects a #version directive inside WGSL', async () => {
    mutate(WGSL_TARGET, text => `#version 300 es\n${text}`);

    expect(await scan()).toContain('WGSL has no preprocessor');
  });

  it('rejects a placeholder fillShaderSource would never substitute', async () => {
    mutate(WGSL_TARGET, text => text.replace('{{nodeIndexMask}}', '{{ nodeIndexMask }}'));

    expect(await scan()).toContain('does not match the {{NAME}} form');
  });

  it('rejects an unknown engine directive', async () => {
    mutate(GLSL_TARGET, text => text.replace('// #exo-include transform-texture', '// #exo-inclde transform-texture'));

    expect(await scan()).toContain("unknown engine directive '#exo-inclde'");
  });

  it('rejects a tab', async () => {
    mutate(GLSL_TARGET, text => text.replace('#version 300 es\n', '#version 300 es\n//\tnote\n'));

    expect(await scan()).toContain('contains a tab');
  });

  it('rejects trailing whitespace', async () => {
    mutate(GLSL_TARGET, text => text.replace('#version 300 es\n', '#version 300 es \n'));

    expect(await scan()).toContain('has trailing whitespace');
  });

  it('rejects a CR', async () => {
    mutate(GLSL_TARGET, text => text.replace('#version 300 es\n', '#version 300 es\r\n'));

    expect(await scan()).toContain('LF-only');
  });

  it('rejects an empty shader', async () => {
    mutate(GLSL_TARGET, () => '');

    expect(await scan()).toContain('file is empty');
  });

  it('rejects a shader that strips to nothing', async () => {
    // Comment-only: valid text, imported, and completely gone from the shipped
    // bundle. Only the strip-aware check sees it.
    mutate(GLSL_TARGET, () => '// nothing but a comment\n');

    expect(await scan()).toContain('strips to nothing');
  });

  it('rejects an orphan shader nothing imports', async () => {
    const orphan = 'src/rendering/webgl2/shaders/__orphan-probe.frag';

    copyFileSync(join(REPO_ROOT, 'src/rendering/webgl2/shaders/mesh.frag'), join(REPO_ROOT, orphan));

    expect(await scan()).toContain('is not imported by any module');
  });
});
