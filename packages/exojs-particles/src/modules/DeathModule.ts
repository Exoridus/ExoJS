import type { ParticleSystem } from "../ParticleSystem";

/**
 * Per-particle hook invoked exactly once when a particle expires, before
 * its slot is recycled by the compaction pass. The dying particle's data
 * is still readable at `system.posX[slot]` etc.
 *
 * Use for sub-emitters (spawn child particles where this one died), event
 * dispatch (trigger an audio cue, score event), or trail termination.
 *
 * Implementation pattern:
 *
 * ```ts
 * onDeath(system, slot) {
 *     const x = system.posX[slot];
 *     const y = system.posY[slot];
 *     this._childSystem.spawnBurstAt(x, y, 8);
 * }
 * ```
 */
export abstract class DeathModule {
  public abstract onDeath(system: ParticleSystem, slot: number): void;
  /** Optional cleanup hook called from `ParticleSystem.destroy`. */
  public destroy(): void {}
}
