import { Color } from '@codexo/exojs';
import { Vector } from '@codexo/exojs';

import type { ParticleEmitter } from "#ParticleStorage";

import { fillParticle, type ParticleSpawnFields } from './spawnFields';
import { SpawnModule } from './SpawnModule';

/**
 * Burst trigger schedule. The module fires at `time` seconds (since
 * registration), spawning `count` particles in one frame.
 */
export interface BurstSchedule {
  time: number;
  count: number;
}

/** Spawn configuration for {@link BurstSpawn}: the burst schedule plus the shared per-property fields. */
export interface BurstSpawnConfig extends ParticleSpawnFields {
  schedule: readonly BurstSchedule[];
  /** Whether to repeat the schedule from t=0 once exhausted. Default `false`. */
  loop?: boolean;
}

/**
 * Discrete-burst spawner. Fires at scheduled times with a fixed count per
 * burst. Useful for explosions, hit-impacts, level-up effects.
 *
 * @example
 * new BurstSpawn({
 *     schedule: [{ time: 0, count: 50 }, { time: 0.2, count: 25 }],
 *     velocity: ConeDirection.omni(150, 350),
 *     lifetime: new Range(0.4, 0.9),
 * });
 */
export class BurstSpawn extends SpawnModule {
  public config: BurstSpawnConfig;

  private _elapsed = 0;
  private _nextIndex = 0;
  private readonly _vec = new Vector();
  private readonly _color = new Color();

  public constructor(config: BurstSpawnConfig) {
    super();
    this.config = config;
  }

  public override apply(emitter: ParticleEmitter, dt: number): void {
    const cfg = this.config;
    const schedule = cfg.schedule;

    if (schedule.length === 0) {
      return;
    }

    this._elapsed += dt;

    let next = schedule[this._nextIndex];

    while (next !== undefined && this._elapsed >= next.time) {
      this._spawnBurst(emitter, next.count);
      this._nextIndex++;
      next = schedule[this._nextIndex];
    }

    if (cfg.loop && this._nextIndex >= schedule.length) {
      this._elapsed = 0;
      this._nextIndex = 0;
    }
  }

  /** Restart the schedule from t=0. */
  public reset(): this {
    this._elapsed = 0;
    this._nextIndex = 0;

    return this;
  }

  private _spawnBurst(emitter: ParticleEmitter, count: number): void {
    for (let i = 0; i < count; i++) {
      const particle = emitter.emit();

      if (particle === null) {
        return;
      }

      fillParticle(particle, this.config, this._vec, this._color);
    }
  }
}
