import { Color } from '@codexo/exojs';

import { ColorGradient } from '../src/distributions/ColorGradient';
import { Curve } from '../src/distributions/Curve';
import { AlphaFadeOverLifetime } from '../src/modules/AlphaFadeOverLifetime';
import { ApplyForce } from '../src/modules/ApplyForce';
import { AttractToPoint } from '../src/modules/AttractToPoint';
import { ColorOverLifetime } from '../src/modules/ColorOverLifetime';
import { ColorOverSpeed } from '../src/modules/ColorOverSpeed';
import { Drag } from '../src/modules/Drag';
import { OrbitalForce } from '../src/modules/OrbitalForce';
import { RepelFromPoint } from '../src/modules/RepelFromPoint';
import { RotateOverLifetime } from '../src/modules/RotateOverLifetime';
import { ScaleOverLifetime } from '../src/modules/ScaleOverLifetime';
import { Turbulence } from '../src/modules/Turbulence';
import type { UpdateModule } from '../src/modules/UpdateModule';
import { VelocityOverLifetime } from '../src/modules/VelocityOverLifetime';
import type { ParticleBatch } from '../src/ParticleStorage';

const batch = (): ParticleBatch => ({
  count: 1,
  capacity: 1,
  position: { x: new Float32Array(1), y: new Float32Array(1) },
  velocity: { x: new Float32Array([100]), y: new Float32Array(1) },
  scale: { x: new Float32Array(1), y: new Float32Array(1) },
  rotation: { angle: new Float32Array(1), speed: new Float32Array(1) },
  timing: { elapsed: new Float32Array([0.5]), lifetime: new Float32Array([1]) },
  color: new Uint32Array([0xffffffff]),
  frame: new Uint16Array(1),
  isAlive: () => true,
});

describe('backend-neutral particle modules', () => {
  const curve = new Curve([
    { t: 0, v: 1 },
    { t: 1, v: 0 },
  ]);
  const gradient = new ColorGradient([
    { t: 0, color: new Color(0, 0, 0) },
    { t: 1, color: new Color(255, 255, 255) },
  ]);
  const modules: UpdateModule[] = [
    new ApplyForce(1, 2),
    new Drag(1),
    new RotateOverLifetime(1),
    new AttractToPoint(1, 2, 3),
    new RepelFromPoint(1, 2, 3),
    new OrbitalForce(1, 2, 3),
    new Turbulence(1),
    new ScaleOverLifetime(curve),
    new VelocityOverLifetime(curve),
    new AlphaFadeOverLifetime(curve),
    new ColorOverLifetime(gradient),
    new ColorOverSpeed(gradient, 0, 100),
  ];

  test.each(modules)('%s supplies explicit GLSL with the same resources as WGSL', module => {
    const wgsl = module.wgsl!();
    const glsl = module.glsl?.();
    expect(glsl).toBeDefined();
    expect(glsl?.key).toBe(wgsl.key);
    expect(glsl?.uniforms).toEqual(wgsl.uniforms);
    expect(glsl?.textures).toEqual(wgsl.textures);

    for (const texture of glsl?.textures ?? []) {
      expect(module.textureData?.().get(texture.name)?.byteLength).toBe(1024);
    }
  });

  test('velocity ratio is independent of slot reuse and previous module calls', () => {
    const module = new VelocityOverLifetime(curve);
    const particles = batch();
    module.apply(particles, 0.25);
    expect(particles.velocity.x[0]).toBeCloseTo((100 * 0.5) / 0.75);
    particles.velocity.x[0] = 100;
    module.apply(particles, 0.25);
    expect(particles.velocity.x[0]).toBeCloseTo((100 * 0.5) / 0.75);
  });

  test('curve CPU sampling matches the shared LUT across a narrow keyframe', () => {
    const module = new ScaleOverLifetime(
      new Curve([
        { t: 0, v: 0 },
        { t: 0.5, v: 1 },
        { t: 1, v: 0 },
      ]),
    );
    const particles = batch();
    module.apply(particles, 0);
    expect(particles.scale.x[0]).toBeCloseTo(254 / 255, 6);
  });
});
