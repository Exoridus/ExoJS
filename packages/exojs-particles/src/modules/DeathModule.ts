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
 * delivered in slot order, and readbacks in the order they were submitted.
 *
 * Exactly-once holds while the deaths waiting on a readback fit the system's
 * capacity. Beyond that the excess is dropped rather than stalling the frame
 * loop, and a development build reports it once per system. Reaching that point
 * takes a device that falls many frames behind while slots are recycled and die
 * again, so a system sized for its emission rate does not see it.
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
