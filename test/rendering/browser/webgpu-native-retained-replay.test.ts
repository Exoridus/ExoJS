import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode, TileSet } from '@codexo/exojs-tilemap';
import { describe, expect, test, vi } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { MultiRenderTarget } from '#rendering/MultiRenderTarget';
import { RenderingContext } from '#rendering/RenderingContext';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Shader } from '#rendering/shader/Shader';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Text } from '#rendering/text/Text';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { BlendModes, TextureFormat } from '#rendering/types';

import { createWebGpuTestBackend } from './_backendSetup';
import { wireTilemapRenderers } from './_tilemapScene';

const size = 64;

const createScene = async (mixed = false) => {
  const backend = await createWebGpuTestBackend(size);

  if (mixed) {
    wireTilemapRenderers(backend);
  }

  const context = new RenderingContext(backend);
  const target = new RenderTexture(size, size);
  const source = document.createElement('canvas');
  source.width = 6;
  source.height = 6;
  const sourceContext = source.getContext('2d')!;
  sourceContext.fillStyle = '#ff0000';
  sourceContext.fillRect(0, 0, 6, 6);
  const texture = new Texture(source);
  const maps: TileMap[] = [];
  const tileset = new TileSet({ name: 'red', texture: new TextureRegion(texture), tileWidth: 6, tileHeight: 6, tileCount: 1 });

  const createTile = (index: number): TileMapNode => {
    const layer = new TileLayer({ id: index, name: 'red', width: 1, height: 1, tileWidth: 6, tileHeight: 6, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    const map = new TileMap({ name: 'red', width: 1, height: 1, tileWidth: 6, tileHeight: 6, tilesets: [tileset], layers: [layer] });
    maps.push(map);

    return new TileMapNode(map);
  };

  const siblingTexture = Texture.fromColor(new Color(0, 0, 255), 2);
  const root = new Container();
  const group = new RetainedContainer();
  root.preserveDrawOrder = true;
  group.preserveDrawOrder = true;
  const before = new Sprite(siblingTexture);
  before.setPosition(62, 0);
  root.addChild(before, group);

  for (let index = 0; index < 64; index++) {
    // Retained Text supports one flush per group; a second would poison capture.
    const sprite =
      mixed && index === 2
        ? new Text('M', { fontSize: 6, fillColor: new Color(255, 0, 0) })
        : mixed && index === 3
          ? createTile(index)
          : mixed && index % 2 === 1
            ? new NineSliceSprite(texture, { slices: 1, width: 6, height: 6 })
            : new Sprite(texture);
    sprite.setPosition((index % 8) * 8, Math.floor(index / 8) * 8);

    if (!(sprite instanceof TileMapNode)) {
      sprite.blendMode = index % 2 === 0 ? BlendModes.Normal : BlendModes.Additive;
    }

    group.addChild(sprite);
  }

  const after = new Sprite(siblingTexture);
  after.setPosition(62, 62);
  root.addChild(after);
  backend.setRenderTarget(target);
  const builds = vi.spyOn(backend.device, 'createRenderBundleEncoder');
  const executions = vi.spyOn(GPURenderPassEncoder.prototype, 'executeBundles');
  backend.device.pushErrorScope('validation');

  const render = (): void => {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
  };

  const pixels = async (): Promise<Uint8ClampedArray> => (await context.readPixels(target)).data;

  const destroy = async (): Promise<void> => {
    try {
      expect((await backend.device.popErrorScope())?.message ?? null).toBeNull();
    } finally {
      builds.mockRestore();
      executions.mockRestore();
      root.destroy();

      for (const map of maps) {
        map.destroy();
      }

      texture.destroy();
      siblingTexture.destroy();
      target.destroy();
      backend.destroy();
    }
  };

  return { backend, target, source, sourceContext, texture, root, group, builds, executions, render, pixels, destroy };
};

const pixel = (data: Uint8ClampedArray, x: number, y: number): number[] =>
  Array.from(data.slice((y * size + x) * 4, (y * size + x) * 4 + 4));

const promote = async (scene: Awaited<ReturnType<typeof createScene>>): Promise<Uint8ClampedArray> => {
  scene.render();
  scene.render();
  const baseline = await scene.pixels();
  expect(pixel(baseline, 3, 3)).toEqual([255, 0, 0, 255]);
  expect(pixel(baseline, 63, 0)).toEqual([0, 0, 255, 255]);
  expect(pixel(baseline, 63, 63)).toEqual([0, 0, 255, 255]);
  expect(scene.builds).not.toHaveBeenCalled();

  for (let frame = 0; frame < 30; frame++) {
    scene.render();
    expect(scene.builds).not.toHaveBeenCalled();
  }

  scene.render();
  expect(scene.builds).toHaveBeenCalledTimes(32);
  expect(scene.executions).toHaveBeenCalledTimes(32);
  expect(await scene.pixels()).toEqual(baseline);
  scene.render();
  expect(scene.builds).toHaveBeenCalledTimes(64);
  expect(await scene.pixels()).toEqual(baseline);

  return baseline;
};

describe('WebGPU native retained replay', () => {
  test('promotes in bounded steps and preserves pixels through camera and texture updates', async () => {
    const scene = await createScene();

    try {
      const baseline = await promote(scene);
      scene.executions.mockClear();
      scene.render();
      expect(scene.executions).toHaveBeenCalledTimes(64);
      expect(scene.builds).toHaveBeenCalledTimes(64);
      expect(await scene.pixels()).toEqual(baseline);

      scene.target.view.setCenter(size / 2 + 2, size / 2);
      scene.executions.mockClear();
      scene.render();
      const moved = await scene.pixels();
      expect(pixel(moved, 3, 3)).toEqual([255, 0, 0, 255]);
      expect(pixel(moved, 5, 3)).toEqual([0, 0, 0, 255]);
      expect(scene.executions).toHaveBeenCalledTimes(64);
      expect(scene.builds).toHaveBeenCalledTimes(64);
      scene.target.view.setCenter(size / 2, size / 2);

      scene.sourceContext.fillStyle = '#00ff00';
      scene.sourceContext.fillRect(0, 0, 6, 6);
      scene.texture.updateSource();
      scene.executions.mockClear();
      scene.render();
      expect(pixel(await scene.pixels(), 3, 3)).toEqual([0, 255, 0, 255]);
      expect(scene.executions).toHaveBeenCalledTimes(64);
      expect(scene.builds).toHaveBeenCalledTimes(64);

      scene.source.width = 12;
      scene.source.height = 12;
      scene.sourceContext.fillStyle = '#00ff00';
      scene.sourceContext.fillRect(0, 0, 12, 12);
      scene.texture.updateSource();
      scene.executions.mockClear();
      scene.render();
      expect(pixel(await scene.pixels(), 3, 3)).toEqual([0, 255, 0, 255]);
      expect(scene.executions).not.toHaveBeenCalled();
      expect(scene.builds).toHaveBeenCalledTimes(64);
      const resized = await scene.pixels();

      for (let frame = 0; frame < 35; frame++) {
        const previousBuilds = scene.builds.mock.calls.length;
        scene.render();
        expect(scene.builds.mock.calls.length - previousBuilds).toBeLessThanOrEqual(32);
      }

      expect(scene.builds).toHaveBeenCalledTimes(128);
      expect(await scene.pixels()).toEqual(resized);
    } finally {
      await scene.destroy();
    }
  });

  test('keeps custom-material uniform writes live after promotion', async () => {
    const scene = await createScene();
    const material = new SpriteMaterial({
      shader: new Shader({
        wgsl: `
struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let alpha = sampleBase(input.textureSlot, input.texcoord).a;
  return vec4<f32>(u_user.color.rgb * alpha, alpha);
}`,
      }),
      uniforms: { color: [1, 0, 0, 1] },
    });

    try {
      for (const child of scene.group.children) {
        (child as Sprite).material = material;
      }

      await promote(scene);
      material.setUniform('color', [0, 1, 0, 1]);
      scene.executions.mockClear();
      scene.render();
      expect(pixel(await scene.pixels(), 3, 3)).toEqual([0, 255, 0, 255]);
      expect(scene.executions).toHaveBeenCalledTimes(64);
      expect(scene.builds).toHaveBeenCalledTimes(64);
    } finally {
      await scene.destroy();
      material.destroy();
    }
  });

  test('promotes interleaved sprite, scalable-geometry, text, and tilemap batches', async () => {
    const scene = await createScene(true);

    try {
      const baseline = await promote(scene);
      scene.executions.mockClear();
      scene.render();
      expect(scene.executions).toHaveBeenCalledTimes(64);
      expect(await scene.pixels()).toEqual(baseline);
    } finally {
      await scene.destroy();
    }
  });

  test('rebuilds for a different target format and falls back when switching back', async () => {
    const scene = await createScene();
    const floatTarget = new RenderTexture(size, size, { format: TextureFormat.Rgba16F });
    const display = new Sprite(floatTarget);

    try {
      const baseline = await promote(scene);
      scene.backend.setRenderTarget(floatTarget);
      scene.executions.mockClear();
      scene.render();
      expect(scene.executions).not.toHaveBeenCalled();

      for (let frame = 0; frame < 32; frame++) {
        scene.render();
      }

      expect(scene.builds).toHaveBeenCalledTimes(128);
      expect(scene.builds).toHaveBeenLastCalledWith({ colorFormats: ['rgba16float'] });
      const context = new RenderingContext(scene.backend);
      context.renderTo(display, { target: scene.target, clear: Color.black });
      scene.backend.flush();
      expect(await scene.pixels()).toEqual(baseline);
      scene.backend.setRenderTarget(scene.target);
      scene.executions.mockClear();
      scene.render();
      expect(scene.executions).not.toHaveBeenCalled();
      expect(await scene.pixels()).toEqual(baseline);
    } finally {
      display.destroy();
      floatTarget.destroy();
      await scene.destroy();
    }
  });

  test('preserves native commands across multi-attachment passes', async () => {
    const scene = await createScene();
    const target = new MultiRenderTarget(size, size, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const material = new SpriteMaterial({
      shader: new Shader({
        wgsl: `
struct FragmentOutput {
  @location(0) color: vec4<f32>,
  @location(1) marker: vec4<f32>,
};
@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;
  output.color = sampleBase(input.textureSlot, input.texcoord) * input.color;
  output.marker = vec4<f32>(0.0, 1.0, 0.0, 1.0);
  return output;
}`,
      }),
    });

    try {
      for (const child of scene.group.children) {
        (child as Sprite).material = material;
      }

      for (const child of scene.root.children) {
        if (child instanceof Sprite) {
          child.material = material;
        }
      }

      const baseline = await promote(scene);
      scene.executions.mockClear();
      scene.backend.setRenderTarget(target);

      for (let frame = 0; frame < 36; frame++) {
        scene.render();
      }

      expect(scene.builds).toHaveBeenCalledTimes(64);
      expect(scene.executions).not.toHaveBeenCalled();
      const context = new RenderingContext(scene.backend);
      expect(pixel((await context.readPixels(target.attachment(0))).data, 3, 3)).toEqual([255, 0, 0, 255]);
      expect(pixel((await context.readPixels(target.attachment(1))).data, 3, 3)).toEqual([0, 255, 0, 255]);
      scene.backend.setRenderTarget(scene.target);
      scene.render();
      expect(scene.executions).toHaveBeenCalledTimes(64);
      expect(scene.builds).toHaveBeenCalledTimes(64);
      expect(await scene.pixels()).toEqual(baseline);
    } finally {
      await scene.destroy();
      target.destroy();
      material.destroy();
    }
  });
  test('preserves native commands across stencil clipping', async () => {
    const scene = await createScene();
    const shape = new Geometry({
      attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
      vertexData: new Float32Array([0, 0, size, 0, 0, size]),
      stride: 8,
    });

    try {
      const baseline = await promote(scene);
      scene.root.clipShape = shape;
      scene.root.clip = true;
      scene.executions.mockClear();
      scene.render();
      const clipped = await scene.pixels();
      expect(pixel(clipped, 3, 3)).toEqual([255, 0, 0, 255]);
      expect(pixel(clipped, 59, 59)).toEqual([0, 0, 0, 255]);
      expect(scene.executions).not.toHaveBeenCalled();
      expect(scene.builds).toHaveBeenCalledTimes(64);
      scene.root.clip = false;
      scene.render();
      expect(await scene.pixels()).toEqual(baseline);
      expect(scene.executions).toHaveBeenCalledTimes(64);
      expect(scene.builds).toHaveBeenCalledTimes(64);
    } finally {
      await scene.destroy();
      shape.destroy();
    }
  });
});
