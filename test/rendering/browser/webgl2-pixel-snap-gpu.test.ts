/**
 * WebGL2 GPU-side position pixel-snapping browser tests (spec D3-D5).
 *
 * Task 4 moved position snapping out of the CPU upload seam and into the vertex
 * shaders: the transform row now carries the RAW world transform plus a snap-mode
 * flag (texel 1's `.z`), and `sprite.vert` snaps the device-pixel origin itself
 * using the staged `u_viewport` rect. These specs drive the REAL shipped
 * `sprite.vert`/`sprite.frag` (loaded via `?raw` so the shader stub never touches
 * them) through actual `Sprite`/`Container` scenes and read back pixels.
 *
 * Because a solid quad's coverage under the pixel-centre rule is identical for a
 * snapped and an unsnapped origin, a NON-antialiased single frame cannot tell the
 * two apart (see the note in `webgl2-pixel-snap.test.ts`). We therefore enable
 * MSAA so a sub-pixel edge shows as a partially-covered boundary column: with
 * snapping ON the origin lands on an integer device pixel and the edge is crisp
 * (no partial column); with snapping OFF the fractional edge produces a blended
 * column. Case 2 needs no MSAA — it is a parity assert between the retained and
 * immediate render paths, proving the GPU snaps the COMPOSED (group · local)
 * device origin, not the group-local one.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { PixelSnapMode } from '#rendering/pixelSnap';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader wiring — substitute the REAL sprite.vert/frag (the snap logic under
// test) via `?raw`; Mesh/Text stay mocked because `initialize()` eagerly
// compiles every registered renderer's program.
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
// Infrastructure
// ---------------------------------------------------------------------------

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const createBackend = async (antialias: boolean): Promise<WebGl2Backend> => {
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
          antialias,
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

/** Read one pixel in top-left canvas coordinates (readPixels is bottom-left). */
const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const buf = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return [buf[0], buf[1], buf[2], buf[3]];
};

