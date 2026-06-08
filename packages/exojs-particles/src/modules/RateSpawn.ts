import { Color } from '@codexo/exojs';
import { Vector } from '@codexo/exojs';
import type { Distribution } from "../distributions/Distribution";
import type { ParticleSystem } from "../ParticleSystem";

import { SpawnModule } from './SpawnModule';

/**
 * Per-property spawn configuration. Every entry is a {@link Distribution}
 * sampled once per spawned particle. Omitting an entry leaves the slot's
 * field at its zero/default value (zero position/velocity/rotation, unit
 * scale, opaque white, lifetime 1 s).
 */
export interface RateSpawnConfig {
  /** Particles emitted per second. Sampled each frame. */
  rate: Distribution<number>;
  /** Total lifetime in seconds. Required — drives expiry. Default 1. */
  lifetime?: Distribution<number>;
  position?: Distribution<Vector>;
  velocity?: Distribution<Vector>;
  scale?: Distribution<Vector>;
  rotation?: Distribution<number>;
  rotationSpeed?: Distribution<number>;
  /** Initial tint at spawn. For per-frame fade use a `ColorOverLifetime` update module. */
  tint?: Distribution<Color>;
  textureIndex?: Distribution<number>;
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

  public override apply(system: ParticleSystem, dt: number): void {
    const cfg = this.config;
    const rate = cfg.rate.sample();

    this._accumulator += rate * dt;

    const count = this._accumulator | 0;

    if (count <= 0) {
      return;
    }

    this._accumulator -= count;

    const v = this._vec;
    const c = this._color;

    for (let i = 0; i < count; i++) {
      const slot = system.spawn();

      if (slot < 0) {
        this._accumulator = 0;

        return;
      }

      system.lifetime[slot] = cfg.lifetime ? cfg.lifetime.sample() : 1;

      if (cfg.position) {
        cfg.position.sample(v);
        system.posX[slot] = v.x;
        system.posY[slot] = v.y;
      } else {
        system.posX[slot] = 0;
        system.posY[slot] = 0;
      }

      if (cfg.velocity) {
        cfg.velocity.sample(v);
        system.velX[slot] = v.x;
        system.velY[slot] = v.y;
      } else {
        system.velX[slot] = 0;
        system.velY[slot] = 0;
      }

      if (cfg.scale) {
        cfg.scale.sample(v);
        system.scaleX[slot] = v.x;
        system.scaleY[slot] = v.y;
      } else {
        system.scaleX[slot] = 1;
        system.scaleY[slot] = 1;
      }

      system.rotations[slot] = cfg.rotation ? cfg.rotation.sample() : 0;
      system.rotationSpeeds[slot] = cfg.rotationSpeed ? cfg.rotationSpeed.sample() : 0;
      system.color[slot] = cfg.tint ? cfg.tint.sample(c).toRgba() : 0xffffffff;
      system.textureIndex[slot] = cfg.textureIndex ? cfg.textureIndex.sample() | 0 : 0;
    }
  }
}
