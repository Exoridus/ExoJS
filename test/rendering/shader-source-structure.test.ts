// Structural GLSL integrity - the jsdom counterpart to
// `test/rendering/browser/webgl2-shader-compile.test.ts`.
//
// jsdom has no WebGL2 context, so this project cannot compile/link shaders the
// way the browser lanes do - that gap is intentional and stays covered there.
// What jsdom CAN and, until now, did not check: that `.vert`/`.frag` imports
// resolve to the real shipped source at all. `shaderStubPlugin` rewrites every
// `.vert`/`.frag` import to `export default ""` in most jsdom projects; the
// `exojs` and `exojs-particles` projects (see `vitest.config.ts`) now use
// `realShaderPlugin` instead, but a `?raw` import bypasses either plugin, so
// this spec verifies the actual files on disk independent of that wiring. A
// corrupted or truncated shader - one that would silently pass in a
// stub-blanked lane - fails a purely textual check here without needing a GPU.
import { describe, expect, test } from 'vitest';

// Same glob as the browser compile suite: core WebGL2 GLSL plus every
// extension package's own (currently only `@codexo/exojs-particles`).
const shaderModules = import.meta.glob(['/src/rendering/webgl2/shaders/*.{vert,frag}', '/packages/exojs-*/src/**/shaders/*.{vert,frag}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface ShaderEntry {
  readonly name: string;
  readonly source: string;
}

const shaders: readonly ShaderEntry[] = Object.entries(shaderModules)
  .map(([path, source]) => ({ name: path.slice(path.lastIndexOf('/') + 1), source }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Strips GLSL line/block comments so bracket counting ignores commented-out code. */
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const BRACKET_CLOSERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const BRACKET_OPENERS = new Set(Object.keys(BRACKET_CLOSERS));
const BRACKET_CLOSER_CHARS = new Set(Object.values(BRACKET_CLOSERS));

/**
 * Returns `null` when every `()`/`[]`/`{}` in `source` is balanced and
 * correctly nested, otherwise a short description of the first mismatch.
 * A stack-based check catches truncation and copy/paste corruption without
 * parsing GLSL: a "what the code hands us" structural gate with no GLSL parser
 * dependency.
 */
const findBracketMismatch = (source: string): string | null => {
  const stack: string[] = [];

  for (const char of stripComments(source)) {
    if (BRACKET_OPENERS.has(char)) {
      stack.push(char);
    } else if (BRACKET_CLOSER_CHARS.has(char)) {
      const open = stack.pop();

      if (open === undefined || BRACKET_CLOSERS[open] !== char) {
        return open === undefined ? `unexpected '${char}' with no matching opener` : `expected '${BRACKET_CLOSERS[open]}' but found '${char}'`;
      }
    }
  }

  return stack.length > 0 ? `unclosed '${stack[stack.length - 1]}'` : null;
};

describe('WebGL2 GLSL shader sources — structural integrity (jsdom, no GPU)', () => {
  test('discovers the real shader sources, not the empty-string stub', () => {
    // 14 core + 5 particle files as of writing; the stub plugin (or a broken
    // glob) would either surface as empty strings below or drop this to 0.
    expect(shaders.length).toBeGreaterThanOrEqual(8);
  });

  test.each(shaders)('$name is non-empty, versioned GLSL ES 3.00 with a main entry point', ({ name, source }) => {
    expect(source.length, `${name} is empty — a shader stub leaked into this check`).toBeGreaterThan(0);
    expect(source.startsWith('#version 300 es'), `${name} is missing its #version 300 es directive`).toBe(true);
    expect(/\bvoid\s+main\s*\(/.test(source), `${name} has no 'void main(' entry point`).toBe(true);
  });

  test.each(shaders)('$name has balanced brackets', ({ name, source }) => {
    expect(findBracketMismatch(source), `${name} has a bracket mismatch`).toBeNull();
  });
});
