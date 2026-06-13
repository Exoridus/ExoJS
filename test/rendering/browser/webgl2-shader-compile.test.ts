// Real-shader compile coverage.
//
// The vitest `shaderPlugin` rewrites every `.vert`/`.frag` import to
// `export default ""`, and the other browser specs additionally `vi.mock` the
// shaders with hand-written GLSL — so the engine's ACTUAL shader sources are
// never compiled by the test suite. That blind spot let a GLSL ES 3.00
// reserved-word bug (`sample`) ship undetected: it only surfaced when the
// playground booted on a strict ANGLE/SwiftShader driver.
//
// This spec closes the gap. It pulls the REAL shader text through `?raw`
// imports — the `?raw` query makes the resolved id end in `?raw`, so the
// `.vert`/`.frag` stub plugin skips it — and compiles/links every shader
// against the same SwiftShader driver the WebGL2 browser project runs on. A
// reserved-word (or any other compile) regression now fails right here.

const shaderModules = import.meta.glob('/src/rendering/webgl2/glsl/*.{vert,frag}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type ShaderStage = 'vertex' | 'fragment';

interface ShaderEntry {
  readonly name: string;
  readonly source: string;
  readonly stage: ShaderStage;
}

const shaders: readonly ShaderEntry[] = Object.entries(shaderModules)
  .map(([path, source]) => ({
    name: path.slice(path.lastIndexOf('/') + 1),
    source,
    stage: path.endsWith('.vert') ? 'vertex' : 'fragment',
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const sourceByName: Record<string, string> = Object.fromEntries(shaders.map(entry => [entry.name, entry.source]));

// Vertex/fragment pairs as wired up by the WebGl2*Renderer sources; `text.vert`
// is shared across all three text-fragment variants.
const programPairs: ReadonlyArray<readonly [string, string]> = [
  ['sprite.vert', 'sprite.frag'],
  ['mesh.vert', 'mesh.frag'],
  ['particle.vert', 'particle.frag'],
  ['text.vert', 'text-color.frag'],
  ['text.vert', 'text-sdf.frag'],
  ['text.vert', 'text-msdf.frag'],
  ['stencil-clip.vert', 'stencil-clip.frag'],
  ['mask-compose.vert', 'mask-compose.frag'],
];

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

  test('imports the real shader sources, not the empty-string stub', () => {
    // 8 vertex + 6 fragment files today; the stub would surface as empty strings.
    expect(shaders.length).toBeGreaterThanOrEqual(8);

    for (const { name, source } of shaders) {
      expect(source.length, `${name} is empty — the shader stub leaked into the test`).toBeGreaterThan(0);
      expect(source.startsWith('#version 300 es'), `${name} is missing its #version directive`).toBe(true);
    }
  });

  test.each(shaders)('compiles $name', ({ name, source, stage }) => {
    const { shader, log } = compileShader(gl, stage, source);

    try {
      expect(log, `${name} failed to compile:\n${log ?? ''}`).toBeNull();
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
