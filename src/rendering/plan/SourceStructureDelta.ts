import { DirtyChannel, nodeDirtyIndex } from '#core/nodeDirtyIndex';
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
  _rederiveSourceScope(node: RenderNode, previous: SourceScope, cursor: number, epoch: number, targets: SourceDeltaTargets): SourceScope | null;
}

/** What a re-derivation may ask of the delta that started it. */
export interface SourceDeltaTargets {
  /** Whether `scope` is one the delta attributed a structural change to. */
  isTarget(scope: SourceScope): boolean;
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
export class SourceStructureDelta implements SourceDeltaTargets {
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
      const fresh = this._rediscover(host, target, node, source, epoch);

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
    this._rekeyPersistentSlots(host, representation, source, carried, previousHandleCount);
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

    this._pruneNestedTargets(source, root);

    return nodeDirtyIndex.readSince(cursor, DirtyChannel.Transform | DirtyChannel.Content | DirtyChannel.Tint, marked => {
      const scope = source.scopeOfNode(marked);

      return scope === null || this._covers(source, scope, root);
    });
  }

  /**
   * Drop every target an enclosing target already re-discovers.
   *
   * Two adds in one frame, one under a container and one under its parent, is an
   * ordinary churn shape, and without this the nested subtree is walked twice -
   * once on its own and once inside the ancestor's discovery, the first result
   * then thrown away because {@link RenderRootSource.commitStructureDelta}
   * rebuilds the scope list from the live tree.
   *
   * The pruned scopes stay in {@link _targetSet}: they ARE re-discovered, just by
   * an ancestor, so {@link _covers} must keep answering `true` for them.
   */
  private _pruneNestedTargets(source: RenderRootSource, root: RenderNode): void {
    const targets = this._targets;
    let kept = 0;

    for (const target of targets) {
      const node = sourceScopeNode(target, root);
      const parent = node === root ? null : node.parent;
      const enclosing = parent === null ? null : source.scopeOfNode(parent);

      if (enclosing === null || !this._covers(source, enclosing, root)) {
        targets[kept++] = target;
      }
    }

    targets.length = kept;
  }

  /**
   * Whether `scope` is re-discovered by one of this delta's targets - itself, or
   * any scope enclosing it.
   *
   * Climbs the scope chain rather than testing every target, so the answer costs
   * the subtree's DEPTH instead of the number of targets. A churning scene
   * produces one target per changed container, which is a count worth not being
   * quadratic in.
   */
  private _covers(source: RenderRootSource, scope: SourceScope, root: RenderNode): boolean {
    let current: SourceScope | null = scope;

    while (current !== null) {
      if (this._targetSet.has(current)) {
        return true;
      }

      const node = sourceScopeNode(current, root);
      const parent = node === root ? null : node.parent;

      current = parent === null ? null : source.scopeOfNode(parent);
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
  private _rediscover(host: SourceDeltaHost, target: SourceScope, root: RenderNode, source: RenderRootSource, epoch: number): SourceScope | null {
    const node = sourceScopeNode(target, root);

    if (node === root) {
      return this._rederiveOrDiscover(host, node, target, source, epoch);
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

    return this._rederiveOrDiscover(host, node, target, source, epoch);
  }

  /**
   * A scope whose node moved or re-tinted is discovered afresh, because every
   * stored bound and every prepacked row below it is stale at once. A content
   * mark on the node itself does not disqualify it: a child-list change raises
   * one on the container as a matter of course, and nothing a container records
   * about its children lives in its own content.
   */
  private _rederiveOrDiscover(host: SourceDeltaHost, node: RenderNode, target: SourceScope, source: RenderRootSource, epoch: number): SourceScope | null {
    const cursor = source.changeCursor;

    if (node._transformMarkSequence > cursor || node._tintMarkSequence > cursor) {
      return host._discoverSourceScope(node);
    }

    return host._rederiveSourceScope(node, target, cursor, epoch, this);
  }

  public isTarget(scope: SourceScope): boolean {
    return this._targetSet.has(scope);
  }

  /**
   * Re-key the backend's slot store against the re-discovered source, or drop
   * it.
   *
   * The store's per-handle tables are keyed on the numbering the delta just
   * changed, and a scope discovered now is not prepacked - so the store is
   * offered the new source, with the carry map so it re-derives only the items
   * the delta did not carry, and answers whether it can still serve them.
   *
   * A refusal costs the store, not correctness. It is also how the store's
   * append-only state stays bounded: whatever a long-lived store accumulates
   * across churn - dead texture-table entries above all - is discarded here, and
   * the next acquisition builds a fresh one from what the source holds now.
   */
  private _rekeyPersistentSlots(
    host: SourceDeltaHost,
    representation: RetainedRootRepresentation,
    source: RenderRootSource,
    carried: Int32Array,
    previousHandleCount: number,
  ): void {
    const bundle = representation.heldPersistentSlots;

    if (bundle === null) {
      return;
    }

    const backend = host.backend as RenderBackend & PersistentSlotBackend;

    if (!sourceShapeAllowsPersistentSlots(source) || backend._rekeyPersistentSlots?.(bundle, source, carried, previousHandleCount) !== true) {
      representation.releasePersistentSlots();
    }
  }
}

/**
 * The node a source scope was discovered from. The root scope has none of its
 * own - it IS the render root - so the caller supplies it.
 */
const sourceScopeNode = (scope: SourceScope, root: RenderNode): RenderNode => (scope as Partial<SourceGroup>).node ?? root;
