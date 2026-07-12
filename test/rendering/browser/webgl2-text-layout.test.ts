import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the backend compiles on `initialize()` must be mocked
// with valid sources. The sprite/mesh/particle sources mirror the gradient test
// (every default renderer extracts its declared attributes on connect).
//
// What this test validates: that a *real* WebGl2Backend, with a *real* GlyphAtlas
// (real canvas SDF rasterization, real font metrics), runs the Text collect →
// flush → draw path without error in-browser, and that the geometry the layout
// engine produces is structurally correct — glyphs separated horizontally and
// wrapped text split across vertical line bands. The structural claims are
// asserted on the deterministic per-glyph quad geometry (`Text.pageQuads`) rather
// than on read-back pixels: the text renderer drives texture units with raw GL
// calls that bypass the backend's unit cache, which only a full multi-renderer
// frame primes — reproducing that choreography in an isolated single-draw harness
// is brittle and unrelated to the layout behaviour under test. Asserting on the
// real-atlas geometry also avoids any dependence on exact font rasterization.
const shaderSources = vi.hoisted(() => ({
  spriteVertexSource: `#version 300 es
precision mediump float;
in vec4 a_localBounds;
in vec4 a_uvBounds;
in vec4 a_color;
in uint a_textureSlot;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_uv;
out vec4 v_color;
flat out uint v_textureSlot;
void main() {
  vec2 local;
  if (gl_VertexID == 0) local = vec2(a_localBounds.x, a_localBounds.y);
  else if (gl_VertexID == 1) local = vec2(a_localBounds.z, a_localBounds.y);
  else if (gl_VertexID == 2) local = vec2(a_localBounds.x, a_localBounds.w);
  else local = vec2(a_localBounds.z, a_localBounds.w);

  vec2 uv;
  if (gl_VertexID == 0) uv = vec2(a_uvBounds.x, a_uvBounds.y);
  else if (gl_VertexID == 1) uv = vec2(a_uvBounds.z, a_uvBounds.y);
  else if (gl_VertexID == 2) uv = vec2(a_uvBounds.x, a_uvBounds.w);
  else uv = vec2(a_uvBounds.z, a_uvBounds.w);

  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  vec2 world = vec2(m0.x * local.x + m0.y * local.y + m1.x, m0.z * local.x + m0.w * local.y + m1.y);
  vec3 clip = u_projection * vec3(world, 1.0);

  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = uv;
  v_color = texelFetch(u_transforms, ivec2(2, int(a_nodeIndex)), 0);
  v_textureSlot = a_textureSlot;
}`,

  meshVertexSource: `#version 300 es
precision lowp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
layout(location = 6) in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_texcoord;
out vec4 v_color;
void main(void) {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 transform = mat3(m0.x, m0.z, 0.0, m0.y, m0.w, 0.0, m1.x, m1.y, 1.0);
  gl_Position = vec4((u_projection * transform * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_texcoord = a_texcoord;
  v_color = a_color;
}`,

  meshFragmentSource: `#version 300 es
precision lowp float;
uniform sampler2D u_texture;
in vec2 v_texcoord;
in vec4 v_color;
layout(location = 0) out vec4 fragColor;
void main(void) {
  vec4 base = texture(u_texture, v_texcoord) * v_color;
  fragColor = vec4(base.rgb * base.a, base.a);
}`,

  particleVertexSource: `#version 300 es
precision mediump float;
in vec2 a_translation;
in vec2 a_scale;
in float a_rotation;
in vec4 a_color;
in vec2 a_uvMin;
in vec2 a_uvMax;
uniform mat3 u_projection;
uniform mat3 u_systemTransform;
uniform vec4 u_localBounds;
out vec2 v_uv;
out vec4 v_color;
void main() {
  vec2 corner;
  if (gl_VertexID == 0) corner = vec2(0.0, 0.0);
  else if (gl_VertexID == 1) corner = vec2(1.0, 0.0);
  else if (gl_VertexID == 2) corner = vec2(1.0, 1.0);
  else corner = vec2(0.0, 1.0);

  vec2 local = mix(u_localBounds.xy, u_localBounds.zw, corner);
  local *= a_scale;
  float angle = radians(a_rotation);
  mat2 rotationMatrix = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec2 worldPos = (u_systemTransform * vec3(rotationMatrix * local + a_translation, 1.0)).xy;
  vec3 clip = u_projection * vec3(worldPos, 1.0);

  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = mix(a_uvMin, a_uvMax, corner);
  v_color = a_color;
}`,

  particleFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv) * v_color;
}`,

  // Minimal text vertex path: project the (already world-space) glyph position. The
  // assertions read geometry, not pixels, so the exact transform is immaterial;
  // `a_nodeIndex` and `a_gradUV` are referenced so they are not optimised out (the
  // renderer wires them as vertex attributes on connect and would fail to find the
  // location). Mirrors the real text.vert attribute interface (no vertex texelFetch).
  textVertexSource: `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in float a_nodeIndex;
layout(location = 3) in vec2 a_gradUV;
uniform mat3 u_projection;
out vec2 v_texcoord;
out vec2 v_gradUV;
void main(void) {
  vec2 local = a_position + vec2(a_nodeIndex * 0.0);
  gl_Position = vec4((u_projection * vec3(local, 1.0)).xy, 0.0, 1.0);
  v_texcoord = a_texcoord;
  v_gradUV = a_gradUV;
}`,

  // SDF coverage → premultiplied white. Background stays at the black clear color.
  textFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_texcoord;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  float sd = texture(u_texture, v_texcoord).r;
  float cov = smoothstep(0.45, 0.55, sd);
  outColor = vec4(cov, cov, cov, cov);
}`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: shaderSources.spriteVertexSource }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => ({ default: (await import('./_spriteFragMock')).createSpriteFragMockSource('v_uv') }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: shaderSources.meshVertexSource }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: shaderSources.meshFragmentSource }));
vi.mock('#rendering/webgl2/glsl/particle.vert', () => ({ default: shaderSources.particleVertexSource }));
vi.mock('#rendering/webgl2/glsl/particle.frag', () => ({ default: shaderSources.particleFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVertexSource }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFragmentSource }));

