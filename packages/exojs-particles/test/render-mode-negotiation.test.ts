import { describe, expect, it, vi } from 'vitest';

import { ParticleSystem } from '../src/ParticleSystem';
import { QuadParticles } from '../src/renderModes/QuadParticles';

describe('ParticleSystem render mode', () => {
  it('defaults to QuadParticles', () => {
    expect(new ParticleSystem({ capacity: 4 }).renderMode).toBeInstanceOf(QuadParticles);
  });

  it('uses the supplied mode', () => {
    const mode = new QuadParticles();

    expect(new ParticleSystem({ capacity: 4, render: mode }).renderMode).toBe(mode);
  });

  it('destroys the mode with the system', () => {
    const mode = new QuadParticles();
    const spy = vi.spyOn(mode, 'destroy');

    new ParticleSystem({ capacity: 4, render: mode }).destroy();

    expect(spy).toHaveBeenCalledOnce();
  });
});
