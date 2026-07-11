/**
 * WebGL2 renderer-matrix browser tests — retained instruction-set replay
 * (Track B Slice 3, Tasks 6-8, gate per S3-D10).
 *
 * Pixel cells for the flush-level batch cache: a retained group whose
 * playback was recorded replays through `_replayRetainedBatch` from
 * group-owned resources (persistent instance buffer + group transform
 * texture) and must produce BYTE-IDENTICAL frames to the entry-replay slow
 * path — the recorded bytes ARE the slow path's bytes, the transform rows
 * are the same group-relative rows, and everything view/group-dependent is
 * resolved live at replay. Cells: tier byte-equality, camera pan and group
 * move on the replay path (no recapture — spy-asserted), child-mutation
 * fallback + recapture, tint change, texture swap.
 *
 * Scaffolded from webgl2-retained-container.test.ts (Slice 2 cells).
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks
//
// The vitest shaderPlugin replaces every .vert/.frag import with
// `export default ""`. `WebGl2Backend#initialize` connects the renderer
// registry eagerly, so the Sprite + Mesh + Text shaders that
// `wireCoreRenderers()` registers all need valid GLSL sources even though
// this file only ever renders Sprites. The sprite fragment mock MUST come
// from the shared `_spriteFragMock` helper (16 samplers — the renderer pins
// all 16 sampler uniforms strictly at connect).
// ---------------------------------------------------------------------------

const shaderSources = vi.hoisted(() => ({
  spriteVert: `#version 300 es
precision mediump float;
in vec4 a_localBounds;
in vec4 a_uvBounds;
in vec4 a_color;
in uint a_textureSlot;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform mat3 u_group;
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
  vec3 clip = u_projection * u_group * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = uv; v_color = a_color; v_textureSlot = a_textureSlot;
}`,

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
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in float a_nodeIndex;
uniform mat3 u_projection;
uniform mat3 u_group;
out vec2 v_uv;
void main() {
  float ni = a_nodeIndex;
  vec3 clip = u_projection * u_group * vec3(a_position + vec2(ni * 0.0), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0); v_uv = a_texcoord;
}`,

  textFrag: `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv); }`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: shaderSources.spriteVert }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => ({ default: (await import('./_spriteFragMock')).createSpriteFragMockSource('v_uv') }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: shaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: shaderSources.meshFrag }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVert }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFrag }));

// ---------------------------------------------------------------------------
// Infrastructure helpers
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

/** Full-framebuffer snapshot for byte-identical tier comparisons (S3-D10). */
const readCanvas = (backend: WebGl2Backend): Uint8Array => {
  const buf = new Uint8Array(canvasSize * canvasSize * 4);
  const gl = backend.context;

  gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return buf;
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

/**
 * Standard cell scene: one live sprite OUTSIDE (and before) the retained
 * group, so the group's shared transform rows never start at row 0 — the
 * group-local node-index rebase (S3-D4) is load-bearing in every pixel
 * assertion, and the replay path interleaves with a live batch every frame.
 *
 * Layout (canvas 64x64): blue outside sprite at (48,0)-(64,16); group at
 * (8,24) with a red sprite at group-local (0,0) -> world (8,24)-(24,40) and
 * a green sprite (distinct texture -> multi-slot batch) at group-local
 * (16,16) -> world (24,40)-(40,56).
 */
const buildScene = () => {
  const blue = createSolidTexture('#0000ff');
  const red = createSolidTexture('#ff0000');
  const green = createSolidTexture('#00ff00');
  const root = new Container();
  const outside = new Sprite(blue);
  const group = new RetainedContainer();
  const redSprite = new Sprite(red);
  const greenSprite = new Sprite(green);

  outside.setPosition(48, 0);
  root.addChild(outside);

  greenSprite.setPosition(16, 16);
  group.addChild(redSprite);
  group.addChild(greenSprite);
  group.setPosition(8, 24);
  root.addChild(group);

  const destroy = (): void => {
    root.destroy();
    blue.destroy();
    red.destroy();
    green.destroy();
  };

  return { root, group, redSprite, greenSprite, red, destroy };
};

const expectBaseScenePixels = (backend: WebGl2Backend): void => {
  expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live outside sprite
  expectPixelNear(readPixel(backend, 12, 28), [255, 0, 0, 255]); // red inside the group
  expectPixelNear(readPixel(backend, 28, 44), [0, 255, 0, 255]); // green inside the group
  expectPixelNear(readPixel(backend, 4, 60), [0, 0, 0, 255]); // background
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 renderer matrix: retained instruction-set replay cells', () => {
  test('cell 1 — the instruction-replay tier is byte-identical to the entry-replay and collect tiers', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
    const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

    try {
      // F1 — full collect + fragment capture (slow tier).
      render(backend, scene.root);

      const collectFrame = readCanvas(backend);

      expectBaseScenePixels(backend);
      expect(replaySpy).not.toHaveBeenCalled();

      // F2 — entry replay + instruction recording (the recording source).
      render(backend, scene.root);

      const recordFrame = readCanvas(backend);

      expect(beginSpy).toHaveBeenCalledTimes(1);
      expect(replaySpy).not.toHaveBeenCalled();

      // F3/F4 — instruction splice: recorded batches replay from group-owned
      // resources. Same bytes, same rows, same live uniforms -> identical.
      render(backend, scene.root);

      const replayFrame = readCanvas(backend);

      expect(replaySpy).toHaveBeenCalled();

      render(backend, scene.root);

      const steadyFrame = readCanvas(backend);

      expect(beginSpy).toHaveBeenCalledTimes(1); // never re-recorded
      expectBaseScenePixels(backend);
      expect(recordFrame).toEqual(collectFrame);
      expect(replayFrame).toEqual(recordFrame);
      expect(steadyFrame).toEqual(recordFrame);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — camera pan on the replay path: live projection, no recapture', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // Pan the camera 16px right: everything must appear 16px further left.
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled(); // replay, not recapture
      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 36, 8), [0, 0, 255, 255]); // outside sprite 32..48
      expectPixelNear(readPixel(backend, 4, 28), [255, 0, 0, 255]); // red now at -8..8 (clipped) / 0..8 visible
      expectPixelNear(readPixel(backend, 12, 44), [0, 255, 0, 255]); // green now 8..24
      expectPixelNear(readPixel(backend, 28, 28), [0, 0, 0, 255]); // old red spot is background
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the replay path: one live group matrix relocates the cached batches', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // Move the WHOLE group: content revisions untouched (a group move is
      // decoupled by design), so the set keeps replaying — via live u_group.
      scene.group.setPosition(24, 8);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 28, 12), [255, 0, 0, 255]); // red 24..40 x 8..24
      expectPixelNear(readPixel(backend, 44, 28), [0, 255, 0, 255]); // green 40..56 x 24..40
      expectPixelNear(readPixel(backend, 12, 28), [0, 0, 0, 255]); // old red spot is background
      expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live sprite unaffected
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — child mutation: fallback to full collect, recapture, then replay of the fresh recording', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // Mutate a child INSIDE the group: the set must never be served stale.
      scene.redSprite.setPosition(32, 0); // world (40,24)-(56,40)
      render(backend, scene.root);

      expect(replaySpy).not.toHaveBeenCalled(); // dirty frame = plain collect
      expectPixelNear(readPixel(backend, 44, 28), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 12, 28), [0, 0, 0, 255]); // old spot cleared

      // Recovery: entry replay + re-record...
      render(backend, scene.root);

      expect(beginSpy).toHaveBeenCalledTimes(1);

      const recordFrame = readCanvas(backend);

      // ...then the fresh recording splices, byte-identical again.
      render(backend, scene.root);

      expect(replaySpy).toHaveBeenCalled();
      expect(readCanvas(backend)).toEqual(recordFrame);
      expectPixelNear(readPixel(backend, 44, 28), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 28, 44), [0, 255, 0, 255]);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — tint change inside the group is never served stale by the fast tier', async () => {
    const backend = await createBackend();
    // Tint multiplies the texture color per channel, so the tinted sprite
    // needs a WHITE texture for the tint to be pixel-observable.
    const white = createSolidTexture('#ffffff');
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(white);

    try {
      group.addChild(sprite);
      group.setPosition(8, 24);
      root.addChild(group);

      render(backend, root); // F1 capture
      render(backend, root); // F2 record
      render(backend, root); // F3 splice
      expectPixelNear(readPixel(backend, 12, 28), [255, 255, 255, 255]);

      // Tint is baked into the recorded instance bytes (word 6) — the setter
      // bumps the content revision, so the set recaptures instead of
      // replaying stale bytes.
      sprite.tint = new Color(0, 255, 0);
      render(backend, root); // dirty collect
      render(backend, root); // recapture
      render(backend, root); // splice of the fresh recording

      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      render(backend, root); // steady replay

      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 12, 28), [0, 255, 0, 255]); // white texture x green tint
    } finally {
      root.destroy();
      white.destroy();
      backend.destroy();
    }
  });

  test('cell 6 — texture swap inside the group recaptures with the new texture binding', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const yellow = createSolidTexture('#ffff00');

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice
      expectPixelNear(readPixel(backend, 12, 28), [255, 0, 0, 255]);

      // Texture identity is part of the recorded batch descriptor (slot
      // list); the swap bumps the content revision -> recapture.
      scene.redSprite.setTexture(yellow);
      render(backend, scene.root); // dirty collect
      render(backend, scene.root); // recapture
      render(backend, scene.root); // splice of the fresh recording

      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      render(backend, scene.root); // steady replay

      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 12, 28), [255, 255, 0, 255]); // yellow now
      expectPixelNear(readPixel(backend, 28, 44), [0, 255, 0, 255]); // sibling untouched
    } finally {
      yellow.destroy();
      scene.destroy();
      backend.destroy();
    }
  });
});
