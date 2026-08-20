/**
 * The default render mode is shared process-wide, and both backend renderers
 * key their GPU resources (compiled program / pipelines, vertex array object,
 * vertex buffer) on the mode's `Material`. So material identity across systems
 * is exactly the property that decides whether N particle systems cost one
 * shader compile or N — which is what these specs pin down.
 */

import { describe, expect, it, vi } from 'vitest';

import { ParticleSystem } from '../src/ParticleSystem';
import { QuadParticles } from '../src/renderModes/QuadParticles';

const spawnParticle = (system: ParticleSystem): void => {
  const slot = system._spawnSlot();

  system._storage.scaleX[slot] = 1;
  system._storage.scaleY[slot] = 1;
  system._storage.lifetime[slot] = 5;
};

describe('default render mode sharing', () => {
  it('gives every defaulted system the same mode and material', () => {
    const first = new ParticleSystem({ capacity: 4 });
    const second = new ParticleSystem({ capacity: 4 });

    expect(second.renderMode).toBe(first.renderMode);
    expect(second.renderMode.material).toBe(first.renderMode.material);
    expect(second.renderMode.dataLayout).toBe(first.renderMode.dataLayout);
  });

  it('keeps a supplied mode out of the shared default', () => {
    const supplied = new QuadParticles();
    const defaulted = new ParticleSystem({ capacity: 4 });

    expect(new ParticleSystem({ capacity: 4, render: supplied }).renderMode).not.toBe(defaulted.renderMode);
  });

  it('leaves the other systems renderable when one is destroyed', () => {
    const destroyed = new ParticleSystem({ capacity: 4 });
    const survivor = new ParticleSystem({ capacity: 4 });
    const mode = survivor.renderMode;
    const material = mode.material;
    const materialDisposed = vi.fn();

    material._onDispose(materialDisposed);

    destroyed.destroy();

    // No dispose fired means no renderer evicted its cached resources, so the
    // survivor still draws through the program that was already compiled.
    expect(materialDisposed).not.toHaveBeenCalled();
    expect(survivor.renderMode.material).toBe(material);

    spawnParticle(survivor);
    survivor.renderMode.build(survivor, survivor._storage);

    expect(survivor.renderMode.count).toBe(1);
  });

  it('reuses the same material for a system built after every other one was destroyed', () => {
    const material = new ParticleSystem({ capacity: 4 }).renderMode.material;
    const first = new ParticleSystem({ capacity: 4 });
    const second = new ParticleSystem({ capacity: 4 });

    first.destroy();
    second.destroy();

    expect(new ParticleSystem({ capacity: 4 }).renderMode.material).toBe(material);
  });

  it('destroys a supplied mode with its system', () => {
    const supplied = new QuadParticles();
    const spy = vi.spyOn(supplied, 'destroy');

    new ParticleSystem({ capacity: 4, render: supplied }).destroy();

    expect(spy).toHaveBeenCalledOnce();
  });
});
