import type { ParticleSystem } from '@/particles/ParticleSystem';

/**
 * Per-frame, per-batch mutator. Operates on the system's SoA storage
 * directly — typically a single tight loop over `[0, system.liveCount)`
 * that reads/writes the relevant `Float32Array`s.
 *
 * Implementation pattern:
 *
 * ```ts
 * apply(system, dt) {
 *     const { velX, velY, liveCount } = system;
 *     const ax = this.accelX * dt;
 *     const ay = this.accelY * dt;
 *     for (let i = 0; i < liveCount; i++) {
 *         velX[i] += ax;
 *         velY[i] += ay;
 *     }
 * }
 * ```
 *
 * Update modules run after integration each frame. Multiple modules execute
 * in registration order; later modules see the effects of earlier ones.
 */
export abstract class UpdateModule {
    public abstract apply(system: ParticleSystem, dt: number): void;
    /** Optional cleanup hook called from `ParticleSystem.destroy`. */
    public destroy(): void {}
}
