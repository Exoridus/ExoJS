import type { CandidatePair } from '../broadphase/BroadPhase';
import type { Collider } from '../Collider';
import type { ContactGraph } from '../ContactGraph';

/**
 * Internal world-level backend seam. The frontend {@link PhysicsWorld} delegates
 * collision detection to a single backend; binding, debug draw and queries stay
 * in the frontend so they work over any backend. In the MVP the only backend is
 * {@link NativePhysicsBackend}. This boundary is intentionally **not** a public,
 * stable contract — promoting it (or adding a Rapier backend) is a deliberate
 * later decision (spec 00 §11), so it lives outside the published surface.
 */
export interface PhysicsBackend {
  /** The persistent contact set, source of the begin/end/sensor events. */
  readonly contactGraph: ContactGraph;
  /** The latest broad-phase candidate pairs (read-only; for debug draw). */
  readonly candidatePairs: readonly CandidatePair[];
  /** Run one detection pass over `colliders`, refreshing the contact graph. */
  detect(colliders: readonly Collider[]): void;
  /** Forget any state referencing `collider` (called on destruction). */
  removeCollider(collider: Collider): void;
  /** Release all backend state. */
  destroy(): void;
}
