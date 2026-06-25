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
  /** Run one detection pass over `colliders`, refreshing the contact graph. Once per frame (TGS reuses the manifolds across sub-steps). */
  detect(colliders: readonly Collider[]): void;
  /** Build the per-frame contact constraints from the solid contacts. `h` is the sub-step duration; the soft factors derive from it plus `contactHertz`/`dampingRatio`. Call once per frame after {@link detect}. */
  prepareSolve(h: number, contactHertz: number, dampingRatio: number): void;
  /** Re-apply the cached warm-start impulses to the contacting bodies (first sub-step only). */
  warmStart(): void;
  /** One velocity pass over the solid contacts. `useBias` selects the main soft-bias pass; `false` is the relax pass. */
  solveVelocities(useBias: boolean): void;
  /** Restitution pass, run once per frame after the sub-step loop. */
  applyRestitution(): void;
  /** Forget any state referencing `collider` (called on destruction). */
  removeCollider(collider: Collider): void;
  /** Release all backend state. */
  destroy(): void;
}
