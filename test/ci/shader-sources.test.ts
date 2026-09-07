// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { formatShaderProblem, scanShaderSources } from '../../scripts/check-shader-sources';

/**
 * Proves `scripts/check-shader-sources.ts` actually fails on each defect it
 * claims to catch, by introducing that defect into a real shader. A hygiene gate
 * that silently matches nothing is worse than no gate: it reports a clean tree
 * either way.
 *
 * The defects go into a copy of the tree, never into the tree itself. Real
 * shaders are what the suite renders with, and its files run in parallel
 * workers - a shader emptied here for one assertion is read in that state by
 * whichever worker loads it next, which surfaces as unrelated renderer failures
 * ("Attribute ... is not available") somewhere else entirely.
 *
 * The copy keeps the properties a fixture written from scratch would not have:
 * the shaders are the real ones, they sit at their real paths, and the module
 * that imports them is copied alongside, so orphan detection and the
 * stripped-output check see what they see in the repository.
 */
const REPO_ROOT = resolve(__dirname, '../..');

/** A GLSL shader with an entry point, a version line and an engine directive. */
const GLSL_TARGET = 'src/rendering/webgl2/shaders/sprite.vert';
/** A WGSL shader carrying substitution placeholders. */
const WGSL_TARGET = 'src/rendering/webgpu/shaders/text.wgsl';

/** Copied wholesale: the shader directories plus the modules that import them. */
const COPIED_DIRECTORIES = ['src/rendering/webgl2/shaders', 'src/rendering/webgpu/shaders'];

let fixtureRoot: string;
const originals = new Map<string, string>();

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'exojs-shader-scan-'));

  for (const directory of COPIED_DIRECTORIES) {
    cpSync(join(REPO_ROOT, directory), join(fixtureRoot, directory), { recursive: true });
  }

  for (const target of [GLSL_TARGET, WGSL_TARGET]) {
    originals.set(target, readFileSync(join(fixtureRoot, target), 'utf8'));
  }

  // Orphan detection matches a shader's basename against the text of every
  // importing module, so the copy needs importers of its own. One module that
  // imports every copied shader keeps every shader non-orphaned, which is the
  // state the repository is in and the baseline each defect is measured from.
  const shaders = [...COPIED_DIRECTORIES.flatMap(directory => shadersIn(join(fixtureRoot, directory), directory))];
  const importerPath = join(fixtureRoot, 'src/importers.ts');

  mkdirSync(dirname(importerPath), { recursive: true });
  writeFileSync(importerPath, shaders.map((file, index) => `import shader${index} from '${file}';`).join('\n') + '\n', 'utf8');
});

afterEach(() => {
  for (const [file, text] of originals) {
    writeFileSync(join(fixtureRoot, file), text, 'utf8');
  }

  rmSync(join(fixtureRoot, 'src/rendering/webgl2/shaders/__orphan-probe.frag'), { force: true });
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

/** Import specifiers for every shader under one copied directory, relative to `src/importers.ts`. */
const shadersIn = (absoluteDirectory: string, repoRelative: string): string[] =>
  readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => `./${repoRelative.slice('src/'.length)}/${entry.name}`);

/** Rewrites a shader in the copied tree for the duration of one test. */
const mutate = (file: string, transform: (text: string) => string): void => {
  writeFileSync(join(fixtureRoot, file), transform(originals.get(file)!), 'utf8');
};

/** Runs the gate over the copied tree; returns its report on failure, or null when it passed. */
const scan = async (root: string = fixtureRoot): Promise<string | null> => {
  const { problems } = await scanShaderSources(root);

  return problems.length === 0 ? null : problems.map(formatShaderProblem).join('\n');
};

describe('check-shader-sources', () => {
  it('passes over the repository as it stands', async () => {
    expect(await scan(REPO_ROOT)).toBeNull();
  });

  it('passes over the copied tree the defect cases start from', async () => {
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

    cpSync(join(fixtureRoot, 'src/rendering/webgl2/shaders/mesh.frag'), join(fixtureRoot, orphan));

    expect(await scan()).toContain('is not imported by any module');
  });
});
