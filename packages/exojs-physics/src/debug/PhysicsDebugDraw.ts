import type { Application } from '@codexo/exojs';
import { Color, Graphics } from '@codexo/exojs';
import type { DebugLayerViewMode } from '@codexo/exojs/debug';
import { DebugLayer } from '@codexo/exojs/debug';
import type { RenderBackend } from '@codexo/exojs/renderer-sdk';

import { aabbOverlap } from '../Aabb';
import type { CandidatePair } from '../broadphase/BroadPhase';
import type { Collider } from '../Collider';
import { Manifold } from '../collision/Manifold';
import { collide } from '../collision/narrowphase';
import type { PhysicsWorld } from '../PhysicsWorld';

/** Toggles for the physics debug overlay. */
export interface PhysicsDebugDrawOptions {
  /** Collider shape outlines, coloured by body type. Default `true`. */
  drawShapes?: boolean;
  /** Collider world AABBs. Default `false`. */
  drawAabb?: boolean;
  /** Contact points. Default `false`. */
  drawContacts?: boolean;
  /** Contact normals. Default `false`. */
  drawNormals?: boolean;
  /** Body origins (centre markers). Default `false`. */
  drawCenters?: boolean;
  /** Broad-phase candidate links between AABB-overlapping colliders. Default `false`. */
  drawBroadphase?: boolean;
  /** Tint sleeping bodies distinctly (applies to the shape outline). Default `false`. */
  drawSleeping?: boolean;
  /** Lines connecting the bodies of each joint. Default `false`. */
  drawJoints?: boolean;
}

const segments = 24;

const colorStatic = new Color(0.3, 0.9, 0.4, 0.9);
const colorKinematic = new Color(0.4, 0.7, 1, 0.9);
const colorDynamic = new Color(1, 0.85, 0.3, 0.9);
const colorSensor = new Color(1, 0.3, 1, 0.9);
const colorAabb = new Color(0.5, 0.5, 0.5, 0.5);
const colorContact = new Color(1, 0.2, 0.2, 1);
const colorNormal = new Color(1, 0.6, 0.1, 1);
const colorCenter = new Color(1, 1, 1, 0.9);
const colorBroadphase = new Color(0.2, 0.8, 0.8, 0.5);
const colorSleeping = new Color(0.45, 0.45, 0.5, 0.7);
const colorJoint = new Color(0.9, 0.5, 1, 0.8);

/**
 * `DebugLayer` that visualises a {@link PhysicsWorld} — shapes, AABBs, contacts,
 * normals, centres and broad-phase links. It reads the world's public state and
 * recomputes contacts/broad-phase locally only while visible, so it never
 * perturbs the simulation and works over any backend. Lives in the `./debug`
 * subpath so it tree-shakes out of production bundles.
 */
export class PhysicsDebugDraw extends DebugLayer {
  /** Mutable option flags (read each frame). */
  public readonly options: Required<PhysicsDebugDrawOptions>;

  private readonly _world: PhysicsWorld;
  private _graphics: Graphics | null = null;
  private readonly _manifold = new Manifold();
  private readonly _pairs: CandidatePair[] = [];

  public constructor(app: Application, world: PhysicsWorld, options: PhysicsDebugDrawOptions = {}) {
    super(app);

    this._world = world;
    this.options = {
      drawShapes: options.drawShapes ?? true,
      drawAabb: options.drawAabb ?? false,
      drawContacts: options.drawContacts ?? false,
      drawNormals: options.drawNormals ?? false,
      drawCenters: options.drawCenters ?? false,
      drawBroadphase: options.drawBroadphase ?? false,
      drawSleeping: options.drawSleeping ?? false,
      drawJoints: options.drawJoints ?? false,
    };
  }

  public override get viewMode(): DebugLayerViewMode {
    return 'world';
  }

  public override update(): void {
    // All state is read from the world in render().
  }

  public override render(backend: RenderBackend): void {
    const gfx = (this._graphics ??= new Graphics());
    const options = this.options;

    gfx.clear();
    gfx.lineWidth = 1;

    if (options.drawBroadphase) {
      this._renderBroadphase(gfx);
    }

    if (options.drawAabb) {
      for (const collider of this._world.colliders) {
        this._strokeAabb(gfx, collider);
      }
    }

    if (options.drawShapes) {
      for (const collider of this._world.colliders) {
        this._strokeShape(gfx, collider);
      }
    }

    if (options.drawCenters) {
      gfx.lineColor = colorCenter;

      for (const body of this._world.bodies) {
        this._strokeCross(gfx, body.x, body.y, 4);
      }
    }

    if (options.drawContacts || options.drawNormals) {
      this._renderContacts(gfx);
    }

    if (options.drawJoints) {
      this._renderJoints(gfx);
    }

    gfx.render(backend);
  }

  private _renderJoints(gfx: Graphics): void {
    gfx.lineColor = colorJoint;

    for (const joint of this._world.joints) {
      gfx.moveTo(joint.bodyA.x, joint.bodyA.y);
      gfx.lineTo(joint.bodyB.x, joint.bodyB.y);
    }
  }

