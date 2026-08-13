import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { spriteMaterialTextureSlots, spriteVertexGlsl } from '#rendering/sprite/spriteMaterialSources';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the backend compiles on connect must be mocked with
// valid sources. The sprite vertex mock keeps the REAL pinned attribute
// locations (0, 3, 5, 6; tint read from transform texel 2) so the renderer's
// shared VAO matches the custom material's `spriteVertexGlsl` (which is also
// location-pinned). The custom path compiles
// the real `spriteVertexGlsl` constant — that module is not a `.vert` import and
// is therefore NOT mocked.

const canvasSize = 64;
const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
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

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const createSolidTexture = (r: number, g: number, b: number, a = 255, size = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

// Custom fragment: samples this instance's base texture through the engine's
// spliced `sampleBase` helper and modulates it by a user vec4 uniform.
const tintFragment = `#version 300 es
precision mediump float;
in vec2 v_texcoord;
in vec4 v_color;
uniform vec4 u_userColor;
out vec4 fragColor;
void main() {
  vec4 base = sampleBase(v_textureSlot, v_texcoord);
  fragColor = vec4(base.rgb * u_userColor.rgb, 1.0);
}`;

// Custom fragment: never calls sampleBase and outputs a material texture
// instead — proves material-texture binding is independent of the base slot
// table, and that a program with every slot sampler optimised out still links.
const patternFragment = `#version 300 es
precision mediump float;
in vec2 v_texcoord;
uniform sampler2D u_pattern;
out vec4 fragColor;
void main() {
  fragColor = vec4(texture(u_pattern, v_texcoord).rgb, 1.0);
}`;

const createTintMaterial = (color: readonly [number, number, number, number]): SpriteMaterial =>
  new SpriteMaterial({
    shader: new ShaderSource({ glsl: { vertex: spriteVertexGlsl, fragment: tintFragment } }),
    uniforms: { u_userColor: color },
  });

describe('custom SpriteMaterial WebGL2 browser', () => {
  test('retained replay keeps uniform values live and recoverably re-records blend changes', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(255, 255, 255);
    const values = new Float32Array([1, 0, 0, 1]);
    const material = createTintMaterial(values as unknown as readonly [number, number, number, number]);
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      sprite.material = material;
      sprite.setPosition(16, 16);
      group.addChild(sprite);

      render(backend, group); // fragment capture
      render(backend, group); // instruction recording

      let replay = vi.spyOn(backend, '_replayRetainedBatch');

      render(backend, group);
      expect(replay).toHaveBeenCalledTimes(1);
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 0, 0, 255]);

      material.setUniform('u_userColor', [0, 1, 0, 1]);
      replay.mockClear();
      render(backend, group);

      expect(replay).toHaveBeenCalledTimes(1);
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [0, 255, 0, 255]);

      values.set([0, 1, 0, 1]);
      material.setUniform('u_userColor', values);
      render(backend, group);
      values[0] = 0;
      values[1] = 0;
      values[2] = 1;
      replay.mockClear();
      render(backend, group);

      expect(replay).toHaveBeenCalledTimes(1);
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [0, 0, 255, 255]);

      material.blendMode = BlendModes.Additive;
      replay.mockClear();
      render(backend, group);
      expect(replay).not.toHaveBeenCalled();

      replay.mockRestore();
      replay = vi.spyOn(backend, '_replayRetainedBatch');
      render(backend, group);
      expect(replay).toHaveBeenCalledTimes(1);
      replay.mockRestore();
    } finally {
      group.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('retained replay resolves a replacement material texture identity live', async () => {
    const backend = await createBackend();
    const base = createSolidTexture(255, 255, 255);
    const firstPattern = createSolidTexture(255, 0, 0);
    const secondPattern = createSolidTexture(0, 255, 0);
    const material = new SpriteMaterial({
      shader: new ShaderSource({ glsl: { vertex: spriteVertexGlsl, fragment: patternFragment } }),
      textures: { u_pattern: firstPattern },
    });
    const group = new RetainedContainer();
    const sprite = new Sprite(base);

    try {
      sprite.material = material;
      sprite.setPosition(16, 16);
      group.addChild(sprite);

      render(backend, group);
      render(backend, group);
      render(backend, group);
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 0, 0, 255]);

      const replay = vi.spyOn(backend, '_replayRetainedBatch');

      material.setTexture('u_pattern', secondPattern);
      render(backend, group);

      expect(replay).toHaveBeenCalledTimes(1);
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [0, 255, 0, 255]);
      replay.mockRestore();
    } finally {
      group.destroy();
      material.destroy();
      secondPattern.destroy();
      firstPattern.destroy();
      base.destroy();
      backend.destroy();
    }
  });

  test('renders a custom fragment sampling the base texture and a user uniform', async () => {
    const backend = await createBackend();
    // Mid-gray base proves the texture is sampled; the per-channel uniform
    // proves uniform binding. (0.5,0.5,0.5) * (1,0,0.5) → (128, 0, 64).
    const texture = createSolidTexture(128, 128, 128);
    const material = createTintMaterial([1, 0, 0.5, 1]);
    const sprite = new Sprite(texture);

    try {
      sprite.material = material;
      sprite.setPosition(16, 16);

      render(backend, sprite);

      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [128, 0, 64, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      sprite.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('reflects a mutated material uniform on the next frame', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(255, 255, 255);
    const material = createTintMaterial([1, 0, 0, 1]);
    const sprite = new Sprite(texture);

    try {
      sprite.material = material;
      sprite.setPosition(16, 16);

      render(backend, sprite);
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 0, 0, 255]);

      material.setUniform('u_userColor', [0, 0, 1, 1]);
      render(backend, sprite);
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [0, 0, 255, 255]);
    } finally {
      sprite.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('binds a material texture independent of the base slot table', async () => {
    const backend = await createBackend();
    const base = createSolidTexture(255, 0, 0);
    const pattern = createSolidTexture(0, 255, 0);
    const material = new SpriteMaterial({
      shader: new ShaderSource({ glsl: { vertex: spriteVertexGlsl, fragment: patternFragment } }),
      textures: { u_pattern: pattern },
    });
    const sprite = new Sprite(base);

    try {
      sprite.material = material;
      sprite.setPosition(16, 16);

      render(backend, sprite);

      // Output is the green pattern, not the red base.
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [0, 255, 0, 255]);
    } finally {
      sprite.destroy();
      material.destroy();
      pattern.destroy();
      base.destroy();
      backend.destroy();
    }
  });

  test('three sprites sharing a material and base texture batch into one instanced draw', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(128, 128, 128);
    const material = createTintMaterial([1, 1, 1, 1]);
    const root = new Container();
    const sprites = [new Sprite(texture), new Sprite(texture), new Sprite(texture)];

    try {
      sprites.forEach((sprite, index) => {
        sprite.material = material;
        sprite.setPosition(8 + index * 14, 16);
        root.addChild(sprite);
      });

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      root.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  // Multi-texture batching gate for the custom path. Before base textures
  // rotated through the material slot table this frame cost one draw per
  // sprite; it must now collapse to the plateau of a single instanced draw.
  test('four distinct base textures under one material collapse to a single draw', async () => {
    const backend = await createBackend();
    const textures = [createSolidTexture(200, 0, 0), createSolidTexture(0, 200, 0), createSolidTexture(0, 0, 200), createSolidTexture(200, 200, 0)];
    const material = createTintMaterial([1, 1, 1, 1]);
    const root = new Container();

    try {
      textures.forEach((texture, index) => {
        const sprite = new Sprite(texture);

        sprite.material = material;
        sprite.setPosition(4 + index * 14, 16);
        root.addChild(sprite);
      });

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      // Each sprite still samples ITS OWN texture, not slot 0's.
      expectPixelNear(readWebGl2Pixel(backend, 8, 20), [200, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 22, 20), [0, 200, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 36, 20), [0, 0, 200, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 50, 20), [200, 200, 0, 255]);
    } finally {
      root.destroy();
      material.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    }
  });

  test('base-slot exhaustion breaks the custom-material batch', async () => {
    // One more distinct base texture than the custom path's slot table holds.
    const backend = await createBackend();
    const textures = Array.from({ length: spriteMaterialTextureSlots + 1 }, (_, index) => createSolidTexture(16 * (index + 1), 0, 0));
    const material = createTintMaterial([1, 1, 1, 1]);
    const root = new Container();

    try {
      textures.forEach((texture, index) => {
        const sprite = new Sprite(texture);

        sprite.material = material;
        sprite.setPosition(2 + index * 6, 16);
        root.addChild(sprite);
      });

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      material.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    }
  });

  test('a material switch breaks the batch', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(128, 128, 128);
    const materialA = createTintMaterial([1, 0, 0, 1]);
    const materialB = createTintMaterial([0, 1, 0, 1]);
    const root = new Container();
    const spriteA = new Sprite(texture);
    const spriteB = new Sprite(texture);

    try {
      spriteA.material = materialA;
      spriteB.material = materialB;
      spriteA.setPosition(8, 16);
      spriteB.setPosition(36, 16);
      root.addChild(spriteA);
      root.addChild(spriteB);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      materialA.destroy();
      materialB.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('default material-less sprites still merge multiple base textures into one draw', async () => {
    const backend = await createBackend();
    const textures = [createSolidTexture(255, 0, 0), createSolidTexture(0, 255, 0), createSolidTexture(0, 0, 255)];
    const root = new Container();

    try {
      textures.forEach((texture, index) => {
        const sprite = new Sprite(texture);
        sprite.setPosition(4 + index * 16, 16);
        root.addChild(sprite);
      });

      render(backend, root);

      // 16-slot multi-texture batching keeps three distinct textures in one draw.
      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      root.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    }
  });

  test('a default sprite followed by a custom-material sprite uses two draws', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(128, 128, 128);
    const material = createTintMaterial([1, 1, 1, 1]);
    const root = new Container();
    const plain = new Sprite(texture);
    const custom = new Sprite(texture);

    try {
      plain.setPosition(8, 16);
      custom.material = material;
      custom.setPosition(36, 16);
      root.addChild(plain);
      root.addChild(custom);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
