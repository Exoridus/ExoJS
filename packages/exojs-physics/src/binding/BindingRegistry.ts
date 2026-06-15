import type { SceneNode } from '@codexo/exojs';

import type { PhysicsBody } from '../PhysicsBody';
import type { BindingOptions } from './PhysicsBinding';
import { PhysicsBinding } from './PhysicsBinding';

/**
 * Owns the body ↔ node links and writes bound node transforms after each step.
 * Backend-agnostic (frontend-level) — it reads only the public body transform.
 */
export class BindingRegistry {
  private readonly _bindings = new Map<PhysicsBody, PhysicsBinding>();

  /** Link `body` to `node`. Rejects nodes with non-zero skew; runtime scale is ignored. */
  public bind(body: PhysicsBody, node: SceneNode, options?: BindingOptions): PhysicsBinding {
    if (node.skewX !== 0 || node.skewY !== 0) {
      throw new Error(`PhysicsBinding: the bound node has non-zero skew (${node.skewX}°, ${node.skewY}°); skewed nodes are not supported.`);
    }

    const binding = new PhysicsBinding(body, node, options?.drive ?? 'body-to-node');

    this._bindings.set(body, binding);
    binding.sync();

    return binding;
  }

  /** Remove the link for `body`, if any. */
  public unbind(body: PhysicsBody): void {
    this._bindings.delete(body);
  }

  /** Write every bound node's transform from its body. */
  public sync(): void {
    for (const binding of this._bindings.values()) {
      binding.sync();
    }
  }

  /** `true` when at least one binding exists. */
  public get size(): number {
    return this._bindings.size;
  }

  /** Drop all links. */
  public clear(): void {
    this._bindings.clear();
  }
}
