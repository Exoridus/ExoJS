/**
 * WebGL2 Sprite browser test — real `sprite.vert` texel-2 tint pixel proof
 * (closes #321).
 *
 * B-11 moved sprite tint out of a per-instance `a_color` attribute and into
 * the shared transform texture's texel 2 (`ivec2(2, nodeIndex)`, channels
 * r/g/b/a, premultiplied in the vertex shader as
 * `vec4(m2.rgb * m2.a, m2.a)`). Every OTHER `browser-webgl-chromium` pixel
 * spec stubs `.vert`/`.frag` to `""` and substitutes hand-written mock GLSL
 * (see `webgl2-sprite-solid-color.test.ts`), and the one spec that DOES load
 * the real file (`webgl2-shader-compile.test.ts`) only compiles/links it —
 * it never renders a pixel. So a wrong texel index or a swizzled channel in
 * the shipped `sprite.vert` would ship completely undetected.
 *
 * This spec closes that gap: it substitutes the REAL `sprite.vert`/
 * `sprite.frag` source (loaded through a `?raw` import — the same
 * stub-bypass technique `webgl2-shader-compile.test.ts` uses) in place of the
 * hand-written sprite mocks, then drives the actual `WebGl2SpriteRenderer`
 * through a real `Sprite`/`Container` scene and reads back rendered pixels.
 * Mesh/Text stay mocked (same reason as the solid-color spec: `initialize()`
 * eagerly compiles every registered renderer's program).
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader wiring
//
// Sprite: substitute the REAL shipped GLSL, loaded via a `?raw` import so the
// `shaderStubPlugin` (which only stubs ids ending in `.vert`/`.frag`, not
// `.vert?raw`/`.frag?raw`) never touches it. This is the exact bypass
// `webgl2-shader-compile.test.ts` relies on, applied here through `vi.mock` so
// the REAL text stands in for the renderer's normal (stubbed-to-"") import.
//
// Mesh/Text: hand-written mocks copied from `webgl2-sprite-solid-color.test.ts`
// — `WebGl2Backend#initialize` connects the whole renderer registry eagerly
// (compiling Sprite + Mesh + Text together), so those two still need *valid*
// GLSL even though this file only ever renders a Sprite.
// ---------------------------------------------------------------------------

vi.mock('#rendering/webgl2/glsl/sprite.vert', async () => {
  const real = await import('../../../src/rendering/webgl2/glsl/sprite.vert?raw');

  return { default: real.default };
});

vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => {
  const real = await import('../../../src/rendering/webgl2/glsl/sprite.frag?raw');

  return { default: real.default };
});

const nonSpriteShaderSources = vi.hoisted(() => ({
  meshVert: `#version 300 es
precision mediump float;
in vec2 a_position;
in vec2 a_texcoord;
in vec4 a_color;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 t = mat3(m0.x,m0.z,0.0, m0.y,m0.w,0.0, m1.x,m1.y,1.0);
  vec3 world = t * vec3(a_position, 1.0);
  vec3 clip = u_projection * world;
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_texcoord; v_color = a_color;
  v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,

  meshFrag: `#version 300 es
precision mediump float;
in vec2 v_uv; in vec4 v_color; in vec4 v_tint;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv) * v_color * v_tint; }`,

  textVert: `#version 300 es
precision mediump float;
in vec2 a_position; in vec2 a_texcoord; in float a_nodeIndex;
uniform mat3 u_projection;
out vec2 v_uv;
void main() {
  float ni = a_nodeIndex;
  vec3 clip = u_projection * vec3(a_position + vec2(ni * 0.0), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0); v_uv = a_texcoord;
}`,

  textFrag: `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv); }`,
}));

vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: nonSpriteShaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: nonSpriteShaderSources.meshFrag }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: nonSpriteShaderSources.textVert }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: nonSpriteShaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: nonSpriteShaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: nonSpriteShaderSources.textFrag }));

// ---------------------------------------------------------------------------
// Infrastructure helpers (mirrors webgl2-sprite-solid-color.test.ts)
// ---------------------------------------------------------------------------

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: {
          alpha: false,
          antialias: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
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

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const buf = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return [buf[0], buf[1], buf[2], buf[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 8): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = width;
  src.height = height;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return new Texture(src);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 Sprite — real sprite.vert texel-2 tint (#321)', () => {
  test('the real shader source made it past the stub (not an empty string)', async () => {
    const real = await import('../../../src/rendering/webgl2/glsl/sprite.vert?raw');

    expect(real.default.length).toBeGreaterThan(0);
    expect(real.default).toContain('ivec2(2, row)');
  });

  test('full-opaque tint renders the exact tint colour (texel-2 index + rgb swizzle)', async () => {
    const backend = await createBackend();
    // Opaque white texture: sampleColor is (1,1,1,1), so the rendered pixel is
    // driven entirely by the tint the shader reads from transform texel 2.
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(20, 180, 90); // alpha defaults to 1 (fully opaque)
      root.addChild(sprite);

      render(backend, root);

      // With alpha == 1 the Normal blend (ONE, ONE_MINUS_SRC_ALPHA) reduces to
      // a plain overwrite, so the readback must equal the tint exactly (within
      // 8-bit quantisation tolerance). A wrong texel index (e.g. reading the
      // transform texel instead of the tint texel) or a permuted rgb swizzle
      // would both produce a visibly different colour here.
      expectPixelNear(readPixel(backend, 16, 16), [20, 180, 90, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('partial-alpha tint proves the float premultiply (m2.rgb * m2.a) path', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(255, 0, 0, 0.5); // 50% alpha red
      root.addChild(sprite);

      render(backend, root);

      // Correct path: the vertex shader premultiplies (m2.rgb * m2.a, m2.a) =
      // (0.5, 0, 0, 0.5). Normal blend (ONE, ONE_MINUS_SRC_ALPHA) against the
      // black clear colour then yields src + dst*(1 - srcA) = (0.5,0,0) + 0 =
      // (0.5, 0, 0) -> ~(128, 0, 0).
      //
      // This specifically catches two classes of shader regression that the
      // full-opaque case above cannot, because alpha == 1 makes them a no-op:
      //  - dropping the `* m2.a` multiply (would read back ~(255, 0, 0) instead)
      //  - a channel swizzle on the tint texel (would shift the 128 into the
      //    wrong channel, e.g. `m2.gbr` moves it to blue)
      expectPixelNear(readPixel(backend, 16, 16), [128, 0, 0, 255], 10);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
