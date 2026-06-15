import type { Collider } from './Collider';
import type { PhysicsBody } from './PhysicsBody';

/** A single contact point on a {@link CollisionEvent}. World space. */
export interface ContactPoint {
  readonly x: number;
  readonly y: number;
  /** Penetration depth in px (≥ 0). */
  readonly penetration: number;
}

/**
 * Immutable per-dispatch snapshot describing a solid (non-sensor) contact.
 * Frozen: it is safe to read during the callback and to copy fields out, but it
 * is never reused or mutated, so the classic "stored a pooled event" bug cannot
 * occur. `normal` points from collider/body **A toward B**.
 */
export interface CollisionEvent {
  readonly bodyA: PhysicsBody;
  readonly bodyB: PhysicsBody;
  readonly colliderA: Collider;
  readonly colliderB: Collider;
  readonly normal: Readonly<{ x: number; y: number }>;
  readonly points: readonly ContactPoint[];
}

/**
 * Immutable per-dispatch snapshot for a sensor overlap. `sensor` is the
 * sensor-flagged collider; `other` is the collider that entered/left it. When
 * both colliders are sensors, the lower-id collider is reported as `sensor`.
 */
export interface SensorEvent {
  readonly sensor: Collider;
  readonly other: Collider;
}
