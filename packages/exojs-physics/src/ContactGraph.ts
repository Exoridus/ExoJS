import type { CandidatePair } from './broadphase/BroadPhase';
import type { Collider } from './Collider';
import { Manifold } from './collision/Manifold';
import { collide, testOverlap } from './collision/narrowphase';
import type { CollisionEvent, ContactPoint, SensorEvent } from './events';
import { shouldCollide } from './types';

/**
 * Persistent per-pair contact state. For solid contacts it carries a manifold
 * reused across passes plus the accumulated normal/tangent impulses (warm-start
 * cache), keyed by manifold-point feature ids. Consumed by the {@link ContactSolver}.
 */
export interface ContactRecord {
  readonly a: Collider;
  readonly b: Collider;
  readonly isSensor: boolean;
  touching: boolean;
  seen: boolean;
  /** Persistent manifold (solid contacts), refreshed each pass by the narrow phase. */
  readonly manifold: Manifold;
  /** Accumulated normal impulse per contact point, carried across steps (warm-start). */
  readonly normalImpulse: [number, number];
  /** Accumulated tangent impulse per contact point, carried across steps (warm-start). */
  readonly tangentImpulse: [number, number];
  /** Feature ids the cached impulses belong to (for warm-start matching). */
  readonly pointIds: [number, number];
}

/**
 * The persistent contact set. Each detection pass it diffs the currently
 * touching collider pairs against the previous pass and produces immutable
 * begin/end (and sensor enter/exit) event snapshots. Duplicate begin/end churn
 * is suppressed by the persistent records, and the produced event arrays are
 * sorted by collider id for deterministic dispatch (gate SG-D1/SG-X4).
 *
 * Touching solid contacts are also collected into {@link solidContacts} (with a
 * warm-start impulse cache) for the dynamics solver. The graph holds no
 * module-level state — each world owns one.
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
  /** Touching solid contacts this pass, in deterministic order — consumed by the solver. */
  public readonly solidContacts: ContactRecord[] = [];

  // Integer pair-keys (`(a.id << 16) | b.id`, a.id < b.id guaranteed by the broad
  // phase) — cheaper than string keys on the per-step solver hot path.
  private readonly _records = new Map<number, ContactRecord>();

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

    for (const record of this._records.values()) {
      record.seen = false;
    }

    for (const pair of pairs) {
      const a = pair.a;
      const b = pair.b;

      if (!shouldCollide(a.filter, b.filter)) {
        continue;
      }

      const isSensor = a.isSensor || b.isSensor;
      const key = pairKey(a, b);
      const existing = this._records.get(key);
      const record = existing ?? createRecord(a, b, isSensor);
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

    // Pairs that left the broad phase entirely while touching → fire end.
    for (const [key, record] of this._records) {
      if (!record.seen) {
        if (record.touching) {
          this._emitEnd(record);
        }

        this._records.delete(key);
      }
    }

    this.collisionStart.sort(byColliderPair);
    this.collisionEnd.sort(byColliderPair);
    this.sensorEnter.sort(bySensorPair);
    this.sensorExit.sort(bySensorPair);
    this.solidContacts.sort(byRecordPair);
  }

  /** Remove every record referencing `collider` (called when a collider is destroyed). */
  public removeCollider(collider: Collider): void {
    for (const [key, record] of this._records) {
      if (record.a === collider || record.b === collider) {
        this._records.delete(key);
      }
    }
  }

  /** Drop all records (world reset/destroy). */
  public clear(): void {
    this._records.clear();
  }

  private _emitBegin(record: ContactRecord): void {
    if (record.isSensor) {
      this.sensorEnter.push(makeSensorEvent(record.a, record.b));
    } else {
      this.collisionStart.push(makeCollisionEvent(record.a, record.b, record.manifold));
    }
  }

  private _emitEnd(record: ContactRecord): void {
    if (record.isSensor) {
      this.sensorExit.push(makeSensorEvent(record.a, record.b));
    } else {
      this.collisionEnd.push(makeEndEvent(record.a, record.b));
    }
  }
}

/** Integer key for an unordered collider pair (`a.id < b.id` guaranteed by the broad phase). */
const pairKey = (a: Collider, b: Collider): number => (a.id << 16) | b.id;

const createRecord = (a: Collider, b: Collider, isSensor: boolean): ContactRecord => ({
  a,
  b,
  isSensor,
  touching: false,
  seen: true,
  manifold: new Manifold(),
  normalImpulse: [0, 0],
  tangentImpulse: [0, 0],
  pointIds: [0, 0],
});

/**
 * Map the previously accumulated impulses onto the new manifold points by feature
 * id (warm-starting). Unmatched points start at zero; the cache is re-keyed to the
 * new ids. Runs after `collide` has refreshed `record.manifold`.
 */
const warmStartMatch = (record: ContactRecord): void => {
  const manifold = record.manifold;
  const pn0 = record.normalImpulse[0];
  const pn1 = record.normalImpulse[1];
  const pt0 = record.tangentImpulse[0];
  const pt1 = record.tangentImpulse[1];
  const pid0 = record.pointIds[0];
  const pid1 = record.pointIds[1];

  for (let i = 0; i < 2; i++) {
    if (i < manifold.pointCount) {
      const id = manifold.points[i].id;
      let normal = 0;
      let tangent = 0;

      if (id === pid0) {
        normal = pn0;
        tangent = pt0;
      } else if (id === pid1) {
        normal = pn1;
        tangent = pt1;
      }

      record.normalImpulse[i] = normal;
      record.tangentImpulse[i] = tangent;
      record.pointIds[i] = id;
    } else {
      record.normalImpulse[i] = 0;
      record.tangentImpulse[i] = 0;
      record.pointIds[i] = 0;
    }
  }
};

const makeCollisionEvent = (a: Collider, b: Collider, manifold: Manifold): CollisionEvent => {
  const points: ContactPoint[] = [];

  for (let i = 0; i < manifold.pointCount; i++) {
    const p = manifold.points[i];

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
