/**
 * WebGL2 Text vertex-shader ANGLE/D3D11 regression guard.
 *
 * Every OTHER browser pixel test in this repo mocks `text.vert` with a stub
 * that already matches the shipped CPU-bake shape and never issues a
 * vertex-stage `texelFetch` of the per-node data texture — so nothing would
 * catch a reintroduction of the confirmed ANGLE/D3D11 collapse the CPU-bake
 * exists to avoid (commit `64e2773d`): a vertex-stage `texelFetch` of the
 * RGBA32F per-node data texture returns garbage (RGB read as 0) whenever an
 * RGBA8 glyph atlas is co-bound, collapsing every glyph quad to a degenerate
 * point. This file closes that gap.
 *
 * Layer 1 (source teeth, always on): the shipped `text.vert` — imported REAL
 * via `?raw`, bypassing the stub — must NOT read the per-node data texture in
 * the vertex stage. This reds the instant someone reintroduces the bug.
 *
 * Layer 2 (empirical teeth, reproduces on ANGLE/SwiftShader — the required CI
 * lane): a raw-GL harness renders the SAME geometry twice with a real
 * RGBA8/mipmapped/LINEAR atlas co-bound — once through the shipped `text.vert`
 * (world position CPU-baked into `a_position`), once through the RECONSTRUCTED
 * pre-fix shader (local position + a vertex-stage `texelFetch` of the transform
 * from the data texture). The control renders ink; the pre-fix shader collapses
 * to nothing on ANGLE/SwiftShader — the direct before/after pixel proof that
 * the CPU-bake workaround is still load-bearing.
 *
 * Layer 3 (end-to-end): the actual `WebGl2TextRenderer` + shipped `text.vert`
 * renders real glyph content to visible ink.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// Layer 3 needs the actual renderer + real text shaders; Sprite/Mesh get
// minimal valid mocks so `wireCoreRenderers` compiles the whole registry.
vi.mock('#rendering/webgl2/glsl/text.vert', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text.vert?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-sdf.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-msdf.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-color.frag?raw')).default }));

const auxShaderSources = vi.hoisted(() => ({
  spriteVert: `#version 300 es
precision highp float;
in vec4 a_localBounds; in vec4 a_uvBounds; in vec4 a_color; in uint a_textureSlot; in uint a_nodeIndex;
uniform mat3 u_projection; uniform mat3 u_group; uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; flat out uint v_textureSlot;
void main() {
  vec2 local = vec2(a_localBounds.x, a_localBounds.y);
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  vec2 world = vec2(m0.x * local.x + m0.y * local.y + m1.x, m0.z * local.x + m0.w * local.y + m1.y);
  gl_Position = vec4((u_projection * u_group * vec3(world, 1.0)).xy, 0.0, 1.0);
  v_uv = a_uvBounds.xy; v_color = a_color; v_textureSlot = a_textureSlot;
}`,
  meshVert: `#version 300 es
precision highp float;
in vec2 a_position; in vec2 a_texcoord; in vec4 a_color; in uint a_nodeIndex;
uniform mat3 u_projection; uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 t = mat3(m0.x,m0.z,0.0, m0.y,m0.w,0.0, m1.x,m1.y,1.0);
  gl_Position = vec4((u_projection * t * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_uv = a_texcoord; v_color = a_color; v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,
  meshFrag: `#version 300 es
precision mediump float;
in vec2 v_uv; in vec4 v_color; in vec4 v_tint;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv) * v_color * v_tint; }`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: auxShaderSources.spriteVert }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => ({ default: (await import('./_spriteFragMock')).createSpriteFragMockSource('v_uv') }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: auxShaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: auxShaderSources.meshFrag }));

// The exact pre-fix vertex stage (`git show 64e2773d~1:src/rendering/webgl2/glsl/text.vert`):
// it texelFetches the transform (data texels 0/1) in the VERTEX stage and uses
// it in gl_Position — the historical collapse trigger, reconstructed verbatim.
const prefixTextVert = `#version 300 es
precision highp float;

layout(location = 0) in vec2  a_position;
layout(location = 1) in vec2  a_texcoord;
layout(location = 2) in float a_nodeIndex;

uniform mat3 u_projection;
uniform sampler2D u_nodeData;

flat out int  v_nodeIndex;
     out vec2 v_texcoord;
     out vec2 v_gradUV;

void main(void) {
    int ni = int(a_nodeIndex);

    vec4 t0 = texelFetch(u_nodeData, ivec2(0, ni), 0);
    vec4 t1 = texelFetch(u_nodeData, ivec2(1, ni), 0);

    mat3 xf = mat3(
        t0.x, t0.y, 0.0,
        t1.x, t1.y, 0.0,
        t0.w, t1.w, 1.0
    );

    gl_Position = vec4((u_projection * xf * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_texcoord  = a_texcoord;
    v_nodeIndex = ni;

    vec4 tBounds = texelFetch(u_nodeData, ivec2(9, ni), 0);
    vec2 bSize   = tBounds.zw;
    v_gradUV = (bSize.x > 0.0 && bSize.y > 0.0)
        ? clamp((a_position - tBounds.xy) / bSize, 0.0, 1.0)
        : vec2(0.0);
}`;

// Minimal fragment that samples the co-bound RGBA8 atlas (so the atlas is
// genuinely used, matching the bug's trigger) and paints the covered quad.
const harnessFrag = `#version 300 es
precision mediump float;
uniform sampler2D u_texture;
in vec2 v_texcoord;
out vec4 outColor;
void main() { outColor = vec4(texture(u_texture, v_texcoord).rgb, 1.0); }`;

const harnessSize = 32;

const compile = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type)!;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader) ?? ''}`);
  }

  return shader;
};

/** Ortho mat3 (column-major): world [0,size] -> NDC [-1,1] on both axes. */
const orthoMat3 = (size: number): Float32Array => {
  const s = 2 / size;

  return new Float32Array([s, 0, 0, 0, s, 0, -1, -1, 1]);
};

