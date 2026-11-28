import type { SceneNode } from '@codexo/exojs';

import type { PhysicsBody } from '../PhysicsBody';
import { PhysicsBinding } from './PhysicsBinding';

/**
 * Owns the body ↔ node links and writes bound node transforms after each step.
 * Backend-agnostic (frontend-level) - it reads only the public body transform.
 */
export class BindingRegistry {
  private readonly _bindings = new Map<PhysicsBody, PhysicsBinding>();
  private readonly _boundNodes = new Map<SceneNode, PhysicsBinding>();
  private _syncStamp = 0;

  /** Link a live node with a supported transform to the body. */
  public bind(body: PhysicsBody, node: SceneNode): PhysicsBinding {
    this._assertBindable(body, node);
    const binding = new PhysicsBinding(body, node);
    this._assertBindable(body, node);
    const previous = this._bindings.get(body);

    if (previous !== undefined) {
      previous._invalidatePose();
      this._boundNodes.delete(previous.node);
    }

    // Publish before calling node setters so reentrant unbind or teardown can cancel it.
    this._setBinding(binding);

    try {
      binding.sync();
    } catch (error) {
      if (this._bindings.get(body) === binding) {
        this.unbind(body);

        if (previous !== undefined && !previous.node.destroyed && !this._boundNodes.has(previous.node)) {
          this._setBinding(previous);
        }
      }

      throw error;
    }

    if (node.destroyed && this._bindings.get(body) === binding) {
      this.unbind(body);
    }

    return binding;
  }

  private _setBinding(binding: PhysicsBinding): void {
    this._bindings.set(binding.body, binding);
    this._boundNodes.set(binding.node, binding);
  }

  private _assertBindable(body: PhysicsBody, node: SceneNode): void {
    if (node.destroyed) {
      throw new Error('PhysicsBinding: cannot bind a destroyed node — its pooled transform has already been released.');
    }

    const existing = this._boundNodes.get(node);

    if (existing !== undefined && existing.body !== body) {
      throw new Error('PhysicsBinding: this node is already bound to a different body in this world.');
    }
  }

  /** Remove the link for `body`, if any. */
  public unbind(body: PhysicsBody): void {
    const binding = this._bindings.get(body);

    if (binding !== undefined) {
      binding._invalidatePose();
      this._bindings.delete(body);
      this._boundNodes.delete(binding.node);
    }
  }

  /**
   * Write every bound node's transform from its body, dropping links whose node
   * has been destroyed.
   *
   * `SceneNode.destroy()` returns the node's position/rotation state to a shared
   * pool, so a `sync()` that kept writing would not merely update a dead node -
   * it would write through recycled state into whichever live node next takes
   * that slot. Pruning here (rather than only on an explicit `unbind`) is what
   * makes destroying a bound node safe from THAT hazard without a
   * physics-side call.
   *
   * It does not remove the body: pruning only drops this registry's link, so
   * a destroyed node's body stays in {@link PhysicsWorld}, keeps being
   * integrated, and keeps generating contacts and query results with nothing
   * on screen. The body's owner is responsible for destroying it (or calling
   * {@link unbind} first) when the node it was driving is destroyed.
   */
  public sync(): void {
    this._syncAll(undefined);
  }

  /**
   * Like {@link sync}, but places each node `alpha` of the way from its body's
   * previous fixed state to its current one - see
   * {@link PhysicsBinding.syncInterpolated}. Same destroyed-node pruning.
   */
  public syncInterpolated(alpha: number): void {
    this._syncAll(alpha);
  }

  private _syncAll(alpha: number | undefined): void {
    const stamp = ++this._syncStamp;

    for (const binding of this._bindings.values()) {
      if (binding.node.destroyed) {
        this.unbind(binding.body);
      } else {
        this._syncBinding(binding, alpha, stamp);
      }
    }
  }

  private _syncBinding(binding: PhysicsBinding, alpha: number | undefined, stamp: number): void {
    if (binding._syncStamp === stamp) {
      return;
    }

    binding._syncStamp = stamp;

    // A descendant must invert the ancestor's pose for this presentation pass.
    for (let parent = binding.node.parent; parent; parent = parent.parent) {
      const ancestor = this._boundNodes.get(parent);

      if (ancestor !== undefined && !parent.destroyed) {
        this._syncBinding(ancestor, alpha, stamp);

        // The ancestor's transform setter can unlink or destroy the child.
        if (this._bindings.get(binding.body) !== binding) {
          return;
        }

        if (binding.node.destroyed) {
          this.unbind(binding.body);

          return;
        }

        break;
      }
    }

    if (alpha === undefined) {
      binding.sync();
    } else {
      binding.syncInterpolated(alpha);
    }
  }

  /** Number of active bindings. */
  public get size(): number {
    return this._bindings.size;
  }

  /** Drop all links. */
  public clear(): void {
    for (const binding of this._bindings.values()) {
      binding._invalidatePose();
    }

    this._bindings.clear();
    this._boundNodes.clear();
  }
}
