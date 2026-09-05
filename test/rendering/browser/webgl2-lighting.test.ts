/**
 * WebGL2 browser coverage for `@codexo/exojs-lighting`: the packed light
 * texture reaches the fragment stage through the custom sprite-material path,
 * the distance falloff is visible in the framebuffer, and a mirrored instance
 * is shaded exactly like an unmirrored one.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import { LightingSystem, LitSpriteMaterial, PointLight } from '@codexo/exojs-lighting';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';

const canvasSize = 64;

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
        webglAttributes: { antialias: false, preserveDrawingBuffer: true, stencil: false, depth: false },
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

/** Opaque white albedo, so the framebuffer reads back the light term alone. */
const createAlbedo = (): Texture => {
  const source = document.createElement('canvas');

  source.width = 4;
  source.height = 4;

  const context = source.getContext('2d');

  if (!context) throw new Error('2D context is required to create test textures.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 4, 4);

  return new Texture(source);
};

/** Flat normal map: every texel is (0, 0, 1), so mirroring must not change shading. */
const createFlatNormalMap = (): Texture => {
  const source = document.createElement('canvas');

  source.width = 4;
  source.height = 4;

  const context = source.getContext('2d');

  if (!context) throw new Error('2D context is required to create test textures.');

  context.fillStyle = 'rgb(128, 128, 255)';
  context.fillRect(0, 0, 4, 4);

  return new Texture(source);
};

describe('lighting WebGL2 browser', () => {
  test('shades a batch by distance and treats a mirrored sprite identically', async () => {
    const backend = await createBackend();
    const albedo = createAlbedo();
    const normalMap = createFlatNormalMap();
    const lighting = new LightingSystem({ maxLights: 4, ambient: Color.black });
    const material = new LitSpriteMaterial({ lighting, normalMap });
    const root = new Container();
    const upright = new Sprite(albedo);
    const mirrored = new Sprite(albedo);

    // Two 24x24 quads either side of a light at (32, 32): the upright one spans
    // x 4..28, the mirrored one (negative x scale) spans x 36..60.
    upright.material = material;
    upright.setPosition(4, 20).setScale(24, 24);
    mirrored.material = material;
    mirrored.setPosition(60, 20).setScale(-24, 24);
    root.addChild(upright);
    root.addChild(mirrored);

    lighting.add(new PointLight({ x: 32, y: 32, radius: 64, intensity: 1, height: 20 }));
    lighting.commit();

    try {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      const near = readWebGl2Pixel(backend, 26, 32);
      const far = readWebGl2Pixel(backend, 6, 32);
      // Mirror of x=26 about the light at x=32: both texel centres sit 5.5 px away.
      const mirroredNear = readWebGl2Pixel(backend, 37, 32);

      // One material, one base texture: both quads stay in a single batch.
      expect(backend.stats.drawCalls).toBe(1);
      expect(near[0]).toBeGreaterThan(150);
      expect(far[0]).toBeLessThan(100);
      expect(near[0] - far[0]).toBeGreaterThan(60);
      expect(Math.abs(mirroredNear[0] - near[0])).toBeLessThanOrEqual(2);
    } finally {
      root.destroy();
      material.destroy();
      lighting.destroy();
      normalMap.destroy();
      albedo.destroy();
      backend.destroy();
    }
  });

  test('an unlit scene falls back to the ambient term and a committed light lights it', async () => {
    const backend = await createBackend();
    const albedo = createAlbedo();
    const normalMap = createFlatNormalMap();
    const lighting = new LightingSystem({ maxLights: 4, ambient: new Color(64, 64, 64) });
    const material = new LitSpriteMaterial({ lighting, normalMap });
    const root = new Container();
    const sprite = new Sprite(albedo);

    sprite.material = material;
    sprite.setPosition(16, 16).setScale(32, 32);
    root.addChild(sprite);

    const render = (): void => {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();
    };

    try {
      render();

      const ambientOnly = readWebGl2Pixel(backend, 32, 32);

      expect(ambientOnly[0]).toBeGreaterThan(50);
      expect(ambientOnly[0]).toBeLessThan(80);

      lighting.add(new PointLight({ x: 32, y: 32, radius: 64, intensity: 1, height: 16 }));
      lighting.commit();
      render();

      const lit = readWebGl2Pixel(backend, 32, 32);

      expect(lit[0]).toBeGreaterThan(ambientOnly[0] + 100);
    } finally {
      root.destroy();
      material.destroy();
      lighting.destroy();
      normalMap.destroy();
      albedo.destroy();
      backend.destroy();
    }
  });
});
