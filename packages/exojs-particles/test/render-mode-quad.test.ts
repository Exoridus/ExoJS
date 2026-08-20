import { describe, expect, it } from 'vitest';

import { ParticleSystem } from '../src/ParticleSystem';
import { QuadParticles } from '../src/renderModes/QuadParticles';

describe('QuadParticles', () => {
  it('declares an instanced, GPU-eligible triangle-list mode', () => {
    const mode = new QuadParticles();

    expect(mode.instanced).toBe(true);
    expect(mode.gpuEligible).toBe(true);
    expect(mode.dataLayout.topology).toBe('triangle-list');
  });

  it('builds one 40-byte instance per live particle', () => {
    const system = new ParticleSystem({ capacity: 8 });
    const mode = new QuadParticles();

    for (let i = 0; i < 3; i++) {
      const slot = system._spawnSlot();
      system._storage.posX[slot] = i * 10;
      system._storage.posY[slot] = i * 20;
      system._storage.scaleX[slot] = 1;
      system._storage.scaleY[slot] = 1;
      system._storage.lifetime[slot] = 5;
    }

    mode.build(system, system._storage);

    expect(mode.count).toBe(3);
    expect(mode.data.byteLength).toBeGreaterThanOrEqual(3 * 40);

    const floats = new Float32Array(mode.data);

    // Instance 1 starts at float index 10 (40 bytes / 4).
    expect(floats[10]).toBe(10);
    expect(floats[11]).toBe(20);
  });

  it('reports zero instances for an empty system', () => {
    const mode = new QuadParticles();

    const empty = new ParticleSystem({ capacity: 8 });

    mode.build(empty, empty._storage);

    expect(mode.count).toBe(0);
  });
});
