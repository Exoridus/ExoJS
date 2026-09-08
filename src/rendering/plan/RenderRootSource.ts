import { DirtyChannel, nodeDirtyIndex } from '#core/nodeDirtyIndex';
import type { SceneNode } from '#core/SceneNode';
import type { Drawable } from '#rendering/Drawable';
import type { RenderNode } from '#rendering/RenderNode';

import type { DerivedRootProduct } from './DerivedRootProduct';
import { GridVisibility } from './GridVisibility';
import { changeBelongsToLiveEntry } from './liveEntryChange';
import { RenderEntryKind } from './renderCommand';
import type { RenderItemVisibility } from './RenderItemVisibility';
import { finalizeSourceScopes, releaseScopeContents, type SourceScope } from './renderSourceItem';
import { isUnder } from './retainedTransformRowPatch';

/** What one frame selects from: the scopes, the source, and this view's membership. @internal */
export interface SourceSelection {
  readonly rootScope: SourceScope;
  readonly source: RenderRootSource;
  readonly product: DerivedRootProduct;
}

/**
 * Epoch handed to one structure delta at a time, so a stamp left on a drawable
 * by an earlier delta - or by another root's - can never be read as a handle
 * into a numbering that no longer exists.
 */
let carryEpoch = 0;

/**
 * @internal
 *
 * The persistent, view-INDEPENDENT items of one render root: every drawable in
 * the subtree with its recorded order and world bounds, whether or not it is
 * currently on screen.
 *
 * This is the piece a captured product cannot supply. A capture holds what the
 * camera admitted at capture time, so an item that has since scrolled into view
 * is precisely the one it does not contain - which is why a view change outside
 * the capture margin had to rebuild the whole plan from the scene graph, at
 * ~0.4us per node (400ms at a million).
 *
 * With the source present, that rebuild becomes a selection: query the items the
 * new rect admits, keep the ones it does, and emit only those. The scene graph
 * is not touched, no transform is resolved for a rejected item, and no material
 * key is computed for one.
 *
 * Ownership is per render root, not per node. Visibility and records are
 * per-root and per-view, so a node rendered under two roots genuinely has two
 * states; a single owner slot on the node would make the two roots overwrite
 * each other every frame.
 *
 * Deliberately carries nothing backend-, view- or frame-bound: no `MaterialKey`
 * (a backend switch invalidates one), no transform row and no `nodeIndex` (both
 * frame-local), and no membership (per view - see {@link DerivedRootProduct}).
 * Those are re-derived when a selection is emitted and belong to the derived
 * product, not here. The root-specific KEYS - view selection and render target -
 * likewise stay in {@link RetainedRootRepresentation} above it, which is what
 * keeps this half describable without a camera.
 *
 * This is a RENDER ROOT's structure and stays one. A `RetainedContainer` was
 * once expected to adopt it; it must not, because the boundary suppresses
 * per-child culling (`RenderNode._collectForRenderPlan`), so a selection inside
 * a transform group can only ever return every item. It would pay the discovery
 * walk, the item store and the index for no selectivity, and trade an
 * O(batches) instruction replay for an O(items) emit. What the two tiers really
 * do share is the layer below - {@link RetainedGroupFragment}'s pooled records
 * and {@link CaptureThrashSuppressor} - and they share it already.
 *
 * The one exception is the ancestry stamp, which is a key here as well: the
 * items hold world bounds, so they are ancestry-dependent data rather than
 * merely ancestry-keyed products (see {@link _ancestryStamp}).
 */
export class RenderRootSource {
  private _rootScope: SourceScope | null = null;
  /** Every scope below the root, in depth-first order; index IS `scope.ordinal`. */
  private _scopes: readonly SourceScope[] = [];
  private _itemCount = 0;
  private _contentRevision = -1;
  private _structureRevision = -1;
  /**
   * The root's global-transform stamp when the items were built.
   *
   * The items store WORLD bounds, and an ancestor ABOVE the render root can move
   * without touching any revision inside the subtree - which is why
   * `RetainedRootRepresentation` tracks this stamp at all. Stored world bounds
   * are therefore ancestry-dependent data, and a stamp change invalidates them.
   *
   * Conservative on purpose: storing bounds in an ancestry-independent basis
   * would avoid the rebuild, and is not needed to hit the target. Note that the
   * scan strategy reads bounds live and is already correct across an ancestor
   * move; this key exists for the stored data the spatial index builds on, so
   * that assumption never becomes silent.
   */
  private _ancestryStamp = -1;
  /**
   * The subtree's transform revision when the items were built.
   *
   * A key like the others, because the items store WORLD bounds and a move is
   * exactly what makes a stored extent describe where a drawable was rather than
   * where it is.
   *
   * The alternative - keep the source across a move and read each node's bounds
   * live during the scan - was measured and is a LOSS, badly. A normal collect
   * over a moved subtree is not a naive walk: every `Container` replays its
   * unchanged direct drawables from its own retained slot cache, reusing their
   * cached material key and screen extent. A live-bounds selection reproduces
   * none of that and resolves both per item, which took `deep-hierarchy` at
   * 100,000 nodes from 1.9ms to 14.8ms median. So the source is not "usable but
   * degraded" after a move; it is simply not the cheaper answer, and the frame
   * belongs on the path that already handles moving content.
   */
  private _transformRevision = -1;