  public override destroy(): void {
    if (this._graphics !== null) {
      this._graphics.destroy();
      this._graphics = null;
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private _outlineColor(collider: Collider): Color {
    if (collider.isSensor) {
      return colorSensor;
    }

    if (this.options.drawSleeping && collider.body.isSleeping) {
      return colorSleeping;
    }

    return colorForType(collider.body.type);
  }

  private _strokeShape(gfx: Graphics, collider: Collider): void {
    gfx.lineColor = this._outlineColor(collider);

    if (collider.shape.type === 'circle') {
      const c = collider.worldCenter;
      const r = collider.shape.radius;

      this._strokeCircle(gfx, c.x, c.y, r);
      // A spoke to the surface conveys orientation once bodies rotate.
      gfx.moveTo(c.x, c.y);
      gfx.lineTo(c.x + collider.worldTransform.cos * r, c.y + collider.worldTransform.sin * r);

      return;
    }

    const verts = collider.worldVertices;
    const count = collider.shape.count;

    gfx.moveTo(verts[0]!, verts[1]!);

    for (let i = 1; i <= count; i++) {
      const j = i % count;

      gfx.lineTo(verts[j * 2]!, verts[j * 2 + 1]!);
    }
  }

  private _strokeAabb(gfx: Graphics, collider: Collider): void {
    const box = collider.aabb;

    gfx.lineColor = colorAabb;
    gfx.moveTo(box.minX, box.minY);
    gfx.lineTo(box.maxX, box.minY);
    gfx.lineTo(box.maxX, box.maxY);
    gfx.lineTo(box.minX, box.maxY);
    gfx.lineTo(box.minX, box.minY);
  }

  private _strokeCircle(gfx: Graphics, cx: number, cy: number, r: number): void {
    gfx.moveTo(cx + r, cy);

    for (let i = 1; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;

      gfx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }

  private _strokeCross(gfx: Graphics, x: number, y: number, size: number): void {
    gfx.moveTo(x - size, y);
    gfx.lineTo(x + size, y);
    gfx.moveTo(x, y - size);
    gfx.lineTo(x, y + size);
  }

  /**
   * Recomputes candidate pairs from scratch for the current frame via a plain
   * brute-force AABB-overlap scan — deliberately NOT `AabbTreeBroadPhase`.
   * That class relies on `Collider._treeProxy`, a field shared on the
   * Collider object and valid only for whichever ONE broad phase currently
   * owns it (the world's own `NativePhysicsBackend`); a second instance here
   * would silently corrupt that ownership every time debug draw and a
   * physics step interleave. Debug-only/opt-in (tree-shaken from production
   * bundles), recomputed from scratch every visible frame regardless, so an
   * O(n^2) scan is an appropriate, fully self-contained trade for
   * correctness — it touches no state outside this method.
   */
  private _collectPairs(): void {
    const colliders = this._world.colliders;
    const pairs = this._pairs;

    pairs.length = 0;

    for (let i = 0; i < colliders.length; i++) {
      const a = colliders[i]!;

      for (let j = i + 1; j < colliders.length; j++) {
        const b = colliders[j]!;

        if (aabbOverlap(a.aabb, b.aabb)) {
          pairs.push(a.id < b.id ? { a, b } : { a: b, b: a });
        }
      }
    }
  }

  private _renderBroadphase(gfx: Graphics): void {
    this._collectPairs();
    gfx.lineColor = colorBroadphase;

    for (const pair of this._pairs) {
      const a = pair.a.aabb;
      const b = pair.b.aabb;

      gfx.moveTo((a.minX + a.maxX) * 0.5, (a.minY + a.maxY) * 0.5);
      gfx.lineTo((b.minX + b.maxX) * 0.5, (b.minY + b.maxY) * 0.5);
    }
  }

  private _renderContacts(gfx: Graphics): void {
    this._collectPairs();

    for (const pair of this._pairs) {
      const a = pair.a;
      const b = pair.b;

      if (a.isSensor || b.isSensor) {
        continue;
      }

      if (!collide(a, b, this._manifold)) {
        continue;
      }

      for (let i = 0; i < this._manifold.pointCount; i++) {
        // i in 0..pointCount-1 and pointCount ≤ 2, so the point always exists.
        const point = i === 0 ? this._manifold.points[0] : this._manifold.points[1];

        if (this.options.drawContacts) {
          gfx.lineColor = colorContact;
          this._strokeCross(gfx, point.x, point.y, 3);
        }

        if (this.options.drawNormals) {
          gfx.lineColor = colorNormal;
          gfx.moveTo(point.x, point.y);
          gfx.lineTo(point.x + this._manifold.normalX * 12, point.y + this._manifold.normalY * 12);
        }
      }
    }
  }
}

const colorForType = (type: 'dynamic' | 'static' | 'kinematic'): Color => {
  if (type === 'static') {
    return colorStatic;
  }

  return type === 'kinematic' ? colorKinematic : colorDynamic;
};
