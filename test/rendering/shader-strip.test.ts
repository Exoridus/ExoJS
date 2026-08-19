/**
 * The production build ships shader sources with their comments and layout
 * whitespace removed (`@codexo/exojs-build/shader-strip`), because neither
 * Terser nor esbuild descends into a string literal - every comment in a
 * shader would otherwise be payload in every consumer's bundle.
 *
 * Removing text from a source that no test compiles in its stripped form is a
 * way to ship a broken shader silently, so this pins the property that makes
 * the transform safe: the token stream is unchanged. Tokens are recovered here
 * by an independent route (regex comment removal, whitespace split) rather than
 * by the scanner under test, so a bug in that scanner cannot hide itself.
 *
 * The GLSL and WGSL compile suites (`webgl2-shader-compile`,
 * `webgpu-shader-compile`) additionally compile the stripped text on a real
 * driver; this spec is the fast, exhaustive half that covers every shader file
 * in the repository, including those no renderer compiles standalone.
 */
import { stripShaderSource } from '@codexo/exojs-build/shader-strip';
import { describe, expect, test } from 'vitest';

const shaderModules = import.meta.glob(['/src/**/*.{vert,frag,wgsl}', '/packages/exojs-*/src/**/*.{vert,frag,wgsl}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const shaders = Object.entries(shaderModules).sort(([a], [b]) => a.localeCompare(b));

/** Engine directives ride in `//` comments and must survive stripping. */
const DIRECTIVE = /^\s*\/\/\s*#exo-/;

/**
 * Tokenises without the scanner under test: comment lines are dropped whole
 * (keeping directives), block comments become a space, and what remains is
 * split on whitespace.
 */
const tokenize = (source: string): string[] =>
  source
    .replaceAll(/\/\*[\S\s]*?\*\//g, ' ')
    .split('\n')
    .map(line => (DIRECTIVE.test(line) ? line.trim() : line.replace(/\/\/.*$/, '')))
    .join('\n')
    .split(/\s+/)
    .filter(token => token !== '');

describe('shader source stripping', () => {
  test('the repository has shader files to check', () => {
    expect(shaders.length).toBeGreaterThan(20);
  });

  test.each(shaders)('%s keeps its token stream', (_path, source) => {
    expect(tokenize(stripShaderSource(source))).toEqual(tokenize(source));
  });

  test.each(shaders)('%s keeps its directives and first line', (path, source) => {
    const stripped = stripShaderSource(source);

    if (path.endsWith('.vert') || path.endsWith('.frag')) {
      // `#version` is only valid as the first line of a GLSL ES 3.00 source.
      expect(stripped.startsWith('#version 300 es')).toBe(source.startsWith('#version 300 es'));
    }

    const directives = source.split('\n').filter(line => DIRECTIVE.test(line)).length;

    expect(stripped.split('\n').filter(line => DIRECTIVE.test(line))).toHaveLength(directives);
  });

  test('stripping is idempotent', () => {
    for (const [, source] of shaders) {
      const once = stripShaderSource(source);

      expect(stripShaderSource(once)).toBe(once);
    }
  });

  test('a preprocessor directive never absorbs the line below it', () => {
    const stripped = stripShaderSource('#version 300 es\n// gone\n#define A 1 // gone\nfloat a = A;\n');

    expect(stripped).toBe('#version 300 es\n#define A 1\nfloat a = A;');
  });

  test('a block comment between two tokens leaves them separated', () => {
    expect(stripShaderSource('int/*x*/a;')).toBe('int a;');
  });
});