  /**
   * Swappable because which strategy wins is a measurement.
   *
   * The default moved to the grid in cut 2, on this evidence: at a million items
   * the flat scan is a small share of a camera step (the ~250,000 admitted items
   * dominate it), but once their materialisation is incremental the scan is all
   * that is left - and a full pass over a million items does not fit in the 8ms
   * the target allows. The scan stays as the reference the grid is pinned
   * against, and as the fallback for a scope with no index.
   */
  public visibility: RenderItemVisibility = new GridVisibility();

  /** Whether the items still describe this subtree exactly. */
  public isUsable(contentRevision: number, structureRevision: number, ancestryStamp: number, transformRevision: number): boolean {
    return (
      this._rootScope !== null &&
      this._contentRevision === contentRevision &&
      this._structureRevision === structureRevision &&
      this._ancestryStamp === ancestryStamp &&
      this._transformRevision === transformRevision
    );
  }

  /**
   * Resolve every item's canonical render data, once, across every scope.
   *
   * Called when a backend has accepted this source for the persistent-indexed
   * path and never otherwise: the table is the largest thing the source holds,
   * and it only pays for itself where an ENTER would otherwise read a cold
   * drawable. `false` means at least one item cannot describe itself as a quad,
   * and the caller must fall back rather than serve a partial table.
   *
   * A scope re-discovered by a structure delta arrives unprepacked, so a delta
   * that keeps the indexed path re-runs this and pays for the changed scopes
   * only.
   */
  public prepack(): boolean {
    for (const scope of this._scopes) {
      if (!scope.items.prepack()) {
        return false;
      }
    }

    return true;
  }

  /** The root scope, valid only while {@link isUsable} holds. */
  public get rootScope(): SourceScope | null {
    return this._rootScope;
  }

  /** Every scope in depth-first order; the index IS the scope's ordinal. */
  public get scopes(): readonly SourceScope[] {
    return this._scopes;
  }

  /** Total persistent items across all scopes - the handle space's size. */
  public get itemCount(): number {
    return this._itemCount;
  }

  /** CPU bytes the packed items and the spatial indices hold. */
  public get byteLength(): number {
    let total = 0;

    for (const scope of this._scopes) {
      total += scope.items.byteLength + scope.index.byteLength;
    }

    return total;
  }

  /**
   * Adopt a fresh culling-free snapshot: assign ordinals and handle bases, and
   * build each scope's spatial index.
   *
   * The caller owns the scope tree; the source only keys it. A content or
   * ancestry change still invalidates rather than patches - a structural one
   * does not, and takes the delta below instead.
   */
  public adopt(
    root: RenderNode,
    rootScope: SourceScope,
    contentRevision: number,
    structureRevision: number,
    ancestryStamp: number,
    transformRevision: number,
  ): void {
    const scopes: SourceScope[] = [];

    this._itemCount = finalizeSourceScopes(rootScope, scopes, 0);
    this._rootScope = rootScope;
    this._scopes = scopes;
    this._indexScopesByNode(root);
    this._noteKeys(contentRevision, structureRevision, ancestryStamp, transformRevision);
  }

  /** Drop the items (content/ancestry changed, or the root was destroyed). */
  public invalidate(): void {
    for (const scope of this._scopes) {
      scope.items.clear();
      scope.index.release();
    }

    this._rootScope = null;
    this._scopes = [];
    this._scopeOfNode.clear();
    this._itemCount = 0;
    this._contentRevision = -1;
    this._structureRevision = -1;
    this._ancestryStamp = -1;
    this._transformRevision = -1;
    this._changeCursor = -1;
    this._liveEntryNodes.clear();
  }

