import { logger, type Matrix, radiansToDegrees, type SceneNode } from '@codexo/exojs';

import type { PhysicsBody } from '../PhysicsBody';

const supportedTransform = (node: SceneNode, parent: Matrix | undefined): boolean => {
  const scale = (node as Partial<SceneNode>).scale;

  if (
    node.skewX !== 0 ||
    node.skewY !== 0 ||
    (scale !== undefined && (!(scale.x > 0 && scale.y > 0) || !Number.isFinite(scale.x + scale.y)))
  ) {
    return false;
  }

  if (parent === undefined) {
    return true;
  }

  // A rotation has orthonormal columns and positive determinant.
  const { a, b, c, d, x, y } = parent;
  const epsilon = 1e-6;

  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Math.abs(a * a + c * c - 1) <= epsilon &&
    Math.abs(a - d) <= epsilon &&
    Math.abs(b + c) <= epsilon
  );
};

const transformError =
  'PhysicsBinding: expected a node with positive finite scale and zero skew, under a rigid (translated or rotated) parent.';

/**
 * A link between a {@link PhysicsBody} and a {@link SceneNode}. The body's world
 * position **and rotation** are written onto the node, so the node renders
 * at the simulation pose. Translated and rotated parents are supported.
 * Node scale is visual. Skew, reflection and non-rigid parent transforms
 * are rejected on bind. If introduced later, sync reports the problem
 * once and skips presentation until the transform is supported again.
 *
 * The two angles have opposite signs: a body angle turns clockwise on the Y-down
 * screen, a `SceneNode.rotation` counter-clockwise, so a body at `+30°` (in
 * radians) shows as a node rotation of `-30°`.
 *
 * By default the node snaps to the latest fixed-step state after each step. With
 * `PhysicsWorld`'s interpolation enabled the node is instead placed between the
 * body's previous and current fixed states, which smooths motion when the fixed
 * rate is below the frame rate. Either way this is presentation: nothing written
 * onto the node is read back into the simulation.
 */
export class PhysicsBinding {
  /** @internal - the last registry presentation pass that visited this binding. */
  public _syncStamp = 0;

  private _reportedTransform = false;
  private _poseVersion = 0;

  public constructor(
    public readonly body: PhysicsBody,
    public readonly node: SceneNode,
  ) {
    if (!supportedTransform(node, node.parent?.getWorldTransform())) {
      throw new Error(transformError);
    }
  }

  /** Write the body's current transform (position + rotation) onto the bound node. */
  public sync(): void {
    this._writePose(this.body.x, this.body.y, this.body.angle);
  }

  /**
   * Place the node `alpha` of the way from the body's previous fixed state to
   * its current one. `alpha` is the host's leftover sub-step fraction, so `0`
   * renders the state the last fixed step started from and values approaching
   * `1` render the state it produced.
   *
   * A plain lerp is correct for the angle too: body angles are continuous and
   * unbounded, never wrapped into a range, so there is no shortest-arc case to
   * resolve.
   */
  public syncInterpolated(alpha: number): void {
    const body = this.body;
    const previousX = body.previousX;
    const previousY = body.previousY;
    const previousAngle = body.previousAngle;

    this._writePose(
      previousX + (body.x - previousX) * alpha,
      previousY + (body.y - previousY) * alpha,
      previousAngle + (body.angle - previousAngle) * alpha,
    );
  }

  /** @internal - cancel a pose write that is already in progress. */
  public _invalidatePose(): void {
    ++this._poseVersion;
  }

  private _writePose(x: number, y: number, angle: number): void {
    const version = this._poseVersion;
    const node = this.node;
    const parent = node.parent?.getWorldTransform();

    if (version !== this._poseVersion || this.node.destroyed) {
      return;
    }

    if (!supportedTransform(node, parent)) {
      if (!this._reportedTransform) {
        this._reportedTransform = true;
        logger.warn(transformError, { source: 'physics' });
      }

      return;
    }

    this._reportedTransform = false;

    if (parent !== undefined) {
      const dx = x - parent.x;
      const dy = y - parent.y;

      node.setPosition(parent.a * dx + parent.c * dy, parent.b * dx + parent.d * dy);

      if (parent.c !== 0 || parent.a !== 1) {
        angle -= Math.atan2(parent.c, parent.a);
      }
    } else {
      node.setPosition(x, y);
    }

    // A position listener can replace or remove this binding synchronously.
    if (version === this._poseVersion && !node.destroyed) {
      node.setRotation(-radiansToDegrees(angle));
    }
  }
}
