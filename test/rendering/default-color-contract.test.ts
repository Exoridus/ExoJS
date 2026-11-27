/**
 * The default colour contract, asserted on the routes themselves: with no gate
 * to open, every source the engine accepts and every surface it draws into has
 * one named role, and the roles are the ones the colour contract requires.
 *
 * A source route is "an ordinary image is sRGB colour, a numeric payload is
 * numeric, and an explicit declaration wins"; a target route is "the frame's
 * own surfaces carry the working colour format, an arbitrary render target does
 * not, and the output transform is the one place a frame is encoded". The
 * per-resource resolution rules live in `texture/color-format-contract.test.ts`
 * and `texture/raw-color-texture.test.ts`; the shader-side helpers in
 * `shader-color-contract.test.ts`; the blend equations in
 * `blend-color-contract.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { Application } from '#core/Application';
import { resolveRenderingOptions } from '#core/application/ApplicationOptions';
import type { ApplicationSizing } from '#core/application/ApplicationSizing';
import { validateWorkingColorFormatSupport, workingColorTextureFormat } from '#rendering/OutputTransform';
import type { RenderBackend } from '#rendering/RenderBackend';
import { CompressedTexture } from '#rendering/texture/CompressedTexture';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { DataTexture } from '#rendering/texture/DataTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';

import { createRenderBackendDouble } from '../support/render-backend-double';

const root = resolve(__dirname, '../..');

/** Vitest stubs shader-module imports, so the sources are read from disk. */
const shaderSource = (path: string): string => readFileSync(resolve(root, path), 'utf8');

const canvas = (size = 2): HTMLCanvasElement => {
  const element = document.createElement('canvas');

  element.width = size;
  element.height = size;

  return element;
};

const compressedLevel = (format: CompressedTextureFormat, width: number, height: number) => ({
  data: new Uint8Array(compressedLevelByteLength(format, width, height)),
  width,
  height,
});

/**
 * The application reduced to what allocates a working target: a recording
 * backend double and a geometry, with nothing else the frame path touches.
 */
const workingTargetApp = (color: { workingFormat?: 'sdr' | 'hdr' } = {}): Application => {
  const app = Object.create(Application.prototype) as Application;
  const record = app as unknown as Record<string, unknown>;

  record['options'] = { rendering: resolveRenderingOptions({ color }) };
  record['_backend'] = createRenderBackendDouble();
  record['_geometry'] = { width: 8, height: 8, pixelRatio: 1 } as unknown as ApplicationSizing;
  record['_frameTexture'] = null;
  record['_workingSampleCountCache'] = 1;

  return app;
};

describe('default source route - an ordinary image is sRGB colour', () => {
  test('a canvas source lands in sRGB storage, with straight source alpha', () => {
    const texture = new Texture(canvas());

    expect(texture.resolvedMetadata.storageFormat).toBe(TextureFormat.Rgba8Srgb);
    expect(texture.colorSpace).toBe('srgb');
    expect(texture.alphaMode).toBe('straight');
  });

  test('a video element is the same route as an image', () => {
    const texture = new Texture(document.createElement('video'));

    expect(texture.resolvedMetadata.storageFormat).toBe(TextureFormat.Rgba8Srgb);
    expect(texture.colorSpace).toBe('srgb');
  });

  test('an explicit interpretation replaces the browser default rather than contradicting it', () => {
    const numeric = new Texture(canvas(), { colorSpace: 'none' });
    const linear = new Texture(canvas(), { colorSpace: 'linear-srgb' });

    // Only the sRGB route gets sRGB storage, so a declaration that is not
    // colour is never silently upgraded into it.
    expect(numeric.resolvedMetadata.storageFormat).toBe(TextureFormat.Rgba8);
    expect(numeric.colorSpace).toBe('none');
    expect(linear.resolvedMetadata.storageFormat).toBe(TextureFormat.Rgba8);
    expect(linear.colorSpace).toBe('linear-srgb');
  });
});

