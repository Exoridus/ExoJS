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

/**
 * What a file contributes to the program it ends up in. A whole stage opens
 * the program with the version directive and carries its entry point; a chunk
 * supplies one of the two, or neither, and the builder that composes it
 * supplies the rest.
 */
interface ChunkRole {
  /** Whether the composed source starts with this file, and so with its directive. */
  readonly opens: boolean;
  /** Whether the composed program takes `void main()` from this file. */
  readonly entry: boolean;
  readonly reason: string;
}

/**
 * The files no backend compiles on their own. Anything absent from this map is
 * held to the whole-stage contract, so a new chunk fails this suite until it
 * is named and the composition it belongs to is written down.
 *
 * A vertex stage built on the instanced-batch contract is recognised without
 * being listed: `INSTANCE_TRANSFORM_GLSL` is documented as going between the
 * version directive and the body, and calling `exoInstanceClipPosition` is
 * that contract's own marker.
 */
const CHUNKS: ReadonlyMap<string, ChunkRole> = new Map([
  [
    'transport-filter.frag',
    { opens: true, entry: false, reason: "the preamble the transport filters share; the walked textures' bindings are appended to it" },
  ],
  ['transport.frag', { opens: false, entry: false, reason: 'the transport operator itself: functions, spliced into every shader that walks' }],
  ['cascade-transport.frag', { opens: false, entry: true, reason: 'one cascade level, composed onto the preamble and the operator' }],
  ['cascade-gather-transport.frag', { opens: false, entry: true, reason: 'the receiver reconstruction, composed onto the preamble and the operator' }],
]);

interface ShaderEntry {
  readonly name: string;
  readonly source: string;
  /** How this file reaches a program, or `undefined` for a whole stage. */
  readonly role: ChunkRole | undefined;
}

const shaders: readonly ShaderEntry[] = Object.entries(shaderModules)
  .map(([path, source]) => ({
    name: path.slice(path.lastIndexOf('/') + 1),
    source,
    role: source.includes('exoInstanceClipPosition(')
      ? { opens: false, entry: true, reason: 'a vertex stage on the instanced-batch contract, which is spliced under the directive' }
      : CHUNKS.get(path.slice(path.lastIndexOf('/') + 1)),
  }))
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

  test.each(shaders)('$name is non-empty GLSL ES 3.00 with a main entry point', ({ name, source, role }) => {
    expect(source.length, `${name} is empty — a shader stub leaked into this check`).toBeGreaterThan(0);
    // Both directions: a whole stage that lost its directive or its entry point
    // fails, and so does a chunk that grew one it must not have.
    const hasDirective = source.startsWith('#version 300 es');
    const hasEntry = /\bvoid\s+main\s*\(/.test(source);

    if (role === undefined) {
      expect(hasDirective, `${name} is missing its #version 300 es directive`).toBe(true);
      expect(hasEntry, `${name} has no 'void main(' entry point`).toBe(true);
    } else {
      expect(
        hasDirective,
        `${name} ${role.opens ? 'opens its composition and needs the directive' : 'is composed under a directive and must carry none'}`,
      ).toBe(role.opens);
      expect(
        hasEntry,
        `${name} ${role.entry ? 'supplies the entry point of its composition' : 'is composed beside an entry point and must declare none'}`,
      ).toBe(role.entry);
    }
  });

  test('every chunk named still exists and carries a reason', () => {
    for (const [name, role] of CHUNKS) {
      expect(
        shaders.some(shader => shader.name === name),
        `${name} is named as a chunk but no longer exists`,
      ).toBe(true);
      expect(role.reason.trim().length, `${name} needs a reason`).toBeGreaterThan(0);
    }
  });

  test.each(shaders)('$name has balanced brackets', ({ name, source }) => {
    expect(findBracketMismatch(source), `${name} has a bracket mismatch`).toBeNull();
  });
});
