import { describe, expect, test, vi } from 'vitest';

import type { WebGl2ColorNormalizationHost } from '#rendering/webgl2/WebGl2TextureNormalizer';
import { WebGl2TextureNormalizer } from '#rendering/webgl2/WebGl2TextureNormalizer';

import { createFakeWebGl2Context, GlRecorder } from '../perf/rendering/fakeWebGl2';

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
      if (parameter === 'ACTIVE_TEXTURE') {
        return activeUnit;
      }

      if (parameter === 'TEXTURE_BINDING_2D') {
        return bindings.get(activeUnit) ?? null;
      }

      if (parameter === 'VIEWPORT') {
        return new Int32Array(4);
      }

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

      if (texture !== null) {
        texture.allocations += 1;
      }

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
    useProgram: () => {},
    createFramebuffer: () => ({}),
    createBuffer: () => ({}),
    createVertexArray: () => ({}),
    isEnabled: () => false,
    getShaderParameter: () => true,
  };

  // Every remaining GL entry point is a no-op.
  const proxy = new Proxy(gl, {
    get: (target, property: string) => (property in target ? target[property] : () => {}),
  }) as unknown as WebGL2RenderingContext;

  return { gl: proxy, bindings, uploads, textures, deleted };
};

const noopHost: WebGl2ColorNormalizationHost = {
  releaseForColorNormalization: () => {},
  restoreAfterColorNormalization: () => {},
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

  test('a failed first program setup restores the previous array buffer binding', () => {
    const gl = createFakeWebGl2Context(new GlRecorder());
    const buffer = gl.createBuffer();
    const normalizer = new WebGl2TextureNormalizer(gl, noopHost);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    const allocation = vi.spyOn(gl, 'createVertexArray').mockImplementationOnce(() => null as unknown as WebGLVertexArrayObject);

    try {
      expect(() => normalizer.normalizePixels(createTarget(2, 2), new Uint8Array(16))).toThrow('colour-normalization vertex array');
      expect(gl.getParameter(gl.ARRAY_BUFFER_BINDING)).toBe(buffer);
    } finally {
      allocation.mockRestore();
      normalizer.destroy();
      gl.deleteBuffer(buffer);
    }
  });

  test('a warm normalization keeps its query and binding cost and reuses program objects', () => {
    const { gl } = createFakeGl();
    const normalizer = new WebGl2TextureNormalizer(gl, noopHost);
    const query = vi.spyOn(gl, 'getParameter');
    const bind = vi.spyOn(gl, 'useProgram');
    const allocate = vi.spyOn(gl, 'createProgram');
    const target = createTarget(2, 2);
    const data = new Uint8Array(16);

    normalizer.normalizePixels(target, data);
    expect(query).toHaveBeenCalledTimes(9);
    expect(bind).toHaveBeenCalledTimes(2);
    expect(allocate).toHaveBeenCalledTimes(1);
    query.mockClear();
    bind.mockClear();
    allocate.mockClear();

    for (let index = 0; index < 3; index++) {
      normalizer.normalizePixels(target, data);
    }

    expect(query).toHaveBeenCalledTimes(27);
    expect(bind).toHaveBeenCalledTimes(6);
    expect(allocate).not.toHaveBeenCalled();
    normalizer.destroy();
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
