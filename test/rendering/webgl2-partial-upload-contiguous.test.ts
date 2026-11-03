/**
 * WebGL2 partial `DataTexture` upload: the full-width fast path.
 *
 * A dirty region spanning the full texture width is already contiguous and
 * tightly packed in the row-major buffer, so packing it into the per-texture
 * scratch is a pure memcpy that changes none of the bytes GL reads. WebGL2's
 * `texSubImage2D(..., srcData, srcOffset)` overload takes the band straight out
 * of the texture buffer at an element offset, which removes that copy entirely
 * - and with it the reason to grow a scratch buffer for the shape every
 * ring-buffer style upload takes (transform/tint rows, scrolling
 * spectrograms).
 *
 * These tests drive the REAL `WebGl2Backend._syncTexture` against the recording
 * fake context and inspect the arguments handed to `texSubImage2D`, so they
 * assert the call shape directly. The bytes that reach a real driver are
 * covered by the Chromium WebGL2 lane in
 * `test/rendering/browser/webgl2-data-texture-partial-upload.test.ts`.
 */

import { runInNewContext } from 'node:vm';

import type { Application } from '#core/Application';
import { DataTexture } from '#rendering/texture/DataTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

/** `_syncTexture` is the backend-internal upload entry point exercised here. */
const syncTexture = (backend: WebGl2Backend, texture: Texture): void => {
  (backend as unknown as { _syncTexture(target: Texture): unknown })._syncTexture(texture);
};

interface UploadHarness {
  readonly backend: WebGl2Backend;
  /** Every `texSubImage2D` argument list recorded since construction. */
  readonly calls: readonly unknown[][];
  destroy(): void;
}

const createUploadHarness = (): UploadHarness => {
  installFakeWebGl2Globals();

  const context = createFakeWebGl2Context(new GlRecorder());
  const calls: unknown[][] = [];
  const original = context.texSubImage2D.bind(context) as (...args: unknown[]) => void;

  // The fake context is a Proxy with no `set` trap, so this lands on its target
  // and every backend call goes through the spy.
  (context as unknown as Record<string, unknown>)['texSubImage2D'] = (...args: unknown[]): void => {
    calls.push(args);
    original(...args);
  };

  const app = {
    canvas: createFakeCanvas(64, 64, context),
    options: { canvas: { width: 64, height: 64 }, rendering: { debug: false } },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  return {
    backend,
    calls,
    destroy(): void {
      backend.destroy();
    },
  };
};

describe('WebGL2 partial DataTexture upload: full-width fast path', () => {
  let harness: UploadHarness;

  beforeEach(() => {
    harness = createUploadHarness();
  });

  afterEach(() => {
    harness.destroy();
  });

  test.each([TextureFormat.R32F, TextureFormat.Rgba32F])('packs foreign-realm %s samples without conversion and reuses scratch', format => {
    const channels = format === TextureFormat.R32F ? 1 : 4;
    const data = runInNewContext('new Float32Array(40 * 4 * CHANNELS + 4).subarray(4)', { CHANNELS: channels }) as Float32Array;

    for (let index = 0; index < data.length; index++) {
      data[index] = index / 4 - 20;
    }

    expect(data).not.toBeInstanceOf(Float32Array);

    const texture = new DataTexture({ width: 40, height: 4, format, data });

    syncTexture(harness.backend, texture);

    texture.commitRect(1, 1, 20, 2);
    syncTexture(harness.backend, texture);

    const packed = harness.calls[0]![8] as Float32Array;
    const expected = [...data.subarray(41 * channels, 61 * channels), ...data.subarray(81 * channels, 101 * channels)];

    expect(packed).toBeInstanceOf(Float32Array);
    expect(Array.from(packed)).toEqual(expected);

    texture.commitRect(1, 1, 2, 2);
    syncTexture(harness.backend, texture);
    texture.commitRect(1, 1, 2, 2);
    syncTexture(harness.backend, texture);

    const first = harness.calls[1]![8] as Float32Array;
    const second = harness.calls[2]![8] as Float32Array;

    expect(first.buffer).toBe(packed.buffer);
    expect(second).toBe(first);
    expect(Array.from(first.subarray(0, 2 * channels))).toEqual(Array.from(data.subarray(41 * channels, 43 * channels)));
    texture.destroy();
  });

  test('a full-width band is uploaded straight from the texture buffer, without packing', () => {
    const texture = new DataTexture({ width: 8, height: 8, format: TextureFormat.R32F });

    // First sync uploads the whole buffer via texImage2D (nothing packed yet).
    syncTexture(harness.backend, texture);
    expect(harness.calls).toHaveLength(0);

    texture.commitRect(0, 3, 8, 2);
    syncTexture(harness.backend, texture);

    const [band] = harness.calls;

    expect(band).toBeDefined();
    // (target, level, xoffset, yoffset, width, height, format, type, srcData, srcOffset)
    expect(band).toHaveLength(10);
    expect(band![8]).toBe(texture.buffer);
    expect(band![9]).toBe(3 * 8);

    texture.destroy();
  });

  test('a moving band changes only the element offset, never the source view', () => {
    const texture = new DataTexture({ width: 4, height: 8, format: TextureFormat.Rgba32F });

    syncTexture(harness.backend, texture);

    texture.commitRect(0, 1, 4, 1);
    syncTexture(harness.backend, texture);
    texture.commitRect(0, 5, 4, 1);
    syncTexture(harness.backend, texture);

    const [first, second] = harness.calls;

    expect(first![8]).toBe(texture.buffer);
    expect(second![8]).toBe(texture.buffer);
    expect(first![9]).toBe(1 * 4 * 4);
    expect(second![9]).toBe(5 * 4 * 4);

    texture.destroy();
  });

  test('a region narrower than the texture still goes through the packing scratch', () => {
    const texture = new DataTexture({ width: 8, height: 8, format: TextureFormat.R32F });

    syncTexture(harness.backend, texture);

    // Full-height but one column short - the rows are no longer contiguous.
    texture.commitRect(0, 0, 7, 8);
    syncTexture(harness.backend, texture);

    const [packed] = harness.calls;

    expect(packed).toBeDefined();
    // Packed into the per-texture scratch, which is at least the region's size
    // and handed to GL through the same `(srcData, srcOffset)` overload - the
    // rectangle's dimensions fix how much is read, so the scratch never has to
    // be narrowed to an exact-length view.
    expect(packed).toHaveLength(10);
    expect(packed![8]).not.toBe(texture.buffer);
    expect((packed![8] as Float32Array).length).toBeGreaterThanOrEqual(7 * 8);
    expect(packed![9]).toBe(0);

    texture.destroy();
  });

  test('the packed rows still carry exactly the sub-region contents', () => {
    const texture = new DataTexture({ width: 4, height: 4, format: TextureFormat.R8 });

    for (let index = 0; index < texture.buffer.length; index++) {
      texture.buffer[index] = index;
    }

    syncTexture(harness.backend, texture);

    // Rows 1..2, columns 1..2 → source indices 5, 6, 9, 10.
    texture.commitRect(1, 1, 2, 2);
    syncTexture(harness.backend, texture);

    const [packed] = harness.calls;

    // Only the region's own elements are read (2x2 from offset 0); whatever the
    // scratch holds past them is never uploaded.
    expect(Array.from((packed![8] as Uint8Array).subarray(0, 4))).toEqual([5, 6, 9, 10]);
    expect(packed![9]).toBe(0);

    texture.destroy();
  });
});
