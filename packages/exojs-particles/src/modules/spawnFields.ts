import type { Color, Vector } from '@codexo/exojs';

import type { Distribution } from '#distributions/Distribution';
import type { ParticleWriter } from '#ParticleStorage';

/**
 * Per-property spawn configuration shared by the built-in spawners.
 *
 * Every entry is a {@link Distribution} sampled once per emitted particle.
 * Omitting an entry leaves that property at its spawn default: origin, no
 * velocity, unit scale, no rotation, opaque white, frame 0, one second of life.
 */
export interface ParticleSpawnFields {
  /** Total lifetime in seconds. Drives expiry. */
  lifetime?: Distribution<number>;
  position?: Distribution<Vector>;
  velocity?: Distribution<Vector>;
  scale?: Distribution<Vector>;
  rotation?: Distribution<number>;
  rotationSpeed?: Distribution<number>;
  /** Initial tint. For a per-frame fade use a `ColorOverLifetime` update module. */
  tint?: Distribution<Color>;
  /** Atlas frame index. Ignored by a system that declares no frames. */
  textureIndex?: Distribution<number>;
}

/**
 * Samples every configured field of `fields` into one emitted particle.
 *
 * `vector` and `color` are scratch instances the caller owns, so a spawner
 * allocates nothing per particle.
 * @internal
 */
export const fillParticle = (particle: ParticleWriter, fields: ParticleSpawnFields, vector: Vector, color: Color): void => {
  if (fields.lifetime) {
    particle.lifetime = fields.lifetime.sample();
  }

  if (fields.position) {
    fields.position.sample(vector);
    particle.position.set(vector.x, vector.y);
  }

  if (fields.velocity) {
    fields.velocity.sample(vector);
    particle.velocity.set(vector.x, vector.y);
  }

  if (fields.scale) {
    fields.scale.sample(vector);
    particle.scale.set(vector.x, vector.y);
  }

  if (fields.rotation) {
    particle.rotation = fields.rotation.sample();
  }

  if (fields.rotationSpeed) {
    particle.rotationSpeed = fields.rotationSpeed.sample();
  }

  if (fields.tint) {
    particle.color = fields.tint.sample(color).toRgba8();
  }

  if (fields.textureIndex) {
    particle.frame = fields.textureIndex.sample();
  }
};
