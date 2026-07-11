import { logger, type SceneNode } from '@codexo/exojs';

import type { PhysicsBody } from '../PhysicsBody';
import { PhysicsBinding } from './PhysicsBinding';

/** `true` when `ancestor` contributes anything beyond identity to a descendant's world transform. */
const hasNonIdentityTransform = (ancestor: SceneNode): boolean =>
  ancestor.x !== 0 ||
  ancestor.y !== 0 ||
  ancestor.rotation !== 0 ||
  ancestor.skewX !== 0 ||
  ancestor.skewY !== 0 ||
  ancestor.scale.x !== 1 ||
  ancestor.scale.y !== 1 ||
  ancestor.origin.x !== 0 ||
  ancestor.origin.y !== 0;

/**
 * Dev-only bind-time guard (F16): {@link PhysicsBinding.sync} writes the
 * body's WORLD transform into the node's LOCAL position/rotation, which is
 * only correct when local space == world space. Walk the parent chain and
 * warn when an ancestor either carries a non-identity transform or is a
 * transform-group boundary (RetainedContainer) — in both cases the ancestor
 * contribution is applied ON TOP of the world-space values sync() writes,
 * double-transforming the node on screen.
 */
const warnUnlessWorldSpaceRooted = (node: SceneNode): void => {
  // Duck-typed test doubles may omit `parent`; treat that as world-space-rooted.
  let ancestor: SceneNode | null = node.parent ?? null;

  while (ancestor !== null) {
    if (ancestor._isTransformGroupBoundary || hasNonIdentityTransform(ancestor)) {
      const nodeName = node.name !== null && node.name !== '' ? ` '${node.name}'` : '';
      const ancestorName = ancestor.name !== null && ancestor.name !== '' ? ` '${ancestor.name}'` : '';

      logger.warn(
        `PhysicsBinding: the bound node${nodeName} is not world-space-rooted — ancestor${ancestorName} ${
          ancestor._isTransformGroupBoundary ? 'is a transform-group boundary (RetainedContainer)' : 'has a non-identity transform'
        }. sync() writes the body's WORLD transform into the node's LOCAL position/rotation, so nesting it under a ` +
          'moved/rotated/scaled container (or a transform group) will double-transform it on screen. Re-parent the node ' +
          'to a world-space-rooted container.',
        { source: 'physics' },
      );

      return;
    }

    ancestor = ancestor.parent ?? null;
  }
};

/**
 * Owns the body ↔ node links and writes bound node transforms after each step.
 * Backend-agnostic (frontend-level) — it reads only the public body transform.
 */
export class BindingRegistry {
  private readonly _bindings = new Map<PhysicsBody, PhysicsBinding>();

  /**
   * Link `body` to `node`. Rejects nodes with non-zero skew; runtime scale is
   * ignored. In dev builds, warns when the node is not world-space-rooted
   * (moved ancestor or transform-group boundary above it) — see
   * {@link PhysicsBinding} for the local==world contract.
   */
  public bind(body: PhysicsBody, node: SceneNode): PhysicsBinding {
    if (node.skewX !== 0 || node.skewY !== 0) {
      throw new Error(`PhysicsBinding: the bound node has non-zero skew (${node.skewX}°, ${node.skewY}°); skewed nodes are not supported.`);
    }

    if (__DEV__) {
      warnUnlessWorldSpaceRooted(node);
    }

    const binding = new PhysicsBinding(body, node);

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
