import type { CandidatePair } from './broadphase/BroadPhase';
import type { Collider } from './Collider';
import { authoredCollider } from './Collider';
import { Manifold } from './collision/Manifold';
import { collide, testOverlap } from './collision/narrowphase';
import type { ContactModifier } from './ContactModifier';
import { MutableContactModifierContext } from './ContactModifier';
import type { CollisionEvent, ContactPoint, SensorEvent } from './events';
import { sortInPlace } from './sort';
import { shouldCollide } from './types';

/**
 * Persistent per-pair contact state. For solid contacts it carries a manifold
 * reused across passes plus the accumulated normal/tangent impulses (warm-start
 * cache), keyed by manifold-point feature ids. Consumed by the {@link ContactSolver}.
 */
export interface ContactRecord {
  readonly a: Collider;
  readonly b: Collider;
  /**
   * Authored collider behind {@link a} - itself, unless `a` is an engine-owned
   * chain edge proxy, in which case it is the chain collider the caller made.
   * Solver identity is the proxy pair; public identity is the authored pair.
   */
  readonly ownerA: Collider;
  readonly ownerB: Collider;
  readonly isSensor: boolean;
  touching: boolean;
  seen: boolean;
  /**
   * Per-step solver participation. Re-derived to `true` for every touching solid
   * contact each pass, then optionally cleared by the world's `ContactModifier`.
   */
  enabled: boolean;
  /** Per-step Coulomb friction, re-derived from the two colliders each pass. */
  friction: number;
  /** Per-step restitution, re-derived from the two colliders each pass. */
  restitution: number;
  /** Persistent manifold (solid contacts), refreshed each pass by the narrow phase. */
  readonly manifold: Manifold;
  /** Accumulated normal impulse per contact point, carried across steps (warm-start). */
  readonly normalImpulse: [number, number];
  /** Accumulated tangent impulse per contact point, carried across steps (warm-start). */
  readonly tangentImpulse: [number, number];
  /** Feature ids the cached impulses belong to (for warm-start matching). */
  readonly pointIds: [number, number];
  /**
   * Penetration each point carried on the previous detection pass, matched by
   * feature id the same way the impulse cache is, or `-1` where the point is new
   * and has no history. The difference against the manifold's current
   * penetration is how much the last solve actually moved the overlap, which is
   * what separates a contact the push-out is still working off from one that has
   * reached the depth its load holds it at.
   */
  readonly previousPenetration: [number, number];
  /** Penetration per point as of this pass, kept so the next pass can form that difference. */
  readonly pointPenetration: [number, number];
}

/**
 * The persistent contact set. Each detection pass it diffs the currently
 * touching collider pairs against the previous pass and produces immutable
 * begin/end (and sensor enter/exit) event snapshots. Duplicate begin/end churn
 * is suppressed by the persistent records, and the produced event arrays are
 * sorted by collider id for deterministic dispatch.
 *
 * Touching solid contacts are also collected into {@link solidContacts} (with a
 * warm-start impulse cache) for the dynamics solver. The graph holds no
 * module-level state - each world owns one.
 *
 * Records are keyed on the pair the solver sees, which for a chain collider is
 * one of its edge proxies. Events are not: a body touching several edges of one
 * chain is one authored contact, so the graph reference-counts the authored pair
 * behind its records and emits begin/end only on the first and last of them.
 */
export class ContactGraph {
  /** Immutable solid-contact begin snapshots produced by the latest {@link update}. */
  public readonly collisionStart: CollisionEvent[] = [];
  /** Immutable solid-contact end snapshots produced by the latest {@link update}. */
  public readonly collisionEnd: CollisionEvent[] = [];
  /** Immutable sensor-enter snapshots produced by the latest {@link update}. */
  public readonly sensorEnter: SensorEvent[] = [];
  /** Immutable sensor-exit snapshots produced by the latest {@link update}. */
  public readonly sensorExit: SensorEvent[] = [];
  /** Touching solid contacts this pass, in deterministic order - consumed by the solver. */
  public readonly solidContacts: ContactRecord[] = [];

