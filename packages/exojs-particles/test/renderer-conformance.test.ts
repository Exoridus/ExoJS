/**
 * Renderer conformance for the particles extension's renderer binding.
 *
 * The suite is core test support and is reached by relative path, the same way
 * the format adapters reach `../../../src/extensions/snapshot`.
 *
 * No overflow scenario: the WebGL2 particle renderer draws one system per batch
 * and flushes the pending one on every `render`, so it has no shared capacity to
 * overrun - a system larger than its pre-sized store grows the store instead,
 * which `particle-buffer-layout` covers. The WebGPU half of the binding has no
 * Node double and belongs to the browser lanes.
 */
import { Texture } from '@codexo/exojs';
import type { RendererBinding } from '@codexo/exojs/extensions';
import { expect } from 'vitest';

import { describeRendererConformance } from '../../../test/support/renderer-conformance';
import { particlesExtension } from '../src/particlesExtension';
import { ParticleSystem } from '../src/ParticleSystem';

const makeTexture = (size = 16): Texture => {
  const texture = new Texture();

  texture.setSize(size, size);

  return texture;
};

/** A system carrying `count` live particles, spread so none sits on top of another. */
const makeParticleSystem = (count: number): ParticleSystem => {
  const system = new ParticleSystem(makeTexture(), { capacity: count });

  for (let index = 0; index < count; index++) {
    const particle = system.emit();

    expect(particle, 'the system must have capacity for every emitted particle').not.toBeNull();
    particle!.position.set(index * 8, index * 4);
    particle!.lifetime = 10;
  }

  expect(system.liveCount, 'the samples must actually carry live particles, otherwise the renderer draws nothing').toBe(count);

  return system;
};

const particlesBinding = (): RendererBinding => {
  const bindings = particlesExtension.renderers ?? [];

  expect(bindings, 'the particles extension must declare exactly one renderer binding').toHaveLength(1);

  return bindings[0]!;
};

describeRendererConformance('ParticleSystem', particlesBinding(), {
  drawables: () => [makeParticleSystem(64), makeParticleSystem(8)],
});
