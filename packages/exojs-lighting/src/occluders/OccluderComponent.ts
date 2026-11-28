import { Component, type PointLike, type ReadonlyRectangle, type SceneNode } from '@codexo/exojs';

import type { Lighting } from '../Lighting';
import { provideOccluderComponent, sceneLighting } from '../sceneLighting';
import { AlphaOccluder } from './AlphaOccluder';
import type { AlphaOccluderDrawable, AlphaOccluderOptions } from './alphaTrace';
import type { OccluderSink, OccluderSource } from './OccluderSource';
import { emitCollider, type OccluderCollider } from './PhysicsOccluder';
import { PolygonOccluder } from './PolygonOccluder';

/** What {@link OccluderComponent} reads off a physics body: its colliders. `PhysicsBody` satisfies it. */
export interface OccluderBody {
  readonly colliders: Iterable<OccluderCollider>;
}

/**
 * Where an {@link OccluderComponent} takes its outline from:
 *
 * - `'bounds'`: the node's local bounds, re-read every frame.
 * - `'alpha'`: the node's own texture alpha, as {@link AlphaOccluder} traces it.
 *   The node must be a drawable with a texture, such as a `Sprite`.
 * - `{ points, closed? }`: an outline of your own in the node's local space,
 *   as {@link PolygonOccluder} reads it.
 * - `{ body }`: the colliders of a physics body, sensors excluded.
 * - any {@link OccluderSource}, used as it is.
 */
export type OccluderShape =
  | 'bounds'
  | 'alpha'
  | { readonly points: ReadonlyArray<Readonly<PointLike>>; readonly closed?: boolean }
  | { readonly body: OccluderBody }
  | OccluderSource;

/** Construction options for {@link OccluderComponent}. */
export interface OccluderComponentOptions {
  /** Tracing options for the `'alpha'` shape. */
  readonly alpha?: AlphaOccluderOptions;
  /**
   * The lighting system to register with. By default the component joins its
   * scene's only lighting system while it is active, and none when there are
   * several - name the one you mean here.
   */
  readonly lighting?: Lighting;
}

const isSource = (shape: OccluderShape): shape is OccluderSource =>
  typeof shape === 'object' && typeof (shape as Partial<OccluderSource>).collect === 'function';

const isAlphaDrawable = (node: SceneNode): node is SceneNode & AlphaOccluderDrawable => 'texture' in node && 'textureFrame' in node;

/**
 * Makes a node block light for as long as it is in an active scene.
 *
 * ```ts
 * wall.addComponent(new OccluderComponent());                       // its bounds
 * tree.addComponent(new OccluderComponent('alpha'));                // its silhouette
 * hut.addComponent(new OccluderComponent({ points: hutOutline }));  // an outline of your own
 * crate.addComponent(new OccluderComponent({ body: physics.body })); // its colliders
 * ```
 *
 * The outline follows the node's transform. While the component is active it
 * is registered with the scene's lighting system, exactly as if its
 * {@link source} had been passed to {@link Lighting.occludeFrom}; when it is
 * disabled, its node leaves the scene, or the scene is retained or ends, it is
 * unregistered again.
 */
export class OccluderComponent extends Component {
  /** The lighting system this component is registered with, or `null`. @internal */
  public _lighting: Lighting | null = null;

  private readonly _shape: OccluderShape;
  private readonly _options: OccluderComponentOptions;
  private _source: OccluderSource | null = null;

  public constructor(shape: OccluderShape = 'bounds', options: OccluderComponentOptions = {}) {
    super();
    this._shape = shape;
    this._options = options;
  }

  /**
   * The occluder source this component registers, built from its shape when
   * the component is attached.
   *
   * @throws Before the component is attached to a node.
   */
  public get source(): OccluderSource {
    if (this._source === null) {
      throw new Error(
        'OccluderComponent.source is built when the component is attached to a node. Add it with node.addComponent(...) first.',
      );
    }

    return this._source;
  }

  protected override onAttach(): void {
    this._source ??= this._build(this.node);
  }

  protected override onEnable(): void {
    const lighting = this._options.lighting ?? sceneLighting(this);

    if (lighting !== null) {
      this._joinLighting(lighting);
    }
  }

  protected override onDisable(): void {
    this._leaveLighting();
  }

  /** @internal */
  public _joinLighting(lighting: Lighting): void {
    this._lighting = lighting;
    lighting._adoptOccluder(this);
  }

  /** @internal */
  public _leaveLighting(): void {
    const lighting = this._lighting;

    this._lighting = null;
    lighting?._releaseOccluder(this);
  }

  private _build(node: SceneNode): OccluderSource {
    const shape = this._shape;

    if (shape === 'bounds') {
      return new BoundsOccluder(node);
    }

    if (shape === 'alpha') {
      if (!isAlphaDrawable(node)) {
        throw new Error("OccluderComponent('alpha') needs a drawable with a texture, such as a Sprite, to trace.");
      }

      return new AlphaOccluder(node, this._options.alpha);
    }

    if (isSource(shape)) {
      return shape;
    }

    if ('points' in shape) {
      return new PolygonOccluder(shape.points, { closed: shape.closed ?? true, node });
    }

    return new BodyOccluder(shape.body);
  }
}

/** A node's local bounds, placed by its world transform and re-read every frame. */
class BoundsOccluder implements OccluderSource {
  private readonly _node: SceneNode;
  private readonly _corners = new Float32Array(8);

  public constructor(node: SceneNode) {
    this._node = node;
  }

  public collect(_bounds: ReadonlyRectangle, out: OccluderSink): void {
    const local = this._node.getLocalBounds();

    if (local.width <= 0 || local.height <= 0) {
      return;
    }

    const { a, b, c, d, x, y } = this._node.getWorldTransform();
    const corners = this._corners;
    const { left, top, right, bottom } = local;

    corners[0] = a * left + b * top + x;
    corners[1] = c * left + d * top + y;
    corners[2] = a * right + b * top + x;
    corners[3] = c * right + d * top + y;
    corners[4] = a * right + b * bottom + x;
    corners[5] = c * right + d * bottom + y;
    corners[6] = a * left + b * bottom + x;
    corners[7] = c * left + d * bottom + y;
    out.addPolyline(corners, true);
  }
}

/** The colliders of one body, sensors excluded. */
class BodyOccluder implements OccluderSource {
  private readonly _body: OccluderBody;
  private _scratch = new Float32Array(64);
  private readonly _reserve = (floats: number): Float32Array => {
    if (this._scratch.length < floats) {
      this._scratch = new Float32Array(floats);
    }

    return this._scratch;
  };

  public constructor(body: OccluderBody) {
    this._body = body;
  }

  public collect(_bounds: ReadonlyRectangle, out: OccluderSink): void {
    for (const collider of this._body.colliders) {
      if (!collider.isSensor) {
        emitCollider(collider, 12, this._reserve, out);
      }
    }
  }
}

provideOccluderComponent(OccluderComponent);
