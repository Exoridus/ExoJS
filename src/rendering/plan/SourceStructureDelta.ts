import { DirtyChannel, nodeDirtyIndex } from '#core/nodeDirtyIndex';
import type { SceneNode } from '#core/SceneNode';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';

import { type PersistentSlotBackend, sourceShapeAllowsPersistentSlots } from './persistentSlotDraw';
import type { RenderRootSource } from './RenderRootSource';
import { adoptScopeContents, type SourceGroup, type SourceScope } from './renderSourceItem';
import type { RetainedRootRepresentation } from './RetainedRootRepresentation';

/**
 * What the delta needs from the collector driving it: the backend it is drawing
 * with, and the discovery walk itself - which stays where the rest of the
 * source-collection rules live, so the delta re-derives a scope through exactly
 * the code that first produced it rather than through a second copy of those
 * rules.
 * @internal
 */
export interface SourceDeltaHost {
  readonly backend: RenderBackend;
  _discoverSourceScope(node: RenderNode): SourceScope | null;
}

/**
 * @internal
 *
 * Brings a render root's persistent items back in step with a subtree whose
 * STRUCTURE changed, by re-discovering only the scopes that changed.
 *
 * A structural change used to withdraw the whole representation. The items are
 * keyed on the structure revision, and the gate that builds them wants two
 * consecutive frames that found the subtree unchanged - which a scene adding and
 * removing nodes every frame never produces, so every such frame fell back to a
 * full collect over every node. That is why structural churn cost an order of
 * magnitude more than moving the same nodes does.
 *
 * What survives a delta is what the expensive half is made of: the items of
 * every untouched scope, their spatial indices, the derived membership, and the
 * backend's per-item GPU rows for every drawable that is still there and
 * unchanged.
 *
 * One instance per collector, because the target list is scratch reused across
 * frames; a delta is never in flight while another one runs.
 */
export class SourceStructureDelta {
  /** Scopes this delta re-discovers, refilled per attempt so it allocates none. */
  private readonly _targets: SourceScope[] = [];
  private readonly _targetSet = new Set<SourceScope>();

  /**
   * Settle the structure channel for one root.
   *
   * The delta is refused - leaving the invalidate-and-rebuild behaviour in
   * place - unless every change since the items were last accounted for lands
   * inside a scope it re-discovers. That is not conservatism for its own sake:
   * the items store world bounds and the backend writes a slot's rows once, when
   * it enters, so a move or a content change to an item the delta would KEEP
   * makes both stale. It is also the right economy - a normal collect over a
   * moved subtree replays each container's unchanged direct drawables from its
   * own cache, which a re-discovery cannot.
   */
  public reconcile(
    host: SourceDeltaHost,
    node: RenderNode,
    representation: RetainedRootRepresentation,
    contentRevision: number,
    structureRevision: number,
    ancestryStamp: number,
    transformRevision: number,
  ): void {
    const source = representation.source;

    if (source === null) {
      return;
    }

    if (source.isUsable(contentRevision, structureRevision, ancestryStamp, transformRevision)) {
      // Nothing below this root changed, so every mark still standing belongs to
      // somebody else. Accepting them here is what keeps the cursor inside the
      // index's window for a root that goes quiet for a while.
      source.noteSettled();

      return;
    }

    if (!representation.shouldApplyStructureDelta() || !source.canApplyStructureDelta(structureRevision, ancestryStamp)) {
      return;
    }

    try {
      this._apply(host, node, representation, source, contentRevision, structureRevision, ancestryStamp, transformRevision);
    } finally {
      // The list names scopes this frame may have dropped, and holding one keeps
      // the whole subtree behind it alive until the next delta happens to run.
      this._targets.length = 0;
      this._targetSet.clear();
    }
  }

  private _apply(
    host: SourceDeltaHost,
    node: RenderNode,
    representation: RetainedRootRepresentation,
    source: RenderRootSource,
    contentRevision: number,
    structureRevision: number,
    ancestryStamp: number,
    transformRevision: number,
  ): void {
    if (!this._collectTargets(source, node)) {
      representation.noteStructureDeltaRefused();

      return;
    }

    const product = representation.derivedProduct;
    const previousHandleCount = source.itemCount;
    const epoch = source.stampCarry();

    // An item may only carry its derived slot if the rows the backend wrote for
    // it still describe it. A re-discovered scope produces fresh CPU data for
    // every item in it, but a slot is written once - when the item enters - so a
    // drawable that moved or changed inside one has to enter again.
    source.dropCarryOfChangedItems(epoch);
    product?.snapshotMembership(source.scopes, previousHandleCount);

    for (const target of this._targets) {
      const fresh = this._rediscover(host, target, node);

      if (fresh === null) {
        // Part of the tree may already carry fresh contents, and each spliced
        // scope is a valid discovery of its own node - but the one that failed
        // is not, so nothing here describes the subtree any more.
        source.invalidate();
        product?.release();
        representation.releasePersistentSlots();
        representation.noteStructureDeltaRefused();

        return;
      }

      adoptScopeContents(target, fresh);
    }

    const carried = source.commitStructureDelta(node, epoch, contentRevision, structureRevision, ancestryStamp, transformRevision);

    product?.recarry(source.scopes, carried, source.itemCount, previousHandleCount);
    representation.invalidatePersistentSelection();
    representation.noteStructureDeltaApplied();
    this._rekeyPersistentSlots(host, representation, source);
  }

