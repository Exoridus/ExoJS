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

  private readonly _elapsed: number[] = [];
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

    const repeating = interval !== undefined && Number.isFinite(interval) && interval > 0;

    for (let index = 0; index < schedule.length; index++) {
      const entry = schedule[index];

      if (entry === undefined) {
        continue;
      }

      const elapsed = (this._elapsed[index] ?? 0) + dt;
      const tolerance = Number.EPSILON * Math.max(Math.abs(elapsed), Math.abs(entry.time), repeating ? interval : 0) * 4;

      if (!Number.isFinite(elapsed) || elapsed + tolerance < entry.time) {
        this._elapsed[index] = elapsed;

        continue;
      }

      const cycles = repeating ? Math.floor((elapsed - entry.time + tolerance) / interval) + 1 : 1;

      // Each entry has its own phase: a delayed entry cannot block the start
      // of a later cycle. Advance before emission, including events dropped
      // at capacity. All copies sample the same fields, so combine their count.
      this._elapsed[index] = repeating ? elapsed - cycles * interval : -Infinity;
      this._spawnBurst(emitter, Math.ceil(entry.count) * cycles);
    }
  }

  /** @internal - a sub-emission must not consume or reset the frame schedule. */
  public override _trigger(emitter: ParticleEmitter): void {
    for (const entry of this.config.schedule) {
      if (entry.time <= 0) {
        this._spawnBurst(emitter, entry.count);
      }
    }
  }

  /** Restart the schedule from t=0. */
  public reset(): this {
    this._elapsed.length = 0;

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
