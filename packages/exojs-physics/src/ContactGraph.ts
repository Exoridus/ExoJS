import type { CandidatePair } from './broadphase/BroadPhase';
import type { Collider } from './Collider';
import { Manifold } from './collision/Manifold';
import { collide, testOverlap } from './collision/narrowphase';
import type { CollisionEvent, ContactPoint, SensorEvent } from './events';
import { shouldCollide } from './types';

interface ContactRecord {
  a: Collider;
  b: Collider;
  isSensor: boolean;
  touching: boolean;
  seen: boolean;
}

/**
 * The persistent contact set. Each detection pass it diffs the currently
 * touching collider pairs against the previous pass and produces immutable
 * begin/end (and sensor enter/exit) event snapshots. Duplicate begin/end churn
 * is suppressed by the persistent records, and the produced event arrays are
 * sorted by collider id for deterministic dispatch (gate SG-D1/SG-X4).
 *
 * The graph holds no module-level state — each world owns one.
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

  private readonly _records = new Map<string, ContactRecord>();
  private readonly _manifold = new Manifold();

  /** Touching pairs currently tracked (for debug draw). */
  public get recordCount(): number {
    return this._records.size;
  }

  /** Diff this pass's candidate pairs against the persistent set, collecting events. */
  public update(pairs: readonly CandidatePair[]): void {
    this.collisionStart.length = 0;
    this.collisionEnd.length = 0;
    this.sensorEnter.length = 0;
    this.sensorExit.length = 0;

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
      const touching = isSensor ? testOverlap(a, b) : collide(a, b, this._manifold);
      const key = pairKey(a, b);
      const record = this._records.get(key);

      if (touching) {
        if (!record) {
          this._records.set(key, { a, b, isSensor, touching: true, seen: true });
          this._emitBegin(a, b, isSensor);
        } else {
          record.seen = true;

          if (!record.touching) {
            record.touching = true;
            this._emitBegin(a, b, isSensor);
          }
        }
      } else if (record) {
        if (record.touching) {
          this._emitEnd(a, b, isSensor);
        }

        this._records.delete(key);
      }
    }

    // Pairs that left the broad phase entirely while touching → fire end.
    for (const [key, record] of this._records) {
      if (!record.seen) {
        if (record.touching) {
          this._emitEnd(record.a, record.b, record.isSensor);
        }

        this._records.delete(key);
      }
    }

    this.collisionStart.sort(byColliderPair);
    this.collisionEnd.sort(byColliderPair);
    this.sensorEnter.sort(bySensorPair);
    this.sensorExit.sort(bySensorPair);
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

  private _emitBegin(a: Collider, b: Collider, isSensor: boolean): void {
    if (isSensor) {
      this.sensorEnter.push(makeSensorEvent(a, b));
    } else {
      this.collisionStart.push(makeCollisionEvent(a, b, this._manifold));
    }
  }

  private _emitEnd(a: Collider, b: Collider, isSensor: boolean): void {
    if (isSensor) {
      this.sensorExit.push(makeSensorEvent(a, b));
    } else {
      this.collisionEnd.push(makeEndEvent(a, b));
    }
  }
}

/** Stable key for an unordered collider pair (`a.id < b.id` is guaranteed by the broad phase). */
const pairKey = (a: Collider, b: Collider): string => `${a.id}:${b.id}`;

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

const byColliderPair = (x: CollisionEvent, y: CollisionEvent): number =>
  x.colliderA.id - y.colliderA.id || x.colliderB.id - y.colliderB.id;

const bySensorPair = (x: SensorEvent, y: SensorEvent): number => x.sensor.id - y.sensor.id || x.other.id - y.other.id;
