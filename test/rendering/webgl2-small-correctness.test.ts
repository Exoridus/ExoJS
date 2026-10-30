import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Shader } from '#rendering/shader/Shader';
import { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { DataTexture } from '#rendering/texture/DataTexture';
import { BlendModes, TextureFormat } from '#rendering/types';
import { AbstractWebGl2BatchedRenderer } from '#rendering/webgl2/AbstractWebGl2BatchedRenderer';
import { probeWebgl2CompressedFormats } from '#rendering/webgl2/compressedFormat';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2MeshRenderer } from '#rendering/webgl2/WebGl2MeshRenderer';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

class BatchProbe extends AbstractWebGl2BatchedRenderer {
  public constructor(batchSize: number) {
    super(batchSize, 8, 'v', 'f');
  }

  public override render(): void {}

  protected createVao(): never {
    throw new Error('unused');
  }

  protected updateView(): void {}

  public override flush(): void {}

  protected override onConnect(): void {}

  protected override onDisconnect(): void {}
}

describe('AbstractWebGl2BatchedRenderer batchSize', () => {
  test.each([16384, 20000, 0, -1, 1.5, Number.NaN])('rejects %s', size => {
    expect(() => new BatchProbe(size)).toThrow(RangeError);
  });

  test('accepts the largest index-safe size', () => {
    expect(() => new BatchProbe(16383)).not.toThrow();
  });
});

describe('WebGL2 BC1 RGB support', () => {
  test('a device with only the s3tc extension supports the linear BC1 RGB format', () => {
    installFakeWebGl2Globals();

    const gl = createFakeWebGl2Context(new GlRecorder(), { WEBGL_compressed_texture_s3tc: {} });
    const support = probeWebgl2CompressedFormats(gl);

    expect(support.formats).toContain(CompressedTextureFormat.Bc1RgbUnorm);
    expect(support.internalFormats.get(CompressedTextureFormat.Bc1RgbUnorm)).toBe(0x83f0);
  });
});

describe('WebGL2 compositors leave texture unit 0 active', () => {
  const create = (): { backend: WebGl2Backend; activeUnit: () => number } => {
    installFakeWebGl2Globals();

    const context = createFakeWebGl2Context(new GlRecorder());
    const original = context.activeTexture.bind(context) as (unit: number) => void;
    let unit = 0;

    (context as unknown as Record<string, unknown>)['activeTexture'] = (value: number): void => {
      unit = value - context.TEXTURE0;
      original(value);
    };

    const app = {
      canvas: createFakeCanvas(64, 64, context),
      options: { canvas: { width: 64, height: 64 }, rendering: { debug: false } },
    } as unknown as Application;

    return { backend: new WebGl2Backend(app), activeUnit: () => unit };
  };

  test('mask compositor', () => {
    const { backend, activeUnit } = create();
    const content = new DataTexture({ width: 4, height: 4, format: TextureFormat.Rgba8 });
    const mask = new DataTexture({ width: 4, height: 4, format: TextureFormat.Rgba8 });
    const compositor = (
      backend as unknown as { _maskCompositor: { connect(b: WebGl2Backend): void; compose: (...args: unknown[]) => void } }
    )._maskCompositor;

    compositor.connect(backend);
    compositor.compose(backend, content, mask, 0, 0, 4, 4, BlendModes.Normal);

    expect(activeUnit()).toBe(0);
    backend.destroy();
  });

  test('backdrop blend compositor', () => {
    const { backend, activeUnit } = create();
    const source = new DataTexture({ width: 4, height: 4, format: TextureFormat.Rgba8 });
    const backdrop = new DataTexture({ width: 4, height: 4, format: TextureFormat.Rgba8 });
    const compositor = (
      backend as unknown as { _backdropBlendCompositor: { connect(b: WebGl2Backend): void; _drawBlend: (...args: unknown[]) => void } }
    )._backdropBlendCompositor;

    compositor.connect(backend);
    compositor._drawBlend(backend, source, backdrop, 0, 0, 4, 4, BlendModes.Multiply, false, false);

    expect(activeUnit()).toBe(0);
    backend.destroy();
  });
});

describe('WebGl2MeshRenderer instancing-compatibility cache', () => {
  test('destroying a material drops its shader from the cache', () => {
    installFakeWebGl2Globals();

    const gl = createFakeWebGl2Context(new GlRecorder());
    const renderer = new WebGl2MeshRenderer();
    const internals = renderer as unknown as {
      _getOrCreateCustomShader(material: MeshMaterial, gl: WebGL2RenderingContext): object;
      _isInstancingCompatible(shader: object): boolean;
      _compatibilityCache: { size: number };
    };

    for (let i = 0; i < 20; i++) {
      const material = new MeshMaterial({ shader: new Shader({ glsl: { vertex: 'v', fragment: 'f' } }) });

      internals._isInstancingCompatible(internals._getOrCreateCustomShader(material, gl));
      material.destroy();
    }

    expect(internals._compatibilityCache.size).toBe(0);
  });
});

describe('SDF text shaders use both dimensions of a non-square atlas page', () => {
  const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

  test.each(['text-sdf.frag', 'text-msdf.frag'])('%s takes the page size as a vec2', file => {
    expect(read(`src/rendering/webgl2/shaders/${file}`)).toMatch(/uniform vec2\s+u_pageSize;/);
  });

  test('text.wgsl derives the page size from both texture dimensions', () => {
    const source = read('src/rendering/webgpu/shaders/text.wgsl');

    expect(source).not.toMatch(/atlasTextureDimensions\(in\.textureSlot\)\.x\)/);
    expect(source).toMatch(/pageSize\s*=\s*vec2<f32>\(atlasTextureDimensions/);
  });

  test('the renderer uploads width and height', () => {
    const source = read('src/rendering/webgl2/WebGl2TextRenderer.ts');

    expect(source.match(/_pageSizeScratch\[1\]/g)).toHaveLength(2);
  });
});
