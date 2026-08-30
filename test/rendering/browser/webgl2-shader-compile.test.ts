// Real-shader compile coverage.
//
// The other browser specs `vi.mock` the shaders with hand-written GLSL, so the
// engine's ACTUAL shader sources reach a driver only where a spec renders the
// feature that owns them. That blind spot let a GLSL ES 3.00 reserved-word bug
// (`sample`) ship undetected: it only surfaced when the playground booted on a
// strict ANGLE/SwiftShader driver.
//
// This spec closes it. It pulls every shader's text in through a `?raw` glob,
// which the shader plugin deliberately leaves to Vite, and compiles and links
// all of them against the same SwiftShader driver the WebGL2 browser project
// runs on, in both the authored form and the comment-stripped form the
// production build ships. A reserved-word (or any other compile) regression
// fails right here, on either form, whether or not any spec renders it.

import { stripShaderSource } from '@codexo/exojs-build/shader-strip';

import { fillShaderSource } from '#rendering/shader/fillShaderSource';
import { resolveTransformTextureGlsl } from '#rendering/shader/transformTextureLayout';
import { composeTextAtlasFragmentGlsl } from '#rendering/text/atlasTextureSlots';

import { TILE_DIAGONAL_BIT, TILE_ROW_MASK } from '../../../packages/exojs-tilemap/src/tileWord';

