import { GridVisibility, type RenderItemVisibility } from './RenderItemVisibility';
import { finalizeSourceScopes, type SourceScope } from './RenderSourceItem';

/**
 * @internal
 *
 * The persistent, view-INDEPENDENT items of one render root: every drawable in
 * the subtree with its recorded order and world bounds, whether or not it is
 * currently on screen.
 *
 * This is the piece a captured product cannot supply. A capture holds what the
 * camera admitted at capture time, so an item that has since scrolled into view
 * is precisely the one it does not contain — which is why a view change outside
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
 * each other every frame. Contract 5 of the architecture freeze
 * (`.workspace/rendering-optimization-O34-final.md`) requires exactly this.
 *
 * Deliberately carries nothing backend-, view- or frame-bound: no `MaterialKey`
 * (a backend switch invalidates one), no transform row and no `nodeIndex` (both
 * frame-local), and no membership (per view — see {@link DerivedRootProduct}).
 * Those are re-derived when a selection is emitted and belong to the derived
 * product, not here. The root-specific KEYS — view selection and render target —
 * likewise stay in {@link RetainedRootRepresentation} above it, which is what
 * keeps this half describable without a camera.
 *
 * This is a RENDER ROOT's structure and stays one. A `RetainedContainer` was
 * once expected to adopt it; it must not, because the boundary suppresses
 * per-child culling (`RenderNode._collectForRenderPlan`), so a selection inside
 * a transform group can only ever return every item. It would pay the discovery
 * walk, the item store and the index for no selectivity, and trade an
 * O(batches) instruction replay for an O(items) emit. What the two tiers really
 * do share is the layer below — {@link RetainedGroupFragment}'s pooled records
 * and {@link CaptureThrashSuppressor} — and they share it already.
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
   * without touching any revision inside the subtree — which is why
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
   * The alternative — keep the source across a move and read each node's bounds
   * live during the scan — was measured and is a LOSS, badly. A normal collect
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
   * that is left — and a full pass over a million items does not fit in the 8ms
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

  /** Total persistent items across all scopes — the handle space's size. */
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
   * The caller owns the scope tree; the source only keys it. A structure or
   * content change invalidates rather than patches — the incremental channels
   * for those are separate work (`NEU-O47`/`NEU-O49`), and the case this cut
   * exists for is a moving camera over unchanged content.
   */
  public adopt(rootScope: SourceScope, contentRevision: number, structureRevision: number, ancestryStamp: number, transformRevision: number): void {
    const scopes: SourceScope[] = [];

    this._itemCount = finalizeSourceScopes(rootScope, scopes, 0);
    this._rootScope = rootScope;
    this._scopes = scopes;
    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._ancestryStamp = ancestryStamp;
    this._transformRevision = transformRevision;
  }

  /** Drop the items (structure/content changed, or the root was destroyed). */
  public invalidate(): void {
    for (const scope of this._scopes) {
      scope.items.clear();
      scope.index.release();
    }

    this._rootScope = null;
    this._scopes = [];
    this._itemCount = 0;
    this._contentRevision = -1;
    this._structureRevision = -1;
    this._ancestryStamp = -1;
    this._transformRevision = -1;
  }
}