describe('default source route - the numerical raw APIs bypass colour conversion', () => {
  test('a raw pixel payload keeps exactly the meaning it declares', () => {
    const level = { data: new Uint8Array([128, 128, 128, 255]), width: 1, height: 1 };
    const srgb = Texture.fromPixels({ colorSpace: 'srgb', alphaMode: 'straight', levels: [level] });
    const numeric = Texture.fromPixels({ colorSpace: 'none', alphaMode: 'straight', levels: [level] });

    // The payload is RGBA8 bytes either way, so its storage identity does not
    // change; the declared colour space is what selects sRGB attachment storage
    // on the backend, and a numeric payload never gets one.
    expect(srgb.colorSpace).toBe('srgb');
    expect(numeric.colorSpace).toBe('none');
    expect(numeric.resolvedMetadata.storageFormat).toBe(TextureFormat.Rgba8);
  });

  test('a raw payload whose declared meaning contradicts its handle metadata is rejected', () => {
    const level = { data: new Uint8Array([128, 128, 128, 255]), width: 1, height: 1 };

    expect(() => Texture.fromPixels({ colorSpace: 'none', alphaMode: 'straight', levels: [level] }, { colorSpace: 'srgb' })).toThrow(
      /contradicts the payload/i,
    );
  });

  test('a DataTexture is numeric whatever it carries, and refuses an sRGB declaration', () => {
    const mask = new DataTexture({ width: 2, height: 2, format: TextureFormat.Rgba8 });

    expect(mask.colorSpace).toBe('none');
    expect(mask.premultiplyAlpha).toBe(false);
    expect(() => new DataTexture({ width: 2, height: 2, format: TextureFormat.Rgba8, textureOptions: { colorSpace: 'srgb' } })).toThrow(
      /colorSpace cannot be 'srgb'/,
    );
  });

  test('a compressed payload keeps its container identity: an sRGB format is colour, a linear one is not', () => {
    const srgb = new CompressedTexture({
      format: CompressedTextureFormat.Bc7RgbaUnormSrgb,
      levels: [compressedLevel(CompressedTextureFormat.Bc7RgbaUnormSrgb, 8, 8)],
    });
    const numeric = new CompressedTexture({
      format: CompressedTextureFormat.Bc5RgUnorm,
      levels: [compressedLevel(CompressedTextureFormat.Bc5RgUnorm, 8, 8)],
    });

    expect(srgb.colorSpace).toBe('srgb');
    expect(srgb.resolvedMetadata.storageFormat).toBe(CompressedTextureFormat.Bc7RgbaUnormSrgb);
    expect(numeric.colorSpace).toBe('none');
  });
});

describe('default target route - colour surfaces are named, arbitrary ones are not', () => {
  test('an application-created render target keeps its plain Rgba8 default', () => {
    // No automatic colour management on an arbitrary target: a caller who wants
    // sRGB attachment storage asks for it by format.
    const target = new RenderTexture(4, 4);

    expect(target.format).toBe(TextureFormat.Rgba8);
  });

  test('the frame texture is the explicit working colour format, not the bare default', () => {
    const app = workingTargetApp();
    const frame = app.frameTexture;

    expect(frame.format).toBe(TextureFormat.Rgba8Srgb);
    expect(workingColorTextureFormat('sdr')).toBe(TextureFormat.Rgba8Srgb);
    frame.destroy();
  });

  test('an HDR working request switches the frame target to a float attachment', () => {
    const app = workingTargetApp({ workingFormat: 'hdr' });
    const frame = app.frameTexture;

    expect(frame.format).toBe(TextureFormat.Rgba16F);
    expect(workingColorTextureFormat('hdr')).toBe(TextureFormat.Rgba16F);
    frame.destroy();
  });

  test('an HDR working request the backend cannot honour fails before the first frame', () => {
    const base = createRenderBackendDouble();
    const withoutFloat: RenderBackend = {
      ...base,
      supportsColorFormat: format => format !== TextureFormat.Rgba16F && base.supportsColorFormat(format),
    };

    expect(() => validateWorkingColorFormatSupport(withoutFloat, 'hdr')).toThrow(/Rgba16F/);
    expect(() => validateWorkingColorFormatSupport(withoutFloat, 'sdr')).not.toThrow();
  });
});

describe('default output route - the frame is encoded at the boundary, once', () => {
  test.each([
    ['WebGL2', 'src/rendering/shaders/output.frag'],
    ['WebGPU', 'src/rendering/shaders/output.wgsl'],
  ])('%s presents through one output pass that encodes exactly once', (_backend, path) => {
    const source = shaderSource(path);

    // Exposure and the HDR-to-SDR mapping run in linear light; the single
    // encode is the last thing before the canvas. A second one anywhere in this
    // stage would double-encode the whole frame.
    expect(source).toMatch(/linearToSrgb\(/);
    expect(source.match(/linearToSrgb\(/g)).toHaveLength(1);
    // The working image is linear and premultiplied, so it is unassociated (or
    // composited over the matte) before the encode rather than after it.
    expect(source).toMatch(/uExposureScale/);
    expect(source).toMatch(/uMatteColor/);
  });

  test('neither output pass decodes an sRGB sample: the working target already did it', () => {
    for (const path of ['src/rendering/shaders/output.frag', 'src/rendering/shaders/output.wgsl']) {
      expect(shaderSource(path)).not.toMatch(/srgbToLinear\(/);
    }
  });
});

describe('blending happens in linear light', () => {
  test('the frame target is an sRGB attachment, so destination blending and the subsequent sample are linear', () => {
    const app = workingTargetApp();
    const frame = app.frameTexture;

    // A stored sRGB attachment hardware-decodes on sample and hardware-encodes
    // on write; the blend factors in between therefore see linear light, which
    // is what the premultiplied source-over the engine installs assumes.
    expect(frame.format).toBe(TextureFormat.Rgba8Srgb);
    expect(frame.format).not.toBe(TextureFormat.Rgba8);
    frame.destroy();
  });
});
