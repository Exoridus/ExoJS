// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Pins what `scripts/check-inline-source.ts` treats as executable source in a
 * string, against the two mistakes a marker-based scanner makes: missing a real
 * module, and flagging a string that merely mentions one of its markers.
 *
 * The rejected cases are the shapes this repository actually migrated away
 * from - a worker built by a `buildWorkerSource`-style function, an AudioWorklet
 * processor as a template-string constant, a GLSL shader in a TypeScript
 * literal. Each must make the gate exit non-zero; that is the regression proof
 * the migration is worth nothing without.
 *
 * The scanner runs as a subprocess rather than being imported, because importing
 * it runs it: the CLI body is top-level. That also tests the exit code, which is
 * what the gate is.
 */
const REPO_ROOT = resolve(__dirname, '../..');
const SCANNER = 'scripts/check-inline-source.ts';
const TSX_CLI = join('node_modules', 'tsx', 'dist', 'cli.mjs');
const FIXTURE_DIRECTORY = 'test/ci/inline-source-fixtures';
/**
 * Shader detection is scoped to engine-owned code, so a shader fixture only
 * proves anything from inside that scope. It lives under `src/` for the duration
 * of the run and is removed again; the name says what it is to anyone who finds
 * one left behind by an interrupted run.
 */
const SHADER_FIXTURE_DIRECTORY = 'src/__inline-source-fixtures__';

/** Strings that name a marker without being a module, and must stay silent. */
const ACCEPTED: Readonly<Record<string, string>> = {
  'prose-about-worklets': "export const hint = 'Call registerProcessor(name, ctor) at the end of your worklet module, once it is authored.';",
  'error-message': "export const message = 'self.postMessage() is unavailable: this code is not running inside a Worker global scope at all.';",
  'short-literal': "export const marker = 'self.onmessage = handler;';",
  'wgsl-identifier-in-prose': "export const note = 'The @fragment entry point is supplied by the material author, not by the engine, in every backend.';",
};

/** Strings that are a module the repository would otherwise be maintaining as text. */
const REJECTED: Readonly<Record<string, string>> = {
  'legacy-worker-builder': [
    'export function buildWorkerSource(seed) {',
    '  return `',
    'function sample(x, y) { return (x * seed) ^ y; }',
    'self.onmessage = (event) => {',
    '  const { requestId, cx, cy } = event.data;',
    '  self.postMessage({ requestId, value: sample(cx, cy) });',
    '};',
    '`;',
    '}',
  ].join('\n'),
  'legacy-worklet-constant': [
    'export const gainWorkletSource = `',
    'class GainProcessor extends AudioWorkletProcessor {',
    '  process(inputs, outputs) {',
    '    return true;',
    '  }',
    '}',
    "registerProcessor('gain', GainProcessor);",
    '`;',
  ].join('\n'),
  'inline-glsl': [
    'export const fragment = `#version 300 es',
    'precision mediump float;',
    'out vec4 fragColor;',
    'void main() { fragColor = vec4(1.0, 0.0, 0.0, 1.0); }',
    '`;',
  ].join('\n'),
  'inline-wgsl': [
    'export const shader = `',
    '@fragment',
    'fn fragmentMain() -> @location(0) vec4<f32> {',
    '  return vec4<f32>(1.0, 1.0, 1.0, 1.0);',
    '}',
    '`;',
  ].join('\n'),
};

/** Cases whose fixture has to sit inside the engine-owned shader scope. */
const SHADER_CASES = new Set(['inline-glsl', 'inline-wgsl', 'wgsl-identifier-in-prose']);

/** Repo-relative path of a fixture, keyed by case name. */
const fixturePath = (name: string): string => `${SHADER_CASES.has(name) ? SHADER_FIXTURE_DIRECTORY : FIXTURE_DIRECTORY}/${name}.ts`;

/** Runs the scanner over one fixture; returns its combined output, or null when it passed. */
function scan(name: string): string | null {
  try {
    execFileSync('node', [TSX_CLI, SCANNER, fixturePath(name)], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });

    return null;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };

    return `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
  }
}

beforeAll(() => {
  mkdirSync(join(REPO_ROOT, FIXTURE_DIRECTORY), { recursive: true });
  mkdirSync(join(REPO_ROOT, SHADER_FIXTURE_DIRECTORY), { recursive: true });

  for (const [name, body] of Object.entries({ ...ACCEPTED, ...REJECTED })) {
    writeFileSync(join(REPO_ROOT, fixturePath(name)), `${body}\n`, 'utf8');
  }
});

afterAll(() => {
  rmSync(join(REPO_ROOT, FIXTURE_DIRECTORY), { recursive: true, force: true });
  rmSync(join(REPO_ROOT, SHADER_FIXTURE_DIRECTORY), { recursive: true, force: true });
});

describe('check-inline-source', () => {
  it.each(Object.keys(ACCEPTED))('accepts %s', name => {
    expect(scan(name), `${name} should not have been reported`).toBeNull();
  });

  it.each(Object.keys(REJECTED))('rejects %s', name => {
    const output = scan(name);

    expect(output, `${name} should have failed the gate`).not.toBeNull();
    expect(output).toContain(fixturePath(name));
  });

  it('leaves a shader string outside engine-owned code alone', () => {
    // The same literal that fails under `src/` is the public ShaderFilter API
    // when an example or a test writes it.
    writeFileSync(join(REPO_ROOT, FIXTURE_DIRECTORY, 'consumer-shader.ts'), `${REJECTED['inline-wgsl']!}\n`, 'utf8');

    expect(scan('consumer-shader')).toBeNull();
  });
});
