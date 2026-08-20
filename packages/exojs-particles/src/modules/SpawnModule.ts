import type { ParticleEmitter } from "#ParticleStorage";

/**
 * Per-frame particle spawner. Subclasses decide how many particles to emit each
 * tick (rate-based, burst, on-demand) and fill each emitted particle's initial
 * values.
 *
 * Implementation pattern:
 *
 * ```ts
 * apply(emitter, dt) {
 *     const count = this.computeSpawnCount(dt);
 *     for (let i = 0; i < count; i++) {
 *         const particle = emitter.emit();
 *         if (!particle) break;         // capacity exhausted
 *         particle.position.set(x, y);
 *         particle.velocity.set(vx, vy);
 *         particle.lifetime = 2;
 *     }
 * }
 * ```
 *
 * A writer belongs to the emission that produced it: the next `emit()` rebinds
 * it, so fill it before emitting again.
 *
 * Spawn modules run before integration each frame. Multiple modules can be
 * registered on one system and execute in registration order.
 */
export abstract class SpawnModule {
  public abstract apply(emitter: ParticleEmitter, dt: number): void;
  /** Optional cleanup hook called from `ParticleSystem.destroy`. */
  public destroy(): void {}
}