  // Integer pair-keys (`(a.id << 16) | b.id`, a.id < b.id guaranteed by the broad
  // phase) - cheaper than string keys on the per-step solver hot path.
  private readonly _records = new Map<number, ContactRecord>();
  // Live solver contacts per authored collider pair. Only pairs whose records
  // are engine-owned proxies appear here; everything else emits directly.
  private readonly _authoredPairs = new Map<number, number>();
  private readonly _modifierContext = new MutableContactModifierContext();

  /** Touching pairs currently tracked (for debug draw). */
  public get recordCount(): number {
    return this._records.size;
  }

  /** Diff this pass's candidate pairs against the persistent set, collecting events + solid contacts. */
  public update(pairs: readonly CandidatePair[]): void {
    this.collisionStart.length = 0;
    this.collisionEnd.length = 0;
    this.sensorEnter.length = 0;
    this.sensorExit.length = 0;
    this.solidContacts.length = 0;

    this._records.forEach(resetSeen);

    for (const pair of pairs) {
      const a = pair.a;
      const b = pair.b;

      // Material, filter and sensor flag live on the authored collider; an edge
      // proxy carries none of its own, so a chain stays one collider to configure.
      const ownerA = authoredCollider(a);
      const ownerB = authoredCollider(b);

      if (!shouldCollide(ownerA.filter, ownerB.filter)) {
        continue;
      }

      const isSensor = ownerA.isSensor || ownerB.isSensor;
      const key = pairKey(a.id, b.id);
      const existing = this._records.get(key);
      const record = existing ?? createRecord(a, b, ownerA, ownerB, isSensor);
      const touching = isSensor ? testOverlap(a, b) : collide(a, b, record.manifold);

      if (touching) {
        record.seen = true;

        if (existing === undefined) {
          this._records.set(key, record);
        }

        if (!record.touching) {
          record.touching = true;
          this._emitBegin(record);
        }

        if (!isSensor) {
          // Per-step controls start from the collider-derived defaults every
          // pass, so a modifier that skipped a contact last step does not leak
          // into this one.
          record.enabled = true;
          record.friction = Math.sqrt(ownerA.friction * ownerB.friction);
          record.restitution = Math.max(ownerA.restitution, ownerB.restitution);
          warmStartMatch(record);
          this.solidContacts.push(record);
        }
      } else if (existing !== undefined) {
        if (record.touching) {
          this._emitEnd(record);
        }

        this._records.delete(key);
      }
    }

    // Pairs that left the broad phase entirely while touching → fire end. forEach
    // + thisArg is the allocation-free iteration (for...of allocates an entry tuple
    // per record each step); the thisArg binds `this`, so unbound-method is a
    // false positive here.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the thisArg above binds it
    this._records.forEach(this._removeIfUnseen, this);

    sortInPlace(this.collisionStart, byColliderPair);
    sortInPlace(this.collisionEnd, byColliderPair);
    sortInPlace(this.sensorEnter, bySensorPair);
    sortInPlace(this.sensorExit, bySensorPair);
    sortInPlace(this.solidContacts, byRecordPair);
  }

  /**
   * Run `modifier` over every touching solid contact of this pass. Called after
   * detection and before island building, so a contact the modifier disables
   * neither reaches the solver nor couples its two bodies into one sleeping
   * island. A disabled contact's warm-start cache is dropped, so re-enabling it
   * later starts from zero instead of releasing a stale impulse.
   */
  public applyModifier(modifier: ContactModifier): void {
    const context = this._modifierContext;

    for (const record of this.solidContacts) {
      context.bind(record);
      modifier(context);
      context.flush(record);

      if (!record.enabled) {
        record.normalImpulse[0] = 0;
        record.normalImpulse[1] = 0;
        record.tangentImpulse[0] = 0;
        record.tangentImpulse[1] = 0;
        record.pointIds[0] = 0;
        record.pointIds[1] = 0;
        // Same reasoning for the penetration history: a contact that carried no
        // impulse this step did not move its overlap, so the next pass must read
        // the point as new rather than as one whose push-out has converged.
        record.pointPenetration[0] = -1;
        record.pointPenetration[1] = -1;
      }
    }
  }

