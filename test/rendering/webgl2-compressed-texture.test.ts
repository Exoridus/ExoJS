/**
 * WebGL2 compressed-texture upload.
 *
 * Drives the REAL `WebGl2Backend` against the recording fake context and reads
 * back what it handed `compressedTexImage2D`: one call per mip level, in mip
 * order, with the internal format of the extension that carries the family. The
 * fake context reports no extensions by default, which is also the device shape
 * the refusal path has to produce - a loud `RenderError` rather than an upload of
 * bytes the driver would misread.
 */

import { afterEach, describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { RenderError } from '#rendering/RenderError';
import { CompressedTexture } from '#rendering/texture/CompressedTexture';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

interface RecordedCompressedUpload {
  readonly level: number;
  readonly internalFormat: number;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

interface CompressedHarness {
  readonly backend: WebGl2Backend;
  readonly uploads: RecordedCompressedUpload[];
  destroy(): void;
}

/** Internal formats of the extensions the engine probes, for asserting the mapping. */
const GL_COMPRESSED_RGBA_BPTC_UNORM = 0x8e8c;
const GL_COMPRESSED_RGBA8_ETC2_EAC = 0x9278;
const GL_COMPRESSED_RGBA_S3TC_DXT5 = 0x83f3;

const createHarness = (extensions: readonly string[]): CompressedHarness => {
  installFakeWebGl2Globals();

  const context = createFakeWebGl2Context(new GlRecorder());
  const uploads: RecordedCompressedUpload[] = [];
  const supported = new Set(extensions);
  // The fake context is a Proxy with no `set` trap, so these land on its target
  // and every backend call goes through the spies. Installed before the backend
  // exists: it probes the extensions once, in its constructor.
  const mutable = context as unknown as Record<string, unknown>;

  mutable['getExtension'] = (name: string): object | null => (supported.has(name) ? {} : null);
  mutable['compressedTexImage2D'] = (
    _target: number,
    level: number,
    internalFormat: number,
    width: number,
    height: number,
    _border: number,
    data: ArrayBufferView,
  ): void => {
    uploads.push({ level, internalFormat, width, height, byteLength: data.byteLength });
  };

  const app = {
    canvas: createFakeCanvas(64, 64, context),
    options: { canvas: { width: 64, height: 64 }, rendering: { debug: false } },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  uploads.length = 0;

  return {
    backend,
    uploads,
    destroy(): void {
      backend.destroy();
    },
  };
};

const chain = (format: CompressedTextureFormat, width: number, height: number, count: number) =>
  Array.from({ length: count }, (_unused, index) => {
    const levelWidth = Math.max(width >> index, 1);
    const levelHeight = Math.max(height >> index, 1);

    return { data: new Uint8Array(compressedLevelByteLength(format, levelWidth, levelHeight)), width: levelWidth, height: levelHeight };
  });

describe('WebGl2Backend.supportedTextureFormats', () => {
  let harness: CompressedHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('is empty on a context that exposes no compressed-texture extension', () => {
    harness = createHarness([]);

    expect(harness.backend.supportedTextureFormats).toEqual([]);
  });

  test('reports one family per enabled extension, in the engine preference order', () => {
    harness = createHarness(['WEBGL_compressed_texture_s3tc', 'EXT_texture_compression_bptc']);

    expect(harness.backend.supportedTextureFormats).toEqual([
      CompressedTextureFormat.Bc7RgbaUnorm,
      CompressedTextureFormat.Bc3RgbaUnorm,
      CompressedTextureFormat.Bc2RgbaUnorm,
      CompressedTextureFormat.Bc1RgbaUnorm,
      CompressedTextureFormat.Bc6hRgbUfloat,
      CompressedTextureFormat.Bc6hRgbFloat,
    ]);
  });

  test('one ASTC extension carries every block size, and RGTC carries both signednesses', () => {
    harness = createHarness(['WEBGL_compressed_texture_astc']);

    expect(harness.backend.supportedTextureFormats.filter(format => format.startsWith('astc-'))).toHaveLength(14);

    harness.destroy();
    harness = createHarness(['EXT_texture_compression_rgtc']);

    expect(harness.backend.supportedTextureFormats).toEqual([
      CompressedTextureFormat.Bc5RgUnorm,
      CompressedTextureFormat.Bc5RgSnorm,
      CompressedTextureFormat.Bc4RUnorm,
      CompressedTextureFormat.Bc4RSnorm,
    ]);
  });

  test('probes ETC2 rather than assuming it from the context version', () => {
    harness = createHarness(['WEBGL_compressed_texture_etc']);

    expect(harness.backend.supportedTextureFormats).toContain(CompressedTextureFormat.Etc2Rgba8Unorm);

    harness.destroy();
    harness = createHarness([]);

    expect(harness.backend.supportedTextureFormats).not.toContain(CompressedTextureFormat.Etc2Rgba8Unorm);
  });
});

describe('WebGl2Backend compressed upload', () => {
  let harness: CompressedHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('uploads one level with the internal format of its extension', () => {
    harness = createHarness(['EXT_texture_compression_bptc']);

    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const texture = new CompressedTexture({ format, levels: chain(format, 16, 8, 1) });

    harness.backend.bindTexture(texture, 0);

    expect(harness.uploads).toEqual([{ level: 0, internalFormat: GL_COMPRESSED_RGBA_BPTC_UNORM, width: 16, height: 8, byteLength: 128 }]);

    texture.destroy();
  });

  test('uploads a mip chain as one call per level, in mip order', () => {
    harness = createHarness(['EXT_texture_compression_bptc']);

    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const texture = new CompressedTexture({ format, levels: chain(format, 16, 16, 3) });

    harness.backend.bindTexture(texture, 0);

    expect(harness.uploads.map(({ level, width, height }) => [level, width, height])).toEqual([
      [0, 16, 16],
      [1, 8, 8],
      [2, 4, 4],
    ]);

    texture.destroy();
  });

  test('maps each family onto its own internal format', () => {
    harness = createHarness(['WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_etc']);

    const bc3 = new CompressedTexture({
      format: CompressedTextureFormat.Bc3RgbaUnorm,
      levels: chain(CompressedTextureFormat.Bc3RgbaUnorm, 8, 8, 1),
    });
    const etc2 = new CompressedTexture({
      format: CompressedTextureFormat.Etc2Rgba8Unorm,
      levels: chain(CompressedTextureFormat.Etc2Rgba8Unorm, 8, 8, 1),
    });

    harness.backend.bindTexture(bc3, 0);
    harness.backend.bindTexture(etc2, 1);

    expect(harness.uploads.map(({ internalFormat }) => internalFormat)).toEqual([GL_COMPRESSED_RGBA_S3TC_DXT5, GL_COMPRESSED_RGBA8_ETC2_EAC]);

    bc3.destroy();
    etc2.destroy();
  });

  test('does not re-upload an unchanged texture on a second bind', () => {
    harness = createHarness(['EXT_texture_compression_bptc']);

    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const texture = new CompressedTexture({ format, levels: chain(format, 8, 8, 1) });

    harness.backend.bindTexture(texture, 0);
    harness.backend.bindTexture(texture, 1);

    expect(harness.uploads).toHaveLength(1);

    texture.destroy();
  });

  test('refuses a format the context does not implement instead of uploading it', () => {
    harness = createHarness(['WEBGL_compressed_texture_etc']);

    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const texture = new CompressedTexture({ format, levels: chain(format, 8, 8, 1) });
    const bind = (): void => {
      harness?.backend.bindTexture(texture, 0);
    };

    expect(bind).toThrow(RenderError);
    expect(bind).toThrow(/cannot sample the compressed texture format "bc7-rgba-unorm"/);
    expect(harness.uploads).toEqual([]);

    texture.destroy();
  });

  test('carries the machine-readable failure class', () => {
    harness = createHarness([]);

    const format = CompressedTextureFormat.Bc1RgbaUnorm;
    const texture = new CompressedTexture({ format, levels: chain(format, 8, 8, 1) });

    try {
      harness.backend.bindTexture(texture, 0);
      expect.unreachable('binding an unsupported compressed format must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe('unsupported-format');
    }

    texture.destroy();
  });
});
