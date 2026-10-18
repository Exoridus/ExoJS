import { Color } from '@codexo/exojs';
import {
  AlphaFadeOverLifetime,
  ApplyForce,
  AttractToPoint,
  ColorGradient,
  ColorOverLifetime,
  ColorOverSpeed,
  Curve,
  Drag,
  OrbitalForce,
  type ParticleSystem,
  RepelFromPoint,
  RotateOverLifetime,
  ScaleOverLifetime,
  Turbulence,
  type UpdateModule,
  VelocityOverLifetime,
} from '@codexo/exojs-particles';

const curve = (): Curve =>
  new Curve([
    { t: 0, v: 0.6 },
    { t: 0.37, v: 1.3 },
    { t: 1, v: 0.2 },
  ]);
const gradient = (): ColorGradient =>
  new ColorGradient([
    { t: 0, color: new Color(31, 97, 211, 0.9) },
    { t: 0.41, color: new Color(223, 71, 19, 0.6) },
    { t: 1, color: new Color(47, 181, 113, 0.3) },
  ]);

export const particleParityFixtures: ReadonlyArray<{
  name: string;
  modules: () => UpdateModule[];
  seed?: (system: ParticleSystem) => void;
}> = [
  { name: 'integration', modules: () => [] },
  { name: 'force', modules: () => [new ApplyForce(8, -4)] },
  { name: 'drag', modules: () => [new Drag(0.4)] },
  { name: 'rotation', modules: () => [new RotateOverLifetime(0.7)] },
  { name: 'attraction', modules: () => [new AttractToPoint(3, -5, 12)] },
  { name: 'repulsion', modules: () => [new RepelFromPoint(3, -5, 12)] },
  {
    name: 'repulsion near center',
    modules: () => [new RepelFromPoint(0, 0, 1e-8)],
    seed: system => {
      for (let i = 0; i < 3; i++) {
        const particle = system.emit()!;

        particle.position.set(0.0001 * (i + 1), 0);
        particle.lifetime = 0.18;
      }
    },
  },
  { name: 'orbit', modules: () => [new OrbitalForce(3, -5, 0.3)] },
  { name: 'turbulence', modules: () => [new Turbulence(3, 0.07, 0.6)] },
  { name: 'scale curve', modules: () => [new ScaleOverLifetime(curve())] },
  { name: 'velocity curve', modules: () => [new VelocityOverLifetime(curve())] },
  { name: 'alpha curve', modules: () => [new AlphaFadeOverLifetime(curve())] },
  { name: 'lifetime color', modules: () => [new ColorOverLifetime(gradient())] },
  { name: 'speed color', modules: () => [new ColorOverSpeed(gradient(), 0, 40)] },
  {
    name: 'composed',
    modules: () => [
      new ApplyForce(8, -4),
      new Drag(0.4),
      new Turbulence(3, 0.07, 0.6),
      new OrbitalForce(3, -5, 0.3),
      new VelocityOverLifetime(curve()),
      new RotateOverLifetime(0.7),
      new ScaleOverLifetime(curve()),
      new ColorOverSpeed(gradient(), 0, 40),
      new AlphaFadeOverLifetime(curve()),
    ],
  },
];

/** Fixed signed coordinates exercise negative noise cells and nonuniform transforms. */
export const seedParticleParity = (system: ParticleSystem): void => {
  for (let i = 0; i < 3; i++) {
    const particle = system.emit()!;

    particle.position.set(-13 + 11 * i, 7 - 9 * i);
    particle.velocity.set(9 + 3 * i, -7 + 2 * i);
    particle.scale.set(0.7 + 0.2 * i, 1.2 - 0.1 * i);
    particle.rotation = 0.15 * i;
    particle.rotationSpeed = 0.4 - 0.2 * i;
    particle.color = 0xbfa1732d;
    particle.lifetime = 0.18;
  }
};