  /**
   * Remove every record referencing `collider` (called when a collider is
   * destroyed). Passing an authored chain collider also drops the records of
   * every edge proxy it owns.
   */
  public removeCollider(collider: Collider): void {
    for (const [key, record] of this._records) {
      if (record.a === collider || record.b === collider || record.ownerA === collider || record.ownerB === collider) {
        if (record.touching) {
          this._releaseAuthoredPair(record);
        }

        this._records.delete(key);
      }
    }
  }

  /** Drop all records (world reset/destroy). */
  public clear(): void {
    this._records.clear();
    this._authoredPairs.clear();
  }

  private _emitBegin(record: ContactRecord): void {
    if (!this._retainAuthoredPair(record)) {
      return;
    }

    if (record.isSensor) {
      this.sensorEnter.push(makeSensorEvent(record.ownerA, record.ownerB));
    } else {
      this.collisionStart.push(makeCollisionEvent(record.ownerA, record.ownerB, record.manifold));
    }
  }

  private _emitEnd(record: ContactRecord): void {
    if (!this._releaseAuthoredPair(record)) {
      return;
    }

    if (record.isSensor) {
      this.sensorExit.push(makeSensorEvent(record.ownerA, record.ownerB));
    } else {
      this.collisionEnd.push(makeEndEvent(record.ownerA, record.ownerB));
    }
  }

  /**
   * Count one more solver contact against the authored pair, reporting whether
   * it is the first - the only one that may emit a begin event. A record whose
   * colliders are the authored ones needs no counting at all, so a world without
   * chains never touches the map.
   */
  private _retainAuthoredPair(record: ContactRecord): boolean {
    if (record.a === record.ownerA && record.b === record.ownerB) {
      return true;
    }

    const key = authoredPairKey(record);
    const count = this._authoredPairs.get(key) ?? 0;

    this._authoredPairs.set(key, count + 1);

    return count === 0;
  }

  /** Counterpart of {@link _retainAuthoredPair}: `true` on the last contact of the pair. */
  private _releaseAuthoredPair(record: ContactRecord): boolean {
    if (record.a === record.ownerA && record.b === record.ownerB) {
      return true;
    }

    const key = authoredPairKey(record);
    const count = (this._authoredPairs.get(key) ?? 1) - 1;

    if (count <= 0) {
      this._authoredPairs.delete(key);

      return true;
    }

    this._authoredPairs.set(key, count);

    return false;
  }

  /**
   * `Map.forEach` callback (its `this` bound via the forEach thisArg) - drops a
   * record the latest pass did not see, firing an end event if it was touching.
   * A method reference + thisArg keeps the per-step iteration allocation-free,
   * unlike `for (const [key, record] of map)` which allocates an entry tuple per
   * record (~1000/step). Deleting the current entry during forEach is safe.
   */
  private _removeIfUnseen(record: ContactRecord, key: number): void {
    if (!record.seen) {
      if (record.touching) {
        this._emitEnd(record);
      }

      this._records.delete(key);
    }
  }
}

/** `Map.forEach` callback - clears the per-pass `seen` flag (no iterator allocation). */
const resetSeen = (record: ContactRecord): void => {
  record.seen = false;
};

/**
 * Stride for packing two collider ids into one pair key. Multiplying by this
 * (rather than a 32-bit `<<`) keeps the key collision-free up to ~67M (2^26)
 * ids per world, within JS's 2^53 safe-integer range.
 * @internal
 */
export const pairKeyStride = 0x4000000; // 2^26

/**
 * Integer key for an unordered collider pair (`aId < bId` is guaranteed by the
 * broad phase). The previous `(aId << 16) | bId` silently collided once any id
 * reached 65536, because JS bitwise operators wrap at 32 bits.
 * @internal
 */
export const pairKey = (aId: number, bId: number): number => aId * pairKeyStride + bId;

const authoredPairKey = (record: ContactRecord): number => {
  const first = record.ownerA.id;
  const second = record.ownerB.id;

  return first < second ? pairKey(first, second) : pairKey(second, first);
};

