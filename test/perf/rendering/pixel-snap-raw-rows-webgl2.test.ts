/**
 * Structural gate for the WebGL2 GPU-side position pixel snap (spec D3-D5): once
 * the snap moves into the vertex shaders, the transform-buffer seam must upload
 * the drawable's RAW global transform — the CPU no longer rounds the translation.
 *
 * This runs the real {@link WebGl2Backend} + sprite renderer against the
 * recording fake GL context (GPU-free, CI-safe) and inspects the shared
 * transform buffer directly: a `PixelSnapMode.Position` sprite placed at a
 * fractional world position must land in its row UN-snapped (translation exactly
 * the fractional value), with the row's snap-mode flag set so the shader knows to
 * snap it on the GPU.
 *
 * Before the seam flip this FAILS — the CPU seam rounds the translation to the
 * nearest device pixel, so the row reads the snapped integer, not the raw value.
 */
import { describe, expect, it } from 'vitest';

import { Container } from '#rendering/Container';
import { PixelSnapMode } from '#rendering/pixelSnap';
import { Sprite } from '#rendering/sprite/Sprite';
import type { TransformBuffer } from '#rendering/TransformBuffer';
import { TRANSFORM_FLOATS_PER_ROW } from '#rendering/TransformBuffer';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { makeTextures } from './fixtures';
import { createWebGl2Harness, measureFrame } from './harness';

const transformBufferOf = (backend: WebGl2Backend): TransformBuffer => (backend as unknown as { _transformBuffer: TransformBuffer })._transformBuffer;

describe('WebGL2 raw transform rows (GPU position snap seam flip)', () => {
  it('a position-snapped sprite uploads its RAW fractional translation with the snap flag set', () => {
    const harness = createWebGl2Harness({ width: 256, height: 256 });

    try {
      const [texture] = makeTextures(1);
      const root = new Container();
      const sprite = new Sprite(texture!);

      // Fractional world position that a CPU device-pixel snap would round away.
      sprite.setPosition(20.4, 20.6);
      sprite.pixelSnapMode = PixelSnapMode.Position;
      root.addChild(sprite);

      measureFrame(harness, root);

      const data = transformBufferOf(harness.backend).data;
      // Row 0 (the only drawable). Layout: 0..3 = (a,b,c,d), 4 = tx, 5 = ty,
      // 6 = snapMode flag, 7 = 0, 8..11 = tint.
      const base = 0 * TRANSFORM_FLOATS_PER_ROW;

      // Float32-exact expected translation: the row stores the fractional value
      // verbatim (no CPU rounding), so compare against the float32 round-trip of
      // the raw position rather than the double literal.
      const expected = new Float32Array([20.4, 20.6]);

      expect(data[base + 4]).toBe(expected[0]);
      expect(data[base + 5]).toBe(expected[1]);
      // The shader reads this flag (m1.z) to decide whether to snap the origin.
      expect(data[base + 6]).toBe(PixelSnapMode.Position);

      root.destroy();
    } finally {
      harness.destroy();
    }
  });
});
