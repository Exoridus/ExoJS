import { ParticleSystem } from '../src/ParticleSystem';

// ParticleSystem falls back to a lazily-initialised, module-level 1x1 white
// texture when constructed without one. That singleton is created at most
// once per module instance (`defaultWhiteTexture` lives at module scope) —
// this file is dedicated to it so its *first* access in this module's
// lifetime is deterministic (a fresh test file gets a fresh module graph),
// letting us exercise both the "not yet created" and "already created"
// branches, plus the defensive `getContext('2d') === null` fallback.

describe('ParticleSystem default white texture singleton', () => {
  test('falls back to a 1x1 texture even when 2D canvas context creation fails', () => {
    const original = HTMLCanvasElement.prototype.getContext;

    // Force the very first `getDefaultWhiteTexture()` call in this module's
    // lifetime down the `ctx === null` path (no fillRect performed).
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof original;

    try {
      const system = new ParticleSystem({ capacity: 1 });

      expect(system.texture.width).toBe(1);
      expect(system.texture.height).toBe(1);
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  test('reuses the already-created singleton on a later construction', () => {
    // The previous test already created and cached `defaultWhiteTexture` at
    // module scope; this second textureless construction must hit the
    // "already initialised" branch instead of creating a new canvas.
    const first = new ParticleSystem({ capacity: 1 }).texture;
    const second = new ParticleSystem({ capacity: 1 }).texture;

    expect(second).toBe(first);
  });
});
