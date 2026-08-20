import { Color } from '@codexo/exojs';
import { Vector } from '@codexo/exojs';

import type { Distribution } from "#distributions/Distribution";
import type { ParticleEmitter } from "#ParticleStorage";

import { fillParticle, type ParticleSpawnFields } from './spawnFields';
import { SpawnModule } from './SpawnModule';

/** Spawn configuration for {@link RateSpawn}: the emission rate plus the shared per-property fields. */
export interface RateSpawnConfig extends ParticleSpawnFields {
  /** Particles emitted per second. Sampled each frame. */
  rate: Distribution<number>;
}

/**
 * Continuous, rate-based spawner. Emits a {@link RateSpawnConfig.rate}
 * sample per second; sub-frame fractions accumulate so low rates (e.g.
 * 0.5 particles/s) remain accurate over time.
 *
 * Each property is independently randomised via its {@link Distribution}.
 * Every spawned particle gets a fresh sample for every configured field.
 */
export class RateSpawn extends SpawnModule {
  public config: RateSpawnConfig;

  private _accumulator = 0;
  private readonly _vec = new Vector();
  private readonly _color = new Color();

  public constructor(config: RateSpawnConfig) {
    super();
    this.config = config;
  }

  public override apply(emitter: ParticleEmitter, dt: number): void {
    const cfg = this.config;
    const rate = cfg.rate.sample();

    this._accumulator += rate * dt;

    const count = this._accumulator | 0;

    if (count <= 0) {
      return;
    }

    this._accumulator -= count;

    for (let i = 0; i < count; i++) {
      const particle = emitter.emit();

      if (particle === null) {
        this._accumulator = 0;

        return;
      }

      fillParticle(particle, cfg, this._vec, this._color);
    }
  }
}
