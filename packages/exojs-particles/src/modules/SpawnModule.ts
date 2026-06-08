import type { ParticleSystem } from "../ParticleSystem";

/**
 * Per-frame particle spawner. Subclasses decide how many particles to emit
 * each tick (rate-based, burst, on-demand) and write their initial values
 * directly into the system's typed-array slots.
 *
 * Implementation pattern:
 *
 * ```ts
 * apply(system, dt) {
 *     const count = this.computeSpawnCount(dt);
 *     for (let i = 0; i < count; i++) {
 *         const slot = system.spawn();
 *         if (slot < 0) break;          // capacity exhausted
 *         system.posX[slot] = ...;
 *         system.velX[slot] = ...;
 *         system.lifetime[slot] = ...;
 *         // ...etc
 *     }
 * }
 * ```
 *
 * Spawn modules run before integration each frame. Multiple modules can be
 * registered on one system and execute in registration order.
 */
export abstract class SpawnModule {
  public abstract apply(system: ParticleSystem, dt: number): void;
  /** Optional cleanup hook called from `ParticleSystem.destroy`. */
  public destroy(): void {}
}