const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (width: number, height: number): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width, height },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);
  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);
  return backend;
};

/** Run the real collect → flush → draw path against the live WebGL2 context. */
const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

interface GlyphQuad {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Extract per-glyph quad origins (top-left) and sizes from the geometry the
 * layout engine produced for a Text node. Each visible glyph contributes 8
 * floats per quad: vertex 0 is the top-left (x, y), vertex 2 the bottom-right.
 */
const glyphQuads = (text: Text): GlyphQuad[] => {
  const quads: GlyphQuad[] = [];
  for (const batch of text.pageQuads) {
    for (let i = 0; i < batch.quadCount; i++) {
      const v = i * 8;
      const x = batch.vertices[v];
      const y = batch.vertices[v + 1];
      quads.push({ x, y, width: batch.vertices[v + 4] - x, height: batch.vertices[v + 5] - y });
    }
  }
  return quads;
};

/** Group values that fall within `tolerance` of each other into bands. */
const distinctBands = (values: number[], tolerance = 4): number[] => {
  const sorted = [...values].sort((a, b) => a - b);
  const bands: number[] = [];
  for (const value of sorted) {
    if (bands.length === 0 || value - bands[bands.length - 1] > tolerance) {
      bands.push(value);
    }
  }
  return bands;
};

describe('Text layout WebGL2 browser', () => {
  // The glyph atlas pool is a process-wide singleton whose R8 SDF DataTexture
  // uploads its dirty region to whichever backend binds it first. Reset it per
  // test so each fresh atlas rasterizes against this test's backend context.
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('"ABC" lays out as horizontally separated, non-overlapping glyphs', async () => {
    const backend = await createBackend(192, 64);
    // Wide letterSpacing guarantees a visible gap between glyphs regardless of the font.
    const text = new Text('ABC', { fillColor: Color.white, fontSize: 30, letterSpacing: 18 });

    try {
      // Drives the real in-browser GPU path (real atlas texture, real shaders);
      // it must complete without throwing and issue a draw call.
      render(backend, text);
      expect(backend.stats.drawCalls).toBeGreaterThan(0);

      const quads = glyphQuads(text).sort((a, b) => a.x - b.x);
      expect(quads).toHaveLength(3); // A, B, C all visible

      // All three glyphs share one line (a single vertical band).
      expect(distinctBands(quads.map(q => q.y))).toHaveLength(1);

      // Strictly increasing x with a real gap between successive glyph boxes —
      // the opposite of the collapsed/overlapping blob the broken example showed.
      for (let i = 1; i < quads.length; i++) {
        expect(quads[i].x).toBeGreaterThan(quads[i - 1].x);
        const previousRight = quads[i - 1].x + quads[i - 1].width;
        expect(quads[i].x).toBeGreaterThan(previousRight); // genuine inter-glyph gap
      }
    } finally {
      text.destroy();
      backend.destroy();
    }
  });

  test('wrapped text splits across at least two vertical line bands', async () => {
    const backend = await createBackend(128, 128);
    // "AAA BBB" cannot fit both words within 56px → wraps to two lines.
    const text = new Text('AAA BBB', { fillColor: Color.white, fontSize: 24, lineHeight: 1.6, maxWidth: 56 });

    try {
      render(backend, text);
      expect(backend.stats.drawCalls).toBeGreaterThan(0);

      const quads = glyphQuads(text);
      expect(quads.length).toBeGreaterThanOrEqual(6); // 3 + 3 visible glyphs

      // Two wrapped lines → two distinct y bands.
      const bands = distinctBands(quads.map(q => q.y));
      expect(bands.length).toBeGreaterThanOrEqual(2);

      // The second band sits a full line below the first (no overlap).
      expect(bands[1] - bands[0]).toBeGreaterThan(text.style.fontSize * 0.8);
    } finally {
      text.destroy();
      backend.destroy();
    }
  });

  test('no wrap width keeps a spaced string on a single line', async () => {
    const backend = await createBackend(320, 64);
    const text = new Text('one two three', { fillColor: Color.white, fontSize: 22 });

    try {
      render(backend, text);
      expect(backend.stats.drawCalls).toBeGreaterThan(0);

      // Every visible glyph shares one y band — a single, non-wrapped line.
      const quads = glyphQuads(text);
      expect(quads.length).toBeGreaterThan(0);
      expect(distinctBands(quads.map(q => q.y))).toHaveLength(1);
    } finally {
      text.destroy();
      backend.destroy();
    }
  });

  // Regression: a second Text reusing the shared atlas with characters the first
  // never rasterized triggers a *partial* sub-region upload of the R8 atlas (the
  // first render does a full upload). With the WebGL default UNPACK_ALIGNMENT of
  // 4, a sub-region whose row width isn't a multiple of 4 and spans more than one
  // row is rejected with INVALID_OPERATION — the new glyphs never reach the GPU
  // and render invisibly. This is exactly what broke switching to a scene whose
  // text introduces new characters. The existing tests miss it because each
  // resets the atlas pool, so every upload is full.
  //
  // SwiftShader (the headless software GL) doesn't enforce the alignment size
  // check, so it can't reproduce the driver-level INVALID_OPERATION. We instead
  // assert the backend's guard directly: a partial DataTexture upload must set
  // UNPACK_ALIGNMENT to 1 (tight packing) before its texSubImage2D.
  test('uploads a new glyph batch as a tightly-packed partial sub-region (UNPACK_ALIGNMENT = 1)', async () => {
    const backend = await createBackend(256, 64);
    const gl = backend.context;
    // The first Text populates and fully uploads the shared atlas. The Text
    // constructor rasterizes eagerly, so `second` must be created *after* the
    // first upload — only then are its (disjoint) glyphs new to the atlas,
    // forcing the partial sub-region upload rather than a fresh full upload.
    const first = new Text('il', { fillColor: Color.white, fontSize: 30 });
    let second: Text | null = null;

    try {
      render(backend, first);

      const pixelStoreiSpy = vi.spyOn(gl, 'pixelStorei');
      const texSubImage2DSpy = vi.spyOn(gl, 'texSubImage2D');

      // Nothing in "WMQ" appears in "il": only-new glyphs into existing atlas.
      second = new Text('WMQ', { fillColor: Color.white, fontSize: 30 });
      render(backend, second);

      // The new glyphs went up as a partial sub-region (not a full re-alloc)…
      expect(texSubImage2DSpy).toHaveBeenCalled();
      // …with tight row packing, so the misaligned R8 rows upload intact.
      expect(pixelStoreiSpy).toHaveBeenCalledWith(gl.UNPACK_ALIGNMENT, 1);
    } finally {
      vi.restoreAllMocks();
      first.destroy();
      second?.destroy();
      backend.destroy();
    }
  });

  // Regression: a Text node that is the ONLY draw in a frame must bind its glyph
  // atlas to the texture unit its SDF shader samples (unit 0). The renderer binds
  // its node-data texture to unit 1; if it does so with a raw gl.activeTexture
  // that bypasses the backend's texture-unit cache, the subsequent
  // bindTexture(atlas, 0) is skipped (the cache still reads 0 from frame start)
  // and the atlas lands on unit 1 — leaving unit 0 (what the shader reads) empty,
  // so every glyph samples 0 and the whole frame is transparent. A preceding
  // sprite primes the cache off 0, which is why the bug only bites text that
  // renders first. We assert the GL unit state rather than read-back pixels: the
  // browser project mocks the text shaders, so pixel output is not meaningful, but
  // the unit choreography that the bug corrupts is.
  test('binds the glyph atlas to the sampled unit when text is the only draw (texture-unit priming regression)', async () => {
    const backend = await createBackend(256, 64);
    const gl = backend.context;
    const text = new Text('HELLO', { fillColor: Color.white, fontSize: 30 });

    try {
      render(backend, text);
      expect(backend.stats.drawCalls).toBeGreaterThan(0);

      // After a correct text flush the active unit is 0 (the last atlas bind) with
      // the atlas bound there; the bug leaves the active unit at 1 (the skipped
      // switch) and unit 0 empty.
      expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe(gl.TEXTURE0);
      expect(gl.getParameter(gl.TEXTURE_BINDING_2D)).not.toBeNull();
    } finally {
      text.destroy();
      backend.destroy();
    }
  });
});
