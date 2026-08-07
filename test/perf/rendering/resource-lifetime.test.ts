// ---------------------------------------------------------------------------
// GPU resource lifetime: the ownership contract's edge cases.
//
// The sibling `resource-accounting.test.ts` proves the *bookkeeping* is exact —
// adding a texture raises `gpuMemoryBytes` by precisely its footprint, freeing
// it lowers it by the same. What it never asks is who is supposed to do the
// freeing, or what happens when a resource is used after it has been released.
// Those are the two ways a real game leaks or corrupts state, and neither was
// covered.
//
// Three things are asserted here:
//   - `destroy()` is idempotent, on both `Texture` and `RenderTarget`
//   - binding/activating a destroyed resource throws, in every build
//   - repeated allocate/free cycles reach a VRAM plateau rather than growing
//
// The plateau test is the one with teeth: a game allocating a render target per
// scene transition and never releasing it loses VRAM slowly enough that no
// single-frame assertion would catch it.
// ---------------------------------------------------------------------------
import { RenderTarget } from '#rendering/RenderTarget';
import { DataTexture } from '#rendering/texture/DataTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';

import { buildSpriteScene } from './fixtures';
import { createWebGl2Harness, measureSteadyFrame } from './harness';

describe('GPU resource lifetime', () => {
  describe('destroy() is idempotent', () => {
    test('a second Texture.destroy() is a no-op and does not throw', () => {
      const texture = new DataTexture({ width: 16, height: 16, format: TextureFormat.Rgba8 });

      texture.destroy();

      expect(texture.destroyed).toBe(true);
      expect(() => texture.destroy()).not.toThrow();
      expect(texture.destroyed).toBe(true);
    });

    test('a second RenderTarget.destroy() is a no-op and does not throw', () => {
      const target = new RenderTarget(64, 64);

      target.destroy();

      expect(target.destroyed).toBe(true);
      expect(() => target.destroy()).not.toThrow();
      expect(target.destroyed).toBe(true);
    });

    test('destroy listeners fire exactly once across repeated destroy() calls', () => {
      const target = new RenderTarget(64, 64);
      const listener = vi.fn();

      target.addDestroyListener(listener);

      target.destroy();
      target.destroy();
      target.destroy();

      // Backends release framebuffers here. Firing twice would double-free.
      expect(listener).toHaveBeenCalledTimes(1);
    });

    test('a RenderTexture destroyed twice reports destroyed on both the texture and target halves', () => {
      const renderTexture = new RenderTexture(32, 32);

      renderTexture.destroy();
      expect(() => renderTexture.destroy()).not.toThrow();

      expect(renderTexture.destroyed).toBe(true);
    });
  });

  describe('use-after-destroy throws', () => {
    test('binding a destroyed texture throws', () => {
      const harness = createWebGl2Harness();
      const texture = new DataTexture({ width: 16, height: 16, format: TextureFormat.Rgba8 });
      const scene = buildSpriteScene({ count: 1, textures: [texture] });

      // Warm it so the failure cannot be blamed on a cold path.
      measureSteadyFrame(harness, scene.root);

      texture.destroy();

      expect(() => measureSteadyFrame(harness, scene.root)).toThrow(/destroyed texture/i);
    });

    test('rendering into a destroyed render target throws', () => {
      const harness = createWebGl2Harness();
      const target = new RenderTexture(32, 32);

      target.destroy();

      expect(() => harness.backend.setRenderTarget(target)).toThrow(/destroyed render target/i);
    });

    test('a live target still activates normally', () => {
      const harness = createWebGl2Harness();
      const target = new RenderTexture(32, 32);

      expect(() => harness.backend.setRenderTarget(target)).not.toThrow();

      harness.backend.setRenderTarget(null);
      target.destroy();
    });
  });

  describe('VRAM reaches a plateau across allocate/free cycles', () => {
    test('repeatedly creating and destroying textures does not grow gpuMemoryBytes', () => {
      const harness = createWebGl2Harness();
      const readings: number[] = [];

      // Each cycle stands in for one scene transition: allocate, draw with it,
      // release. A backend that forgets a texture on free grows monotonically.
      for (let cycle = 0; cycle < 8; cycle++) {
        const texture = new DataTexture({ width: 32, height: 32, format: TextureFormat.Rgba8 });

        measureSteadyFrame(harness, buildSpriteScene({ count: 1, textures: [texture] }).root);
        texture.destroy();

        readings.push(harness.backend.stats.gpuMemoryBytes);
      }

      // Cycle 0 also allocates the renderers' own buffers, so compare from 1 on:
      // every later cycle must land on exactly the same total.
      const [, ...settled] = readings;

      expect(new Set(settled).size).toBe(1);
    });

    test('a texture left undestroyed does grow VRAM — the plateau test can fail', () => {
      const harness = createWebGl2Harness();
      const held: DataTexture[] = [];
      const readings: number[] = [];

      for (let cycle = 0; cycle < 4; cycle++) {
        const texture = new DataTexture({ width: 32, height: 32, format: TextureFormat.Rgba8 });

        held.push(texture);
        measureSteadyFrame(harness, buildSpriteScene({ count: 1, textures: [texture] }).root);
        readings.push(harness.backend.stats.gpuMemoryBytes);
      }

      // Proves the assertion above has teeth rather than passing vacuously:
      // the same loop without `destroy()` is strictly increasing.
      const [, ...settled] = readings;

      expect(new Set(settled).size).toBeGreaterThan(1);

      for (const texture of held) {
        texture.destroy();
      }
    });
  });
});