/** Read a top-left-anchored rect into a flat RGBA array (row-major, top-down). */
const readRect = (backend: WebGl2Backend, x: number, y: number, w: number, h: number): number[] => {
  const gl = backend.context;
  const out: number[] = [];

  for (let row = 0; row < h; row++) {
    const buf = new Uint8Array(w * 4);
    const glY = backend.renderTarget.height - (y + row) - 1;

    gl.readPixels(x, glY, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (const channel of buf) out.push(channel);
  }

  return out;
};

/** A `size`×`size` solid-colour texture. */
const createSolidTexture = (color: string, size: number): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

// ---------------------------------------------------------------------------
// Case 1: Position snap lands the origin on an integer device pixel — the edge
// is crisp (no half-covered boundary column) even at a fractional position.
// ---------------------------------------------------------------------------

describe('WebGL2 GPU pixel snapping — Sprite position mode', () => {
  test('Case 1: a fractional Position sprite snaps to a hard integer-pixel edge', async () => {
    const backend = await createBackend(true);
    const texture = createSolidTexture('#ff0000', 10);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      // World origin (20.4, 20.6) snaps (round) to device (20, 21) top-left.
      sprite.setPosition(20.4, 20.6);
      sprite.pixelSnapMode = PixelSnapMode.Position;
      root.addChild(sprite);

      render(backend, root);

      // Left edge snapped to device x = 20: column 20 fully sprite, column 19
      // fully background — no partial column between them.
      expect(readPixel(backend, 20, 26)[0]).toBeGreaterThan(240); // full red
      expect(readPixel(backend, 19, 26)[0]).toBeLessThan(16); // full background
      // Top edge snapped to device y = 21.
      expect(readPixel(backend, 26, 21)[0]).toBeGreaterThan(240);
      expect(readPixel(backend, 26, 20)[0]).toBeLessThan(16);

      // Render-only: logical position untouched.
      expect(sprite.x).toBe(20.4);
      expect(sprite.y).toBe(20.6);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Case 3: the control. With snapping OFF the fractional edge is NOT snapped,
  // so the boundary column is partially covered — proving the snap branch is
  // gated on the row flag (same position as Case 1, opposite outcome).
  // -------------------------------------------------------------------------
  test('Case 3: PixelSnapMode.None leaves the fractional edge blended (flag-gated)', async () => {
    const backend = await createBackend(true);
    const texture = createSolidTexture('#ff0000', 10);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(20.4, 20.6);
      sprite.pixelSnapMode = PixelSnapMode.None;
      root.addChild(sprite);

      render(backend, root);

      // Unsnapped left edge at device x = 20.4: column 20 is ~60% covered →
      // a blended red, strictly between full background and full sprite. Under
      // Case 1 (snapped) the very same pixel reads full red, so this partial
      // value is the proof the flag gates the shader's snap branch.
      const edge = readPixel(backend, 20, 26)[0];

      expect(edge).toBeGreaterThan(16); // not full background
      expect(edge).toBeLessThan(240); // not full sprite → the edge was NOT snapped
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Case 2: retained vs immediate parity under a fractional camera pan. The
// snapped origin of a group-relative sprite (group · local) must land on the
// same device pixel as the equivalent world-space immediate sprite — i.e. the
// shader snaps the COMPOSED device origin, not the group-local one.
// ---------------------------------------------------------------------------

describe('WebGL2 GPU pixel snapping — retained/immediate parity', () => {
  test('Case 2: a retained group-relative snap matches the immediate world snap', async () => {
    // Retained scene: group at the FRACTIONAL (10.3,10.7), child at (10.1,9.9) →
    // world (20.4,20.6). The fractional group offset is what gives this case its
    // teeth: a shader that snapped the group-LOCAL origin (10.1,9.9) → (10,10)
    // and applied the group matrix afterwards would land the sprite at (20.3,20.7),
    // NOT the immediate scene's snapped (20,21). Only snapping the COMPOSED
    // (group · local) device origin matches. An integer group offset would mask
    // that difference (both paths would share the same fractional delta).
    const retainedBackend = await createBackend(true);
    const retainedTexture = createSolidTexture('#00ff00', 10);
    const retainedRoot = new Container();
    const group = new RetainedContainer();
    const groupSprite = new Sprite(retainedTexture);

    // Immediate scene: single sprite directly at world (20.4,20.6).
    const immediateBackend = await createBackend(true);
    const immediateTexture = createSolidTexture('#00ff00', 10);
    const immediateRoot = new Container();
    const immediateSprite = new Sprite(immediateTexture);

    try {
      group.setPosition(10.3, 10.7);
      groupSprite.setPosition(10.1, 9.9);
      groupSprite.pixelSnapMode = PixelSnapMode.Position;
      group.addChild(groupSprite);
      retainedRoot.addChild(group);

      immediateSprite.setPosition(20.4, 20.6);
      immediateSprite.pixelSnapMode = PixelSnapMode.Position;
      immediateRoot.addChild(immediateSprite);

      // Same fractional camera pan on both, once, before the assertion frames.
      retainedBackend.view.move(0.37, 0.61);
      immediateBackend.view.move(0.37, 0.61);

      // Drive the retained ladder to steady state (capture → record → splice →
      // steady); the immediate scene only needs to be drawn.
      for (let i = 0; i < 4; i++) render(retainedBackend, retainedRoot);
      render(immediateBackend, immediateRoot);

      const retainedPixels = readRect(retainedBackend, 10, 10, 40, 40);
      const immediatePixels = readRect(immediateBackend, 10, 10, 40, 40);

      // Sanity: something green actually drew (guards against an all-black parity).
      const anyGreen = retainedPixels.some((v, i) => i % 4 === 1 && v > 200);

      expect(anyGreen).toBe(true);
      expect(retainedPixels).toEqual(immediatePixels);
    } finally {
      retainedRoot.destroy();
      immediateRoot.destroy();
      retainedTexture.destroy();
      immediateTexture.destroy();
      retainedBackend.destroy();
      immediateBackend.destroy();
    }
  });
});
