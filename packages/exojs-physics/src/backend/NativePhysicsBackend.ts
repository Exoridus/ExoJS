import type { BroadPhase, CandidatePair } from '../broadphase/BroadPhase';
import { SweepAndPrune } from '../broadphase/SweepAndPrune';
import type { Collider } from '../Collider';
import { ContactGraph } from '../ContactGraph';
import { ContactSolver } from '../solver/ContactSolver';
import type { PhysicsBackend } from './PhysicsBackend';

/**
 * The native, dependency-free backend: a {@link BroadPhase} (sweep-and-prune in
 * the MVP, swappable for a dynamic AABB tree later) feeding the
 * {@link ContactGraph} that diffs touching pairs into events. The dynamics
 * solver plugs in here in a later phase without changing the frontend.
 */
export class NativePhysicsBackend implements PhysicsBackend {
  public readonly contactGraph = new ContactGraph();

  private readonly _broadPhase: BroadPhase = new SweepAndPrune();
  private readonly _solver = new ContactSolver();
  private readonly _pairs: CandidatePair[] = [];

  public get candidatePairs(): readonly CandidatePair[] {
    return this._pairs;
  }

  public detect(colliders: readonly Collider[]): void {
    this._broadPhase.computePairs(colliders, this._pairs);
    this.contactGraph.update(this._pairs);
  }

  public solve(dt: number, velocityIterations: number): void {
    this._solver.prepare(this.contactGraph.solidContacts, dt);
    this._solver.warmStart();
    this._solver.solveVelocities(velocityIterations);
  }

  public removeCollider(collider: Collider): void {
    this.contactGraph.removeCollider(collider);
  }

  public destroy(): void {
    this.contactGraph.clear();
    this._pairs.length = 0;
  }
}