  /**
   * Fill {@link _targets} with the scopes to re-discover, and report whether the
   * delta may proceed at all.
   *
   * A change is attributed by walking UP from the marked node to the nearest
   * scope the source recorded, which is what makes a mark on a node the source
   * never stored - a child of a live re-dispatch, a node already detached -
   * resolve to something the delta can act on, or to nothing.
   */
  private _collectTargets(source: RenderRootSource, root: RenderNode): boolean {
    const targets = this._targets;
    const seen = this._targetSet;
    const cursor = source.changeCursor;

    targets.length = 0;
    seen.clear();

    const attributed = nodeDirtyIndex.readSince(cursor, DirtyChannel.Structure, marked => {
      const scope = source.scopeOfNode(marked);

      if (scope !== null && !seen.has(scope)) {
        seen.add(scope);
        targets.push(scope);
      }

      return true;
    });

    if (!attributed || targets.length === 0) {
      return false;
    }

    return nodeDirtyIndex.readSince(cursor, DirtyChannel.Transform | DirtyChannel.Content | DirtyChannel.Tint, marked => {
      const scope = source.scopeOfNode(marked);

      return scope === null || this._covers(scope, root);
    });
  }

  /** Whether `scope` is re-discovered by one of this delta's targets. */
  private _covers(scope: SourceScope, root: RenderNode): boolean {
    if (this._targetSet.has(scope)) {
      return true;
    }

    const scopeNode = sourceScopeNode(scope, root);

    for (const target of this._targets) {
      if (isUnderNode(scopeNode, sourceScopeNode(target, root))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Re-run discovery for one scope's node, or refuse it.
   *
   * The splice replaces a scope's CONTENTS, so it is refused for every change
   * that would instead alter the entry the PARENT holds for this scope: a
   * producer that now has to be a live re-dispatch, one that no longer renders
   * at all, and the placement keys the parent derived when it recorded the
   * entry.
   */
  private _rediscover(host: SourceDeltaHost, target: SourceScope, root: RenderNode): SourceScope | null {
    const node = sourceScopeNode(target, root);

    if (node === root) {
      return host._discoverSourceScope(node);
    }

    const group = target as SourceGroup;

    if (
      node.destroyed ||
      !node.visible ||
      node._renderPlanHasBarrierEffects() ||
      node._isTransformGroupBoundary ||
      node._isDrawableForRenderPlan() ||
      group.zIndex !== node.zIndex ||
      group.preserveDrawOrder !== node.preserveDrawOrder
    ) {
      return null;
    }

    return host._discoverSourceScope(node);
  }

  /**
   * Re-key the backend's slot store against the re-discovered source, or drop
   * it.
   *
   * The store's per-handle texture table is keyed on the numbering the delta
   * just changed, and a scope discovered now is not prepacked - so the store is
   * offered the new source and answers whether it can still serve it. A refusal
   * costs the store, not correctness: the root acquires a new one on a later
   * frame.
   */
  private _rekeyPersistentSlots(host: SourceDeltaHost, representation: RetainedRootRepresentation, source: RenderRootSource): void {
    const bundle = representation.heldPersistentSlots;

    if (bundle === null) {
      return;
    }

    const backend = host.backend as RenderBackend & PersistentSlotBackend;

    if (!sourceShapeAllowsPersistentSlots(source) || backend._rekeyPersistentSlots?.(bundle, source) !== true) {
      representation.releasePersistentSlots();
    }
  }
}

/**
 * The node a source scope was discovered from. The root scope has none of its
 * own - it IS the render root - so the caller supplies it.
 */
const sourceScopeNode = (scope: SourceScope, root: RenderNode): RenderNode => (scope as Partial<SourceGroup>).node ?? root;

/** Whether `node` is `ancestor` or lies anywhere below it. */
const isUnderNode = (node: RenderNode, ancestor: RenderNode): boolean => {
  let current: SceneNode | null = node;

  while (current !== null) {
    if ((current as unknown as RenderNode) === ancestor) {
      return true;
    }

    current = current.parent;
  }

  return false;
};
