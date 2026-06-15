import { Vector } from '@codexo/exojs';

import { Collider, type ColliderOptions } from './Collider';
import type { Transform } from './math';
import { applyTransform, createTransform, setTransform } from './math';
import type { BodyType, VectorLike } from './types';

/** Construction options for a body. */
export interface BodyOptions {
  /** Simulation role. Default `'dynamic'`. */
  type?: BodyType;
  /** Initial world position. Default `(0, 0)`. */
  position?: VectorLike;
  /** Initial rotation in radians. Default `0`. */
  angle?: number;
  /** Linear damping (applied once dynamics ship). Default `0`. */
  linearDamping?: number;
  /** Angular damping (applied once dynamics ship). Default `0`. */
  angularDamping?: number;
  /** Per-body multiplier on world gravity (applied once dynamics ship). Default `1`. */
  gravityScale?: number;
  /** When `true`, the body never rotates under contacts (infinite rotational inertia). Default `false`. */
  fixedRotation?: boolean;
}

/**
 * Internal hook the world hands to each body so colliders can be id-allocated
 * and registered without the body importing the concrete world class.
 */
export interface BodyOwner {
  _allocateColliderId(): number;
  _registerCollider(collider: Collider): void;
}

/**
 * A rigid body: a world transform plus mass properties aggregated from its
 * colliders. In this collision/query release a body holds and reports its
 * transform and mass but is not integrated — it moves only via
 * {@link setTransform} (game-driven / kinematic). Forces, impulses and gravity
 * integration arrive with the dynamics solver.
 */
export class PhysicsBody {
  public readonly id: number;
  public readonly type: BodyType;

  /** Linear damping (inert until dynamics ship). */
  public linearDamping: number;
  /** Angular damping (inert until dynamics ship). */
  public angularDamping: number;
  /** Per-body gravity multiplier (inert until dynamics ship). */
  public gravityScale: number;
  /** When `true`, rotational inertia is treated as infinite. */
  public fixedRotation: boolean;

  /** Total mass (0 for static/kinematic). */
  public mass = 0;
  /** Inverse mass (`0` = immovable). */
  public invMass = 0;
  /** Rotational inertia about the centre of mass (0 for static/kinematic or fixed rotation). */
  public inertia = 0;
  /** Inverse rotational inertia (`0` = no angular response). */
  public invInertia = 0;

  private readonly _owner: BodyOwner;
  private readonly _transform: Transform;
  private readonly _colliders: Collider[] = [];
  private _comX = 0;
  private _comY = 0;
  private _massReady = false;
  private _destroyed = false;

  public constructor(owner: BodyOwner, id: number, options: BodyOptions = {}) {
    this.id = id;
    this.type = options.type ?? 'dynamic';
    this._owner = owner;
    this._transform = createTransform(options.position?.x ?? 0, options.position?.y ?? 0, options.angle ?? 0);
    this.linearDamping = options.linearDamping ?? 0;
    this.angularDamping = options.angularDamping ?? 0;
    this.gravityScale = options.gravityScale ?? 1;
    this.fixedRotation = options.fixedRotation ?? false;
  }

  /** World X. */
  public get x(): number {
    return this._transform.x;
  }

  /** World Y. */
  public get y(): number {
    return this._transform.y;
  }

  /** Rotation in radians. */
  public get angle(): number {
    return this._transform.angle;
  }

  /** A fresh `Vector` copy of the body's world position. */
  public get position(): Vector {
    return new Vector(this._transform.x, this._transform.y);
  }

  /** The body's world transform (read-only; mutate via {@link setTransform}). */
  public get transform(): Readonly<Transform> {
    return this._transform;
  }

  /** The body's colliders (read-only view). */
  public get colliders(): readonly Collider[] {
    return this._colliders;
  }

  /** Centre of mass in body-local space (relative to the body origin). */
  public get centerOfMassX(): number {
    return this._comX;
  }

  /** Centre of mass in body-local space (relative to the body origin). */
  public get centerOfMassY(): number {
    return this._comY;
  }

  /**
   * `true` when the body is ready to simulate. Static/kinematic bodies are
   * always ready (infinite-mass semantics); a dynamic body is ready only once
   * it has at least one positive-density collider.
   */
  public get isMassReady(): boolean {
    return this.type !== 'dynamic' || this._massReady;
  }

  /** `true` after the owning world has destroyed this body. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /** Attach a new collider, recomputing mass and synchronising world geometry. */
  public createCollider(options: ColliderOptions): Collider {
    if (this._destroyed) {
      throw new Error('PhysicsBody: cannot create a collider on a destroyed body.');
    }

    // Collider imports PhysicsBody type-only (erased), so this value import is
    // one-directional — no runtime cycle.
    const collider = new Collider(this._owner._allocateColliderId(), this, options);

    this._colliders.push(collider);
    this._recomputeMass();
    collider.synchronize(this._transform);
    this._owner._registerCollider(collider);

    return collider;
  }

  /**
   * Set the body's world transform. Resets the body's cached collider geometry
   * immediately so subsequent queries see the new placement. Returns `this`.
   */
  public setTransform(position: VectorLike, angle: number = this._transform.angle): this {
    if (this._destroyed) {
      throw new Error('PhysicsBody: cannot move a destroyed body.');
    }

    setTransform(this._transform, position.x, position.y, angle);

    for (const collider of this._colliders) {
      collider.synchronize(this._transform);
    }

    return this;
  }

  /** Refresh every collider's world geometry from the current transform. */
  public synchronizeColliders(): void {
    for (const collider of this._colliders) {
      collider.synchronize(this._transform);
    }
  }

  /** Internal: detach a collider (called by the world during destruction). */
  public _removeCollider(collider: Collider): void {
    const index = this._colliders.indexOf(collider);

    if (index !== -1) {
      this._colliders.splice(index, 1);
      this._recomputeMass();
    }
  }

  /** Internal: mark destroyed (called by the world). */
  public _markDestroyed(): void {
    this._destroyed = true;
  }

  /** Recompute mass, centre of mass and rotational inertia from the colliders. */
  private _recomputeMass(): void {
    if (this.type !== 'dynamic') {
      this.mass = 0;
      this.invMass = 0;
      this.inertia = 0;
      this.invInertia = 0;
      this._comX = 0;
      this._comY = 0;
      this._massReady = false;

      return;
    }

    let mass = 0;
    let cx = 0;
    let cy = 0;
    let inertiaOrigin = 0;
    const point = { x: 0, y: 0 };

    for (const collider of this._colliders) {
      const shape = collider.shape;
      const m = collider.density * shape.area;

      if (m <= 0) {
        continue;
      }

      // Shape centroid expressed in body-local space (offset + local rotation).
      applyTransform(collider.localTransform, shape.centroidX, shape.centroidY, point);
      mass += m;
      cx += m * point.x;
      cy += m * point.y;
      // Parallel-axis to the body origin: I_origin += I_centroid + m·d².
      inertiaOrigin += collider.density * shape.unitInertia + m * (point.x * point.x + point.y * point.y);
    }

    if (mass > 0) {
      cx /= mass;
      cy /= mass;
    }

    this.mass = mass;
    this.invMass = mass > 0 ? 1 / mass : 0;
    this._comX = cx;
    this._comY = cy;
    // Shift inertia from the body origin to the centre of mass.
    const inertiaCom = inertiaOrigin - mass * (cx * cx + cy * cy);

    this.inertia = this.fixedRotation ? 0 : inertiaCom;
    this.invInertia = this.fixedRotation || inertiaCom <= 0 ? 0 : 1 / inertiaCom;
    this._massReady = mass > 0;
  }
}