// Core shaders plus the extension packages' own - the particle stage ships
// from `@codexo/exojs-particles`, so a glob over `src/` alone would leave the
// only GLSL outside core uncompiled here.
//
// The filter and custom-material shaders live outside `webgl2/shaders/` and are
// pulled in explicitly. Their browser specs render them, so the authored form
// does reach a driver there; what only this suite compiles is the
// comment-stripped text the production build ships.
const shaderModules = import.meta.glob(
  [
    '/src/rendering/webgl2/shaders/*.{vert,frag}',
    '/src/rendering/filters/shaders/*.{vert,frag}',
    '/src/rendering/sprite/shaders/*.{vert,frag}',
    '/packages/exojs-*/src/**/shaders/*.{vert,frag}',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

type ShaderStage = 'vertex' | 'fragment';

interface ShaderEntry {
  readonly name: string;
  readonly source: string;
  /** Source exactly as the owning renderer submits it to WebGL. */
  readonly runtimeSource: string;
  readonly stage: ShaderStage;
}

// Values for the `{{NAME}}` placeholders a source cannot state for itself,
// keyed by file. Imported from the module that owns each value rather than
// restated here, so a changed constant cannot leave the two out of step.
const placeholderValues: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'tile-chunk.vert': { tileRowMask: TILE_ROW_MASK, tileDiagonalBit: TILE_DIAGONAL_BIT },
};

// `WebGl2ShaderProgram` expands the engine's `#exo-include` directives before
// handing a source to the driver, so a shader that reads the shared transform
// store only compiles in its resolved form - the same form the renderer submits.
const composeRuntimeSource = (name: string, source: string): string => {
  const values = placeholderValues[name];
  const filled = values ? fillShaderSource(source, values) : source;

  return resolveTransformTextureGlsl(name.startsWith('text-') && name.endsWith('.frag') ? composeTextAtlasFragmentGlsl(filled) : filled);
};

const shaders: readonly ShaderEntry[] = Object.entries(shaderModules)
  .map(([path, source]): ShaderEntry => {
    const name = path.slice(path.lastIndexOf('/') + 1);

    return {
      name,
      source,
      runtimeSource: composeRuntimeSource(name, source),
      stage: path.endsWith('.vert') ? 'vertex' : 'fragment',
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const sourceByName: Record<string, string> = Object.fromEntries(shaders.map(entry => [entry.name, entry.runtimeSource]));

// Vertex/fragment pairs as wired up by the renderer sources; `text.vert` is
// shared across all three text-fragment variants, while `particle.*` and
// `ribbon.*` come from the particles package's two render modes. Every file the
// globs pick up must appear here or in `standaloneStages` (guarded below) so a
// dead `.vert`/`.frag` cannot sit in the folder being compiled-but-never-used:
// it has to be wired, declared or removed.
const programPairs: ReadonlyArray<readonly [string, string]> = [
  ['sprite.vert', 'sprite.frag'],
  // Persistent-indexed sprite variant: same fragment stage, slot-fetching vertex stage.
  ['sprite-indexed.vert', 'sprite.frag'],
  ['mesh.vert', 'mesh.frag'],
  ['particle.vert', 'particle.frag'],
  ['ribbon.vert', 'ribbon.frag'],
  ['text.vert', 'text-color.frag'],
  ['text.vert', 'text-sdf.frag'],
  ['text.vert', 'text-msdf.frag'],
  ['nine-slice.vert', 'nine-slice.frag'],
  // Both repeating-sprite vertex paths (one quad per sprite, N quads per sprite)
  // link against the same fragment stage.
  ['repeating-sprite-shader-path.vert', 'repeating-sprite.frag'],
  ['repeating-sprite-geo-path.vert', 'repeating-sprite.frag'],
  ['tile-chunk.vert', 'tile-chunk.frag'],
  ['stencil-clip.vert', 'stencil-clip.frag'],
  ['mask-compose.vert', 'mask-compose.frag'],
  ['backdrop-blend.vert', 'backdrop-blend.frag'],
  // The built-in filters: one pass-through fullscreen-quad vertex stage, three
  // fragment stages, exactly as `ShaderFilter` assembles them.
  ['default-vertex.vert', 'color-matrix.frag'],
  ['default-vertex.vert', 'lut-3d.frag'],
  ['default-vertex.vert', 'lut-rgb1d.frag'],
];

const referencedShaderFiles = new Set(programPairs.flat());

// Engine-owned stages whose counterpart is supplied by the application, so no
// fixed program exists to link here. They still get the coverage a standalone
// stage can have - `gl.compileShader` on the authored text and on the
// production-stripped text - from the two compile cases above; only the link
// case has no meaning for them. An entry is a claim that the missing half is
// the caller's, not that the stage is untested.
const standaloneStages: ReadonlyMap<string, string> = new Map([
  ['sprite-material.vert', 'the custom SpriteMaterial path takes its fragment stage from the application'],
]);

interface CompiledShader {
  readonly shader: WebGLShader;
  readonly log: string | null;
}

const compileShader = (gl: WebGL2RenderingContext, stage: ShaderStage, source: string): CompiledShader => {
  const shader = gl.createShader(stage === 'vertex' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);

  if (shader === null) {
    throw new Error(`gl.createShader returned null for a ${stage} shader`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;

  return { shader, log: compiled ? null : (gl.getShaderInfoLog(shader) ?? '<no info log>') };
};

describe('WebGL2 GLSL shader sources', () => {
  let canvas: HTMLCanvasElement;
  let gl: WebGL2RenderingContext;

  beforeAll(() => {
    canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;

    const context = canvas.getContext('webgl2');

    if (!context) {
      throw new Error('A WebGL2 context is required for the shader compile suite.');
    }

    gl = context;
  });

  test('imports the real shader sources', () => {
    // A loader that returned a placeholder instead of the file would surface
    // here as empty strings rather than as a driver error further down.
    expect(shaders.length).toBeGreaterThanOrEqual(8);

    for (const { name, source } of shaders) {
      expect(source.length, `${name} is empty — the shader text did not reach the test`).toBeGreaterThan(0);
      expect(source.startsWith('#version 300 es'), `${name} is missing its #version directive`).toBe(true);
    }
  });

  test('every shader file is accounted for (paired, or standalone with a reason)', () => {
    // Guards against re-introducing an orphan .vert/.frag that the glob would
    // otherwise compile while no renderer ever uses it. A stage with no
    // engine-owned counterpart has to say so rather than simply not appear.
    for (const { name } of shaders) {
      expect(
        referencedShaderFiles.has(name) || standaloneStages.has(name),
        `${name} is neither in a program pair nor declared standalone — wire it up, declare it, or delete it`,
      ).toBe(true);
    }
  });

  test('every declared standalone stage still exists and carries a reason', () => {
    // Keeps the exemption list from outliving the file it exempts.
    for (const [name, reason] of standaloneStages) {
      expect(sourceByName[name], `${name} is declared standalone but no longer exists`).toBeDefined();
      expect(reason.trim().length, `${name} needs a reason`).toBeGreaterThan(0);
      expect(referencedShaderFiles.has(name), `${name} is declared standalone but is also in a program pair`).toBe(false);
    }
  });

  test.each(shaders)('compiles $name', ({ name, runtimeSource, stage }) => {
    const { shader, log } = compileShader(gl, stage, runtimeSource);

    try {
      expect(log, `${name} failed to compile:\n${log ?? ''}`).toBeNull();
    } finally {
      gl.deleteShader(shader);
    }
  });

  // The production build ships these sources comment-stripped (see
  // `shader-strip.test.ts` for the property that makes that safe); this is the
  // half that puts the stripped text in front of a real driver.
  test.each(shaders)('compiles $name (stripped)', ({ name, source, stage }) => {
    const { shader, log } = compileShader(gl, stage, composeRuntimeSource(name, stripShaderSource(source)));

    try {
      expect(
        log,
        `stripped ${name} failed to compile:
${log ?? ''}`,
      ).toBeNull();
    } finally {
      gl.deleteShader(shader);
    }
  });

  test.each(programPairs)('links %s + %s', (vertName, fragName) => {
    const vertSource = sourceByName[vertName];
    const fragSource = sourceByName[fragName];

    expect(vertSource, `${vertName} is missing`).toBeDefined();
    expect(fragSource, `${fragName} is missing`).toBeDefined();

    const vertex = compileShader(gl, 'vertex', vertSource);
    const fragment = compileShader(gl, 'fragment', fragSource);
    const program = gl.createProgram();

    if (program === null) {
      throw new Error('gl.createProgram returned null');
    }

    try {
      expect(vertex.log, `${vertName} failed to compile:\n${vertex.log ?? ''}`).toBeNull();
      expect(fragment.log, `${fragName} failed to compile:\n${fragment.log ?? ''}`).toBeNull();

      gl.attachShader(program, vertex.shader);
      gl.attachShader(program, fragment.shader);
      gl.linkProgram(program);

      const linked = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
      const log = linked ? null : (gl.getProgramInfoLog(program) ?? '<no info log>');

      expect(log, `${vertName} + ${fragName} failed to link:\n${log ?? ''}`).toBeNull();
    } finally {
      gl.deleteShader(vertex.shader);
      gl.deleteShader(fragment.shader);
      gl.deleteProgram(program);
    }
  });

  test('text-color.frag avoids the GLSL ES 3.00 reserved word "sample"', () => {
    const source = sourceByName['text-color.frag'];

    expect(source, 'text-color.frag is missing').toBeDefined();
    // `sample` is reserved in GLSL ES 3.00; a local variable named `sample` is
    // rejected by strict drivers. Match a typed declaration so comments or
    // unrelated identifiers (e.g. `sampleColor`) don't trip the guard.
    expect(/\b(?:float|int|uint|bool|vec[234]|mat[234]|ivec[234]|uvec[234])\s+sample\b/.test(source)).toBe(false);
  });
});
