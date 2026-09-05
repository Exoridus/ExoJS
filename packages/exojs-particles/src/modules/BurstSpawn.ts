import { Color } from '@codexo/exojs';
import { Vector } from '@codexo/exojs';

import type { ParticleEmitter } from '#ParticleStorage';

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
  /**
   * Seconds from one run of the schedule to the next, measured from the
   * schedule's own `t=0`. Omit for a one-shot: the schedule fires once and
   * then stays exhausted until {@link BurstSpawn.reset}.
   *
   * The clock wraps by subtracting the period rather than restarting from
   * zero, so overshoot carries into the next cycle and a given span of time
   * produces the same bursts at any frame rate. A period shorter than the
   * schedule's last entry overlaps cycles; each one still fires in full.
   */
  interval?: number;
}

/**
 * Discrete-burst spawner. Fires at scheduled times with a fixed count per
 * burst. Useful for explosions, hit-impacts, level-up effects.
 *
 * @example
 * new BurstSpawn({
 *     schedule: [{ time: 0, count: 50 }, { time: 0.2, count: 25 }],
 *     interval: 2, // repeat the pair every two seconds
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
    const { schedule, interval } = this.config;

    if (schedule.length === 0) {
      return;
    }

    this._elapsed += dt;

    for (;;) {
      let next = schedule[this._nextIndex];

      while (next !== undefined && this._elapsed >= next.time) {
        this._spawnBurst(emitter, next.count);
        this._nextIndex++;
        next = schedule[this._nextIndex];
      }

      // A period of zero or less can never be caught up with - the wrap below
      // would leave the clock where it is and this loop would not terminate.
      if (interval === undefined || interval <= 0 || this._nextIndex < schedule.length || this._elapsed < interval) {
        return;
      }

      this._elapsed -= interval;
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