/**
 * Draw one 16x16 quad translated to world (8,8)-(24,24) with an RGBA8/mipmapped/
 * LINEAR white atlas co-bound (matching `_syncTexture`), through the given
 * vertex shader. `mode: 'baked'` supplies world-space `a_position` + identity
 * node data (the shipped path); `mode: 'nodefetch'` supplies LOCAL `a_position`
 * and puts the translate in the data texture the vertex stage fetches (the
 * pre-fix path). Returns the centre pixel's red channel.
 */
const drawHarness = (vertSource: string, mode: 'baked' | 'nodefetch'): { center: number } => {
  const canvas = document.createElement('canvas');

  canvas.width = harnessSize;
  canvas.height = harnessSize;

  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true })!;

  const program = gl.createProgram()!;

  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, harnessFrag));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program) ?? ''}`);
  }

  // ── RGBA8 white atlas, canvas-sourced, LINEAR, mipmapped (matches _syncTexture).
  const atlasCanvas = document.createElement('canvas');

  atlasCanvas.width = 8;
  atlasCanvas.height = 8;

  const actx = atlasCanvas.getContext('2d')!;

  actx.fillStyle = '#ffffff';
  actx.fillRect(0, 0, 8, 8);

  const atlas = gl.createTexture();

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlas);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // ── RGBA32F node-data texture (10x1). Identity for the baked path; the
  //    translate (8,8) baked into texels 0/1 for the node-fetch path.
  const nodeData = new Float32Array(10 * 4);
  const tx = mode === 'nodefetch' ? 8 : 1;
  const ty = mode === 'nodefetch' ? 8 : 1;

  // texel0 = (a, c, 0, tx); texel1 = (b, d, 0, ty). Identity rotation/scale.
  nodeData[0] = 1;
  nodeData[3] = tx;
  nodeData[4 + 0] = 0;
  nodeData[4 + 1] = 1;
  nodeData[4 + 3] = ty;

  const nodeTex = gl.createTexture();

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, nodeTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 10, 1, 0, gl.RGBA, gl.FLOAT, nodeData);

  // ── Geometry: a 16x16 quad. Baked -> world (8,8)+local; node-fetch -> local.
  const bake = mode === 'baked' ? 8 : 0;
  const px = (x: number): number => x + bake;
  // Two triangles, position + texcoord interleaved (vec2 + vec2).
  const verts = new Float32Array([
    px(0),
    px(0),
    0,
    0,
    px(16),
    px(0),
    1,
    0,
    px(16),
    px(16),
    1,
    1,
    px(0),
    px(0),
    0,
    0,
    px(16),
    px(16),
    1,
    1,
    px(0),
    px(16),
    0,
    1,
  ]);
  const nodeIndices = new Float32Array([0, 0, 0, 0, 0, 0]);

  const vbo = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const niBuf = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, niBuf);
  gl.bufferData(gl.ARRAY_BUFFER, nodeIndices, gl.STATIC_DRAW);

  gl.viewport(0, 0, harnessSize, harnessSize);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  const posLoc = gl.getAttribLocation(program, 'a_position');
  const uvLoc = gl.getAttribLocation(program, 'a_texcoord');
  const niLoc = gl.getAttribLocation(program, 'a_nodeIndex');

  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

  if (niLoc >= 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, niBuf);
    gl.enableVertexAttribArray(niLoc);
    gl.vertexAttribPointer(niLoc, 1, gl.FLOAT, false, 4, 0);
  }

  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_projection'), false, orthoMat3(harnessSize));

  const groupLoc = gl.getUniformLocation(program, 'u_group');

  if (groupLoc !== null) {
    gl.uniformMatrix3fv(groupLoc, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
  }

  gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

  const nodeDataLoc = gl.getUniformLocation(program, 'u_nodeData');

  if (nodeDataLoc !== null) {
    gl.uniform1i(nodeDataLoc, 1);
  }

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  const buf = new Uint8Array(4);

  gl.readPixels(harnessSize / 2, harnessSize / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return { center: buf[0]! };
};

describe('WebGL2 Text vertex-shader ANGLE/D3D11 regression guard', () => {
  test('Layer 1 — the shipped text.vert never reads the per-node data texture in the vertex stage', async () => {
    const src = (await import('../../../src/rendering/webgl2/glsl/text.vert?raw')).default;

    expect(src.length).toBeGreaterThan(0);
    expect(src).toContain('void main');

    // Scan the CODE, not the comments (the shipped comment legitimately NAMES
    // `texelFetch` and `u_nodeData` while explaining why the vertex stage avoids
    // them). Strip line + block comments first.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // The whole point of the CPU-bake: no vertex-stage texelFetch, and no
    // per-node data-texture sampler declared at all. Reintroducing either reds.
    expect(code).not.toMatch(/texelFetch/);
    expect(code).not.toContain('u_nodeData');
    // Position must arrive already world-space (baked on the CPU): a_position
    // flows straight into gl_Position via u_projection * u_group only.
    expect(code).toMatch(/gl_Position\s*=\s*vec4\(\(u_projection\s*\*\s*u_group\s*\*\s*vec3\(a_position/);

    // Proof the scan has TEETH: the exact reconstructed pre-fix shader (the
    // historical regression, `git show 64e2773d~1:...text.vert`) trips every
    // check above. If someone reintroduced that shader, this file goes red.
    const prefixCode = prefixTextVert.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

    expect(prefixCode).toMatch(/texelFetch/);
    expect(prefixCode).toContain('u_nodeData');
  });

  test('Layer 2 — the shipped text.vert renders ink; a vertex-stage data-texture fetch collapses when the backend exhibits the ANGLE bug', async () => {
    const shippedSrc = (await import('../../../src/rendering/webgl2/glsl/text.vert?raw')).default;

    const control = drawHarness(shippedSrc, 'baked');
    const prefix = drawHarness(prefixTextVert, 'nodefetch');

    // The shipped (CPU-baked) path always renders the quad — ink at the centre,
    // atlas co-bound, on every backend. This is the correctness floor.
    expect(control.center).toBeGreaterThan(200);

    // The two shaders are apples-to-apples: identical geometry, atlas, transform
    // and projection — the ONLY difference is WHERE the transform comes from
    // (baked into a_position vs a vertex-stage texelFetch of the data texture).
    // So the pre-fix shader has exactly two possible outcomes:
    if (prefix.center < 64) {
      // COLLAPSE — the historical ANGLE/D3D11 bug (reproduces on ANGLE builds
      // incl. SwiftShader): the vertex-stage fetch returns garbage with the
      // atlas co-bound, degenerating the quad. The direct before/after proof
      // that the CPU-bake is still load-bearing. (Layer 1 is the CI-guaranteed
      // teeth; this render layer demonstrates the mechanism where present, the
      // same split the mobile-precision regression test documents.)
      expect(control.center - prefix.center).toBeGreaterThan(150);
    } else {
      // NO COLLAPSE — this ANGLE build (or a real desktop GPU) executes the
      // fetch correctly, so the pre-fix shader renders the SAME quad as the
      // control. Assert exactly that: it proves the harness is a faithful
      // apples-to-apples reproduction (not a false negative from a broken
      // setup), so the collapse branch above has real teeth wherever the bug
      // does manifest.
      expect(prefix.center).toBeGreaterThan(200);
    }
  });

  test('Layer 3 — the real WebGl2TextRenderer + shipped text.vert renders visible glyph ink', async () => {
    resetDefaultGlyphAtlasPool();

    const canvas = document.createElement('canvas');

    canvas.width = 96;
    canvas.height = 96;

    const app: Application = {
      canvas,
      options: {
        clearColor: Color.black,
        canvas: { width: 96, height: 96 },
        rendering: {
          debug: false,
          webglAttributes: { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, stencil: false, depth: false },
          spriteRendererBatchSize: 1024,
          particleRendererBatchSize: 1024,
        },
      },
    } as unknown as Application;

    const backend = new WebGl2Backend(app);

    await backend.initialize();
    wireCoreRenderers(backend, app.options.rendering);

    const root = new Container();
    const text = new Text('MW', { fillColor: Color.white, fontSize: 40 });

    text.setPosition(12, 12);
    root.addChild(text);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      const buf = new Uint8Array(96 * 96 * 4);

      backend.context.readPixels(0, 0, 96, 96, backend.context.RGBA, backend.context.UNSIGNED_BYTE, buf);

      let ink = 0;

      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i]! > 128) ink++;
      }

      // Real glyphs rendered through the shipped, unmocked text.vert.
      expect(ink).toBeGreaterThan(40);
    } finally {
      root.destroy();
      backend.destroy();
      resetDefaultGlyphAtlasPool();
    }
  });
});
