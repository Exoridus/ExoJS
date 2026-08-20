/**
 * Particle scenes.
 *
 * Particles render as instanced quads driven by a struct-of-arrays buffer, so
 * this measures a path no other scene touches: per-instance position, scale and
 * colour read straight from typed arrays on WebGL2, from a storage buffer on
 * WebGPU.
 *
 * Placement bypasses spawn and update modules and writes the SoA slot directly.
 * That is deliberate - the simulation is time- and RNG-driven, and a scene the
 * determinism property cannot trust would report noise as divergence. What is
 * under test here is the rendering of a known particle state, not the
 * simulation that would normally produce it.
 */

import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';

// Package path rather than the alias: `@codexo/exojs-particles` has no vite
// alias in the browser projects, which is why every particle browser test
// reaches into the source directly.
import { particlesExtension, ParticleSystem } from '../../../../packages/exojs-particles/src/index';
import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import type { Scene } from '../types';

const FIXTURE = 16;
const CANVAS = 64;

export const particleScenes: readonly Scene[] = [
  {
    name: 'particles/static-quad',
    feature: 'Particles',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    wireRenderers: backend => materializeRendererBindings(backend, particlesExtension.renderers ?? []),
    build: () => {
      const root = new Container();
      const system = new ParticleSystem(buildCoordinateTexture(FIXTURE), { capacity: 4 });
      // Emission defaults are exactly what this scene wants: origin, unit
      // scale, no rotation, opaque white so the coordinate texture reaches the
      // frame intact, and a lifetime only update() would ever consult.
      system.emit();

      // The quad is system-local and centred on the origin, so this puts it in
      // the middle of the canvas, clear of every edge.
      system.setPosition(CANVAS / 2, CANVAS / 2);
      root.addChild(system);

      return root;
    },
  },
];
