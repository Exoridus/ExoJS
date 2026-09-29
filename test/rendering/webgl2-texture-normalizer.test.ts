import { describe, expect, test } from 'vitest';

import type { WebGl2ColorNormalizationHost } from '#rendering/webgl2/WebGl2TextureNormalizer';
import { WebGl2TextureNormalizer } from '#rendering/webgl2/WebGl2TextureNormalizer';

const TEXTURE0 = 0x84c0;
const TEXTURE_2D = 0x0de1;

interface FakeTexture {
  readonly id: number;
  allocations: number;
}

const createFakeGl = () => {
  const bindings = new Map<number, FakeTexture | null>();
  const uploads: Array<FakeTexture | null> = [];
  const textures: FakeTexture[] = [];
  const deleted: FakeTexture[] = [];
  let activeUnit = TEXTURE0;
  let nextId = 1;

  const gl: Record<string, unknown> = {
    TEXTURE0,
    TEXTURE_2D,
    ACTIVE_TEXTURE: 'ACTIVE_TEXTURE',
    TEXTURE_BINDING_2D: 'TEXTURE_BINDING_2D',
    SCISSOR_TEST: 1,
    STENCIL_TEST: 2,
    DEPTH_TEST: 3,
    CULL_FACE: 4,
    getParameter: (parameter: string): unknown => {
      if (parameter === 'ACTIVE_TEXTURE') return activeUnit;
      if (parameter === 'TEXTURE_BINDING_2D') return bindings.get(activeUnit) ?? null;
      if (parameter === 'VIEWPORT') return new Int32Array(4);

      return null;
    },
    activeTexture: (unit: number) => {
      activeUnit = unit;
    },
    bindTexture: (_target: number, texture: FakeTexture | null) => {
      bindings.set(activeUnit, texture);
    },
    createTexture: () => {
      const texture: FakeTexture = { id: nextId++, allocations: 0 };

      textures.push(texture);

      return texture;
    },
    deleteTexture: (texture: FakeTexture) => {
      deleted.push(texture);
    },
    texImage2D: (...args: readonly unknown[]) => {
      const texture = bindings.get(activeUnit) ?? null;

      if (texture !== null) texture.allocations += 1;
      void args;
    },
    texSubImage2D: () => {
      uploads.push(bindings.get(activeUnit) ?? null);
    },
    getProgramParameter: () => true,
    getUniformLocation: () => ({}),
    getAttribLocation: () => 0,
    createShader: () => ({}),
    createProgram: () => ({}),
    createFramebuffer: () => ({}),
    createBuffer: () => ({}),
    createVertexArray: () => ({}),
    isEnabled: () => false,
    getShaderParameter: () => true,
  };

  // Every remaining GL entry point is a no-op.
  const proxy = new Proxy(gl, {
    get: (target, property: string) => (property in target ? target[property] : () => undefined),
  }) as unknown as WebGL2RenderingContext;

  return { gl: proxy, bindings, uploads, textures, deleted };
};

const noopHost: WebGl2ColorNormalizationHost = {
  releaseForColorNormalization: () => undefined,
  restoreAfterColorNormalization: () => undefined,
};

const createTarget = (width: number, height: number, level = 0) => ({
  destination: {} as WebGLTexture,
  level,
  width,
  height,
  internalFormat: 0x8c43,
});

describe('WebGl2TextureNormalizer staging upload', () => {
  test('uploads raw bytes into the staging texture on every pass, not into what the unit held', () => {
    const fake = createFakeGl();
    const bystander: FakeTexture = { id: 99, allocations: 0 };
    const normalizer = new WebGl2TextureNormalizer(fake.gl, noopHost);

    fake.bindings.set(TEXTURE0, bystander);

    normalizer.normalizePixels(createTarget(4, 4), new Uint8Array(64));
    normalizer.normalizePixels(createTarget(2, 2, 1), new Uint8Array(16));
    normalizer.normalizePixels(createTarget(4, 4), new Uint8Array(64));

    expect(fake.textures).toHaveLength(1);
    expect(fake.uploads).toEqual([fake.textures[0], fake.textures[0], fake.textures[0]]);
    expect(fake.bindings.get(TEXTURE0)).toBe(bystander);
  });

  test('reuses the staging texture for repeated same-size image sources', () => {
    const fake = createFakeGl();
    const normalizer = new WebGl2TextureNormalizer(fake.gl, noopHost);
    const source = {} as TexImageSource;

    normalizer.normalizeImageSource(createTarget(8, 8), source);
    normalizer.normalizeImageSource(createTarget(8, 8), source);
    normalizer.normalizeImageSource(createTarget(8, 8), source);

    expect(fake.textures).toHaveLength(1);
    expect(fake.deleted).toHaveLength(0);
  });
});