  /**
   * Whether the items still describe the subtree after a content change, and
   * if so, adopt `contentRevision` as the new key.
   *
   * The source records nothing about a live entry - it is re-dispatched
   * through its own collect on every selection - so a change marked on one, or
   * on anything below one, leaves every item and bound the source holds
   * intact. Reads the marks since the cursor to find out whether the change is
   * only that (see {@link changeBelongsToLiveEntry}); a change to an item or to
   * a container above items answers `false`, and the caller rebuilds as it
   * always did. On `true` the cursor advances: every mark up to now is
   * accounted for, exactly as {@link noteSettled} records for a quiet frame.
   *
   * Only the content key may differ. A structure, ancestry or transform change
   * has its own tier and is refused here.
   */
  public reconcileContent(contentRevision: number, structureRevision: number, ancestryStamp: number, transformRevision: number, root: RenderNode): boolean {
    if (
      this._rootScope === null ||
      this._structureRevision !== structureRevision ||
      this._ancestryStamp !== ancestryStamp ||
      this._transformRevision !== transformRevision
    ) {
      return false;
    }

    if (this._contentRevision === contentRevision) {
      return true;
    }

    const liveEntries = this._liveEntryNodes;
    const tolerable = nodeDirtyIndex.readSince(this._changeCursor, DirtyChannel.Content | DirtyChannel.Tint | DirtyChannel.Effect, (node, marked) => {
      const changed = node as unknown as RenderNode;

      // A mark outside this subtree is another product's; only what lies on or
      // below this root can invalidate its items.
      if (changed !== root && !isUnder(changed, root)) {
        return true;
      }

      return changeBelongsToLiveEntry(changed, root, marked, candidate => liveEntries.has(candidate));
    });

    if (!tolerable) {
      return false;
    }

    this._contentRevision = contentRevision;
    this.noteSettled();

    return true;
  }

  // ---------------------------------------------------------------------------
  // Structure delta
  //
  // A scene that adds and removes nodes used to throw the whole representation
  // away on every such frame: the items are keyed on the structure revision, the
  // build gate wants two consecutive frames that found the subtree unchanged,
  // and a scene churning every frame produces neither. Every such frame fell
  // back to a full collect over every node - which is what made structural churn
  // cost an order of magnitude more than moving the same nodes does.
  //
  // The delta replaces that with a re-discovery of the scopes that actually
  // changed. What survives is what the expensive half is made of: the items of
  // every untouched scope, their spatial indices, the derived membership, and -
  // through the carry map - the backend's per-item GPU rows for every drawable
  // that is still there.
  // ---------------------------------------------------------------------------

  /** Scope owning each container below the root, for resolving a change to a scope. */
  private readonly _scopeOfNode = new Map<RenderNode, SourceScope>();
  /** Every node the source holds as a live entry, across all scopes; see {@link reconcileContent}. */
  private readonly _liveEntryNodes = new Set<RenderNode>();
  /**
   * Mark sequence everything below this root has been accounted for up to.
   *
   * The delta's proof rather than a convenience: the items store world bounds
   * and the backend writes a slot's rows once, when it enters, so a delta may
   * keep either only if every change since this point was inside a scope it
   * re-discovers.
   */
  private _changeCursor = -1;
  /** Previous handle of each new item, or -1; grow-only, reused across deltas. */
  private _carried = new Int32Array(0);

  /**
   * Whether a structure delta could start from the items this source holds.
   *
   * The ancestry stamp has to match exactly. Everything the delta keeps is
   * stored in world space, and an ancestor ABOVE the root moving invalidates
   * those bounds without touching any revision inside the subtree - so a delta
   * across such a move would keep extents that describe where the subtree used
   * to be.
   */
  public canApplyStructureDelta(structureRevision: number, ancestryStamp: number): boolean {
    return (
      this._rootScope !== null &&
      this._structureRevision !== structureRevision &&
      this._ancestryStamp === ancestryStamp &&
      nodeDirtyIndex.covers(this._changeCursor)
    );
  }

  /** The mark sequence a delta has to account for everything after. */
  public get changeCursor(): number {
    return this._changeCursor;
  }

  /**
   * The scope that owns `node` - the nearest enclosing container this source
   * recorded as a scope - or `null` when none of them does.
   *
   * `null` covers two cases the caller treats alike: a node under a different
   * root, and one that has just been detached and so contributes nothing to this
   * frame either way.
   */
  public scopeOfNode(node: SceneNode): SourceScope | null {
    let current: SceneNode | null = node;

    while (current !== null) {
      const scope = this._scopeOfNode.get(current as unknown as RenderNode);

      if (scope !== undefined) {
        return scope;
      }

      current = current.parent;
    }

    return null;
  }

