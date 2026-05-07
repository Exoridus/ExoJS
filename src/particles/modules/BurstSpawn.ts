import { Vector } from '@/math/Vector';
import { Color } from '@/core/Color';
import { SpawnModule } from './SpawnModule';
import type { ParticleSystem } from '@/particles/ParticleSystem';
import type { Distribution } from '@/particles/distributions/Distribution';

/**
 * Burst trigger schedule. The module fires at `time` seconds (since
 * registration), spawning `count` particles in one frame.
 */
export interface BurstSchedule {
    time: number;
    count: number;
}

/**
 * Per-property spawn configuration for {@link BurstSpawn}. Same fields as
 * {@link RateSpawnConfig} except no rate — the schedule drives counts.
 */
export interface BurstSpawnConfig {
    schedule: ReadonlyArray<BurstSchedule>;
    /** Whether to repeat the schedule from t=0 once exhausted. Default `false`. */
    loop?: boolean;
    lifetime?: Distribution<number>;
    position?: Distribution<Vector>;
    velocity?: Distribution<Vector>;
    scale?: Distribution<Vector>;
    rotation?: Distribution<number>;
    rotationSpeed?: Distribution<number>;
    tint?: Distribution<Color>;
    textureIndex?: Distribution<number>;
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

    public override apply(system: ParticleSystem, dt: number): void {
        const cfg = this.config;
        const schedule = cfg.schedule;

        if (schedule.length === 0) {
            return;
        }

        this._elapsed += dt;

        while (this._nextIndex < schedule.length && this._elapsed >= schedule[this._nextIndex].time) {
            this._spawnBurst(system, schedule[this._nextIndex].count);
            this._nextIndex++;
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

    private _spawnBurst(system: ParticleSystem, count: number): void {
        const cfg = this.config;
        const v = this._vec;
        const c = this._color;

        for (let i = 0; i < count; i++) {
            const slot = system.spawn();

            if (slot < 0) {
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
            system.textureIndex[slot] = cfg.textureIndex ? (cfg.textureIndex.sample() | 0) : 0;
        }
    }
}
