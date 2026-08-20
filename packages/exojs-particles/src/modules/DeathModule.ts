import type { ParticleDeathContext } from "#ParticleStorage";
import type { ParticleSystem } from "#ParticleSystem";

/**
 * Per-particle hook invoked exactly once after a particle expires, carrying its
 * state at the moment it died.
 *
 * Use for sub-emitters (spawn child particles where this one died), event
 * dispatch (trigger an audio cue, a score event), or trail termination.
 *
 * The callback receives a snapshot rather than a slot, and for a reason: on the
 * GPU path the simulation runs on the device and a death is reported once its
 * state has been read back, by which time the slot may already hold a different
 * particle. The snapshot is therefore the same on both backends, while a slot
 * would not be.
 *
 * Delivery is exactly once per expired particle, but not necessarily in the
 * frame the particle expired: a GPU-simulated death arrives as soon as its
 * readback lands, typically the next frame. Deaths from one readback are
 * delivered in slot order.
 *
 * Implementation pattern:
 *
 * ```ts
 * onDeath(system, death) {
 *     this._childSystem.burstAt(death.x, death.y, 8);
 * }
 * ```
 */
export abstract class DeathModule {
  public abstract onDeath(system: ParticleSystem, death: ParticleDeathContext): void;
  /** Optional cleanup hook called from `ParticleSystem.destroy`. */
  public destroy(): void {}
}