  /**
   * Record every item's handle on its drawable and return the epoch that makes
   * those stamps readable, so the re-discovery about to run can be diffed
   * against what is here now.
   *
   * Stamped across the WHOLE source rather than across the scopes being
   * replaced: a scope that keeps its items still has its handles renumbered when
   * a scope before it changes size, and one rule for both is one rule to get
   * right.
   */
  public stampCarry(): number {
    const epoch = ++carryEpoch;

    for (const scope of this._scopes) {
      const drawables = scope.items.drawables;
      const count = scope.items.count;
      const base = scope.handleBase;

      for (let i = 0; i < count; i++) {
        const drawable = drawables[i]!;

        // A producer that emitted several items can carry at most one of them,
        // and picking would be a guess. Poisoned instead, so every item of such
        // a producer re-enters and is written from data this frame produced.
        drawable._sourceCarryHandle = drawable._sourceCarryEpoch === epoch ? -1 : base + i;
        drawable._sourceCarryEpoch = epoch;
      }
    }

    return epoch;
  }

  /**
   * Withdraw the carry of every item that changed since the cursor, so it enters
   * again instead of keeping rows written for what it used to be.
   *
   * Cheap because it is driven by the marks rather than by the items: a scene
   * that churns a few hundred nodes touches a few hundred stamps, not the
   * subtree.
   */
  public dropCarryOfChangedItems(epoch: number): void {
    nodeDirtyIndex.readSince(this._changeCursor, DirtyChannel.Transform | DirtyChannel.Content | DirtyChannel.Tint, marked => {
      const drawable = marked as unknown as Drawable;

      if (drawable._sourceCarryEpoch === epoch) {
        drawable._sourceCarryHandle = -1;
      }

      return true;
    });
  }

  /** Release a subtree the delta is about to replace. */
  public releaseScope(scope: SourceScope): void {
    releaseScopeContents(scope);
  }

  /**
   * Re-key after one or more scopes were re-filled in place, and return the
   * carry map: for every new global handle, the handle the same drawable held
   * before, or -1 when it is new here.
   *
   * The returned array is the source's own and stays valid until the next delta.
   */
  public commitStructureDelta(
    root: RenderNode,
    epoch: number,
    contentRevision: number,
    structureRevision: number,
    ancestryStamp: number,
    transformRevision: number,
  ): Int32Array {
    const scopes: SourceScope[] = [];

    this._itemCount = finalizeSourceScopes(this._rootScope!, scopes, 0);
    this._scopes = scopes;
    this._indexScopesByNode(root);

    if (this._carried.length < this._itemCount) {
      this._carried = new Int32Array(this._itemCount);
    }

    const carried = this._carried;

    for (const scope of scopes) {
      const drawables = scope.items.drawables;
      const count = scope.items.count;
      const base = scope.handleBase;

      for (let i = 0; i < count; i++) {
        const drawable = drawables[i]!;
        const previous = drawable._sourceCarryEpoch === epoch ? drawable._sourceCarryHandle : -1;

        // Consumed on read: a drawable now backing two items must not hand the
        // same GPU row to both.
        drawable._sourceCarryHandle = -1;
        carried[base + i] = previous;
      }
    }

    this._noteKeys(contentRevision, structureRevision, ancestryStamp, transformRevision);

    return carried;
  }

  /**
   * Accept the current mark sequence as accounted for, on a frame that proved
   * nothing below this root changed. Without it a source that stayed usable for
   * longer than the index's window would fail its next delta outright.
   */
  public noteSettled(): void {
    this._changeCursor = nodeDirtyIndex.sequence;
  }

  private _noteKeys(contentRevision: number, structureRevision: number, ancestryStamp: number, transformRevision: number): void {
    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._ancestryStamp = ancestryStamp;
    this._transformRevision = transformRevision;
    this._changeCursor = nodeDirtyIndex.sequence;
  }

  private _indexScopesByNode(root: RenderNode): void {
    const map = this._scopeOfNode;
    const liveEntries = this._liveEntryNodes;

    map.clear();
    liveEntries.clear();

    if (this._rootScope !== null) {
      map.set(root, this._rootScope);
    }

    for (const scope of this._scopes) {
      const node = (scope as { node?: RenderNode }).node;

      if (node !== undefined) {
        map.set(node, scope);
      }

      for (const other of scope.others) {
        if (other.kind === RenderEntryKind.Barrier) {
          liveEntries.add(other.node);
        }
      }
    }
  }
}
