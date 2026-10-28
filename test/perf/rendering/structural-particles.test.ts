/**
 * Tier-A structural regression tests for the WebGL2 particle renderer.
 *
 * Key measured fact: the renderer's per-instance buffer is a CPU-side scratch
 * allocation that the GL buffer is re-sized from on upload - not a hardware
 * limit. A system holding more live particles than the configured batch size
 * must therefore still draw every one of them, matching the WebGPU renderer
 * which grows its instance buffer on demand. Anything less means the same
 * scene renders a different particle count per backend.
 */
import { describe, expect, it, vi } from 'vitest';

import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';

import { createParticlesExtension } from '../../../packages/exojs-particles/src/particlesExtension';
import { ParticleSystem } from '../../../packages/exojs-particles/src/ParticleSystem';
import { MeshParticles } from '../../../packages/exojs-particles/src/renderModes/MeshParticles';
import { makeTextures } from './fixtures';
import { createWebGl2Harness, measureFrame, type WebGl2Harness } from './harness';

const withParticleHarness = (batchSize: number, fn: (harness: WebGl2Harness) => void): void => {
  const harness = createWebGl2Harness();

  materializeRendererBindings(harness.backend, createParticlesExtension({ batchSize }).renderers!);

  try {
    fn(harness);
  } finally {
    harness.destroy();
  }
};

/**
 * Build a system with `count` live particles at the view centre. Slots are
 * written directly and `update()` is never called, so nothing expires and the
 * live count is exactly `count`.
 */
const buildParticleScene = (count: number): { root: Container; system: ParticleSystem } => {
  const texture = makeTextures(1)[0]!;
  const system = new ParticleSystem(texture, { capacity: count });
  const root = new Container();

  for (let i = 0; i < count; i++) {
    system.emit();
  }

  system.setPosition(640, 360);
  root.addChild(system);

  return { root, system };
};

describe('structural — WebGL2 particles', () => {
  it('updates nonindexed mesh draw counts across growth and shrink', () => {
    withParticleHarness(8, harness => {
      const geometry = new Geometry({
        attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
        vertexData: new Float32Array([0, 0, 16, 0, 0, 16]),
        stride: 8,
      });
      const mode = new MeshParticles({ geometry });
      const system = new ParticleSystem(makeTextures(1)[0]!, { capacity: 1, render: mode });
      const root = new Container();
      const unindexed = vi.spyOn(harness.context, 'drawArraysInstanced');

      system.emit();
      system.setPosition(640, 360);
      root.addChild(system);
      measureFrame(harness, root);
      expect(unindexed).toHaveBeenLastCalledWith(4, 0, 3, 1);

      geometry.vertexData = new Float32Array([0, 0, 32, 0, 32, 32, 0, 32]);
      geometry.invalidate();
      measureFrame(harness, root);
      expect(unindexed).toHaveBeenLastCalledWith(4, 0, 4, 1);

      geometry.vertexData = new Float32Array([0, 0, 8, 0, 0, 8]);
      geometry.invalidate();
      measureFrame(harness, root);
      expect(unindexed).toHaveBeenLastCalledWith(4, 0, 3, 1);

      root.destroy();
      mode.destroy();
      geometry.destroy();
    });
  });

  it('draws every live particle when the count is below the batch size', () => {
    withParticleHarness(256, harness => {
      const { root, system } = buildParticleScene(100);

      expect(system.liveCount).toBe(100);
      expect(measureFrame(harness, root).instances).toBe(100);

      root.destroy();
    });
  });

  it('draws every live particle when the count exceeds the batch size', () => {
    withParticleHarness(64, harness => {
      const { root, system } = buildParticleScene(500);

      expect(system.liveCount).toBe(500);
      // Previously clamped to the batch size, silently dropping 436 particles.
      expect(measureFrame(harness, root).instances).toBe(500);

      root.destroy();
    });
  });

  it('keeps the grown capacity across frames instead of reallocating every frame', () => {
    withParticleHarness(64, harness => {
      const { root } = buildParticleScene(500);

      measureFrame(harness, root);
      const second = measureFrame(harness, root);

      expect(second.instances).toBe(500);
      // The scratch buffer already covers 500 instances, so the second frame
      // must not orphan-reallocate the instance store again.
      expect(second.bufferReallocations).toBe(0);

      root.destroy();
    });
  });
});