const createRecord = (a: Collider, b: Collider, ownerA: Collider, ownerB: Collider, isSensor: boolean): ContactRecord => ({
  a,
  b,
  ownerA,
  ownerB,
  isSensor,
  touching: false,
  seen: true,
  enabled: true,
  friction: 0,
  restitution: 0,
  manifold: new Manifold(),
  normalImpulse: [0, 0],
  tangentImpulse: [0, 0],
  pointIds: [0, 0],
  previousPenetration: [-1, -1],
  pointPenetration: [-1, -1],
});

/**
 * Map the previously accumulated impulses onto the new manifold points by feature
 * id (warm-starting), and carry each point's previous penetration across the same
 * match. Unmatched points start at zero impulse and at no penetration history;
 * the cache is re-keyed to the new ids. Runs after `collide` has refreshed
 * `record.manifold`.
 */
const warmStartMatch = (record: ContactRecord): void => {
  const manifold = record.manifold;
  const pn0 = record.normalImpulse[0];
  const pn1 = record.normalImpulse[1];
  const pt0 = record.tangentImpulse[0];
  const pt1 = record.tangentImpulse[1];
  const pd0 = record.pointPenetration[0];
  const pd1 = record.pointPenetration[1];
  const pid0 = record.pointIds[0];
  const pid1 = record.pointIds[1];

  for (let i = 0; i < 2; i++) {
    if (i < manifold.pointCount) {
      // i ∈ {0,1} and within pointCount, so the manifold point exists.
      const point = i === 0 ? manifold.points[0] : manifold.points[1];
      const id = point.id;
      let normal = 0;
      let tangent = 0;
      let previous = -1;

      if (id === pid0) {
        normal = pn0;
        tangent = pt0;
        previous = pd0;
      } else if (id === pid1) {
        normal = pn1;
        tangent = pt1;
        previous = pd1;
      }

      record.normalImpulse[i] = normal;
      record.tangentImpulse[i] = tangent;
      record.previousPenetration[i] = previous;
      record.pointPenetration[i] = point.penetration;
      record.pointIds[i] = id;
    } else {
      record.normalImpulse[i] = 0;
      record.tangentImpulse[i] = 0;
      record.previousPenetration[i] = -1;
      record.pointPenetration[i] = -1;
      record.pointIds[i] = 0;
    }
  }
};

const makeCollisionEvent = (a: Collider, b: Collider, manifold: Manifold): CollisionEvent => {
  const points: ContactPoint[] = [];

  for (let i = 0; i < manifold.pointCount; i++) {
    // i in 0..pointCount-1 and pointCount ≤ 2, so the manifold point exists.
    const p = i === 0 ? manifold.points[0] : manifold.points[1];

    points.push(Object.freeze({ x: p.x, y: p.y, penetration: p.penetration }));
  }

  return Object.freeze({
    bodyA: a.body,
    bodyB: b.body,
    colliderA: a,
    colliderB: b,
    normal: Object.freeze({ x: manifold.normalX, y: manifold.normalY }),
    points: Object.freeze(points),
  });
};

const makeEndEvent = (a: Collider, b: Collider): CollisionEvent =>
  Object.freeze({
    bodyA: a.body,
    bodyB: b.body,
    colliderA: a,
    colliderB: b,
    normal: Object.freeze({ x: 0, y: 0 }),
    points: Object.freeze([] as ContactPoint[]),
  });

const makeSensorEvent = (a: Collider, b: Collider): SensorEvent => {
  let sensor: Collider;
  let other: Collider;

  if (a.isSensor && b.isSensor) {
    sensor = a.id < b.id ? a : b;
    other = sensor === a ? b : a;
  } else if (a.isSensor) {
    sensor = a;
    other = b;
  } else {
    sensor = b;
    other = a;
  }

  return Object.freeze({ sensor, other });
};

const byColliderPair = (x: CollisionEvent, y: CollisionEvent): number => x.colliderA.id - y.colliderA.id || x.colliderB.id - y.colliderB.id;

const bySensorPair = (x: SensorEvent, y: SensorEvent): number => x.sensor.id - y.sensor.id || x.other.id - y.other.id;

const byRecordPair = (x: ContactRecord, y: ContactRecord): number => x.a.id - y.a.id || x.b.id - y.b.id;
