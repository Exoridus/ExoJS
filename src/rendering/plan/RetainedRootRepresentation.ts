import { Bounds } from '#core/Bounds';
import { type ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { View } from '#rendering/View';

import { DerivedRootProduct } from './DerivedRootProduct';
import { RenderRootSource } from './RenderRootSource';
import type { ScopeEntry } from './RenderScope';
import { RetainedGroupFragment } from './RetainedGroupFragment';
import { reconcileRetainedTransformRows } from './retainedTransformRowPatch';

/** The render target a product was compiled against (backend-owned identity). */
type RenderTargetIdentity = RenderBackend['renderTarget'];

/**
 * The automatic persistent render representation of one **render root** — the
 * node handed to `RenderingContext.render()` / `renderTo()` / `capture()` or
 * to `RenderNode.render()`. Created lazily by the node
 * ({@link RenderNode._retainedRootRepresentation}) and disposed with it.
 *
 * It reuses {@link RetainedGroupFragment} as its derived product (the entry
 * snapshot plus the recorded instruction set) and adds the keys a root needs
 * that a {@link RetainedContainer} deliberately does not:
 *
 * - the subtree's TRANSFORM revision — a plain container has no group matrix and
 *   no row-patch path, so a descendant move re-collects (same rule
 *   {@link RetainedPlanCache} already applies to the per-child skip);
 * - the root's own global-transform stamp — a render root is not a closed
 *   dependency boundary, so an ancestor ABOVE it moving must invalidate even
 *   though it stamps none of the root's revisions;
 * - the backend's render target — compiled products are pass/target-specific;
 * - the view SELECTION (see {@link isClean}) — per-child culling is view
 *   dependent even though the captured records are not.
 *
 * Unlike a `RetainedContainer` this changes no scene-graph semantics: children
 * keep world-space transforms, per-child culling, and their own bounds
 * convention. The representation only decides whether the frame is rebuilt from
 * the scene graph or replayed.
 * @internal
 */
export class RetainedRootRepresentation {
  public readonly fragment = new RetainedGroupFragment();

  private _hasCapture = false;
  private _contentRevision = -1;
  private _structureRevision = -1;
  private _transformRevision = -1;
  private _ancestryStamp = -1;
  private _backend: RenderBackend | null = null;
  private _target: RenderTargetIdentity | null = null;
  private _view: View | null = null;
  private _viewUpdateId = -1;

  /**
   * Whether the capturing collect dropped at least one node on the view test.
   * A capture that culled nothing can be replayed under any view that still
   * contains {@link _keptBounds}; a capture that culled something can only be
   * replayed under a view inside {@link _captureCullRect}, because outside that
   * rect a previously-culled node may have entered the view and no index exists
   * to find it.
   */
  private _culledDuringCapture = true;
  /** Union of the rects the view test compared for every kept, cullable node. */
  private readonly _keptBounds = new Bounds();
  private _keptEmpty = true;
  /**
   * The rect the capturing collect actually culled against — the view rect grown
   * by the capture margin (`RenderPlanBuilder.cullRect`). Every node the capture
   * dropped lies outside it, so any view still INSIDE it selects the same nodes
   * and the product replays unchanged.
   */
  private readonly _captureCullRect = new Rectangle();
  private _hasCaptureCullRect = false;
  /**
   * Whether the capturing collect READ the view — i.e. produced content that is
   * a function of the camera, not merely positioned by it.
   *
   * Such a capture may only be replayed under the very same view. Both view
   * tolerances below reason about the SELECTION of nodes (what a cull test would
   * have dropped), and that reasoning is sound only while each node's recorded
   * draw is what a fresh collect would produce again. A node that rebuilds its
   * geometry from `view.center` breaks that premise: replaying it paints the
   * camera position it was captured at. `ImageLayerNode` and `TileLayerNode` do
   * exactly this, and contract 9 of the architecture freeze reserves the right
   * for any node, which is why this is observed rather than declared.
   */
  private _viewDependentCapture = false;

  /**
   * The persistent items this root can re-select from, or `null` while it has
   * never needed them.
   *
   * Lazily created on purpose: the items are the dominant new memory cost at a
   * large node count (one record per drawable in the WHOLE subtree, on screen or
   * not), and a root whose camera never leaves its capture margin never has a
   * use for them. Only a root that actually re-selects pays for one.
   *
   * Owned here rather than beside the fragment because the source is the
   * backend- and frame-NEUTRAL half: the keys that are not — view selection,
   * render target, backend identity — stay on this class, which is what lets a
   * `RetainedContainer` adopt the same source later instead of growing a third
   * implementation of the same idea.
   */
  private _source: RenderRootSource | null = null;
  /**
   * The view-dependent half of the persistent state: which items this root's
   * camera admits, and the delta against the previous selection.
   *
   * Owned HERE rather than on the source for the same reason the view key is:
   * the source describes what the subtree contains and is valid for any camera,
   * membership is an answer about one. Created together with the first
   * selection, released with the source.
   */
  private _derivedProduct: DerivedRootProduct | null = null;
  /**
   * Consecutive frames that had to rebuild and found the subtree exactly as the
   * rebuild before them left it, plus the keys that streak is measured against.
   *
   * The build gate ({@link shouldBuildSource}). One such frame proves nothing —
   * a camera that stepped once and stopped produces exactly one, and a source
   * built for it is one O(N) walk plus one record per drawable that will never
   * be selected from twice. Two in a row is the signature of a camera moving
   * across a settled scene, which is the case the source exists for.
   *
   * The keys are exactly the source's own, transform included, so a scene that
   * moves something every frame can never produce the streak — and therefore
   * never pays for a source it would have to discard on the next frame anyway.
   * That is the gate's second job, and the more important one: without the
   * transform key, `dynamic-heavy` and `deep-hierarchy` would re-walk their
   * whole subtree on every dirty frame.
   *
   * Deliberately NOT derived from the capture keys: the source is valid
   * independently of whether a capture exists, and a root whose captures are
   * suppressed needs the cheap path more than any other, not less.
   */
  private _rebuildStreak = 0;
  private _streakContent = -1;
  private _streakStructure = -1;
  private _streakAncestry = -1;
  private _streakTransform = -1;
  /**
   * The root producer itself read the view during discovery, so there is no
   * persistable source at any granularity — attribution to the outermost
   * producer covers the entire subtree.
   *
   * Sticky across invalidation: it is a property of what the root node DOES
   * during collect, not of the content it holds, so re-running the walk on the
   * next view change would reach the same conclusion at the same cost.
   */
  private _sourceUnbuildable = false;

  // Thrash suppression over the FULL key (see `shouldSuppressCapture`).
  private _replayedSinceCapture = false;
  private _wastedCaptures = 0;
  private _suppressed = false;
  private _observedContent = -1;
  private _observedStructure = -1;
  private _observedTransform = -1;
  private _observedView: View | null = null;
  private _observedViewUpdateId = -1;

  /**
   * Whether the captured product can be replayed as-is this frame.
   *
   * The revision/identity keys are exact compares. The view key is not, and it
   * has two independent ways to pass, because the captured records — world-space
   * bounds, material keys, baked transform rows — carry no view state of their
   * own (the recorded batches resolve projection live at replay):
   *
   * - **The view still fits the capture's cull rect.** Every node the capture
   *   dropped was outside that rect, hence outside this view too; every node it
   *   kept is still drawn, and any that no longer meets the view is clipped
   *   rather than wrong. This is the case that survives a moving camera over a
   *   scene with off-screen content — the margin exists to make it common.
   * - **Nothing was culled and the view still contains every kept node.** Then
   *   the selection is trivially the whole subtree and stays that way. This one
   *   also covers a view that GREW past the capture rect (a zoom-out), which the
   *   first test cannot.
   */
  public isCleanIgnoringTransform(
    contentRevision: number,
    structureRevision: number,
    ancestryStamp: number,
    view: View,
    backend: RenderBackend,
    target: RenderTargetIdentity | null,
  ): boolean {
    if (!this.matchesNonViewKeys(contentRevision, structureRevision, ancestryStamp, backend, target)) {
      return false;
    }

    if (this._view === view && this._viewUpdateId === view.updateId) {
      return true;
    }

    if (this._viewDependentCapture) {
      // The view moved and the capture is a function of it: neither tolerance
      // applies, because both only argue about which nodes a cull test admits.
      return false;
    }

    if (this._viewFitsCaptureCullRect(view)) {
      return true;
    }

    if (this._culledDuringCapture) {
      return false;
    }

    return this._keptEmpty || view.getBounds().containsRect(this._keptBounds.getRect());
  }

  /**
   * Every key except the view: whether the captured product still describes the
   * same subtree, compiled for the same backend and target.
   *
   * Split out from {@link isCleanIgnoringTransform} because the view key is the
   * only one of the six that is not an exact compare, and reading the exact half
   * on its own is what makes the tolerant half legible.
   */
  public matchesNonViewKeys(
    contentRevision: number,
    structureRevision: number,
    ancestryStamp: number,
    backend: RenderBackend,
    target: RenderTargetIdentity | null,
  ): boolean {
    return (
      this._hasCapture &&
      this._contentRevision === contentRevision &&
      this._structureRevision === structureRevision &&
      this._ancestryStamp === ancestryStamp &&
      this._backend === backend &&
      this._target === target
    );
  }

  /** The persistent items, or `null` while this root has never built any. */
  public get source(): RenderRootSource | null {
    return this._source;
  }

  /** The persistent items, created on first use. */
  public ensureSource(): RenderRootSource {
    return (this._source ??= new RenderRootSource());
  }

  /** This root's membership state, or `null` while it has never selected. */
  public get derivedProduct(): DerivedRootProduct | null {
    return this._derivedProduct;
  }

  /** This root's membership state, created on first use. */
  public ensureDerivedProduct(): DerivedRootProduct {
    return (this._derivedProduct ??= new DerivedRootProduct());
  }

  /** Fold one rebuild frame into the build gate (see {@link _rebuildStreak}). */
  public noteRebuildKeys(contentRevision: number, structureRevision: number, ancestryStamp: number, transformRevision: number): void {
    const same =
      this._streakContent === contentRevision &&
      this._streakStructure === structureRevision &&
      this._streakAncestry === ancestryStamp &&
      this._streakTransform === transformRevision;

    this._rebuildStreak = same ? this._rebuildStreak + 1 : 0;
    this._streakContent = contentRevision;
    this._streakStructure = structureRevision;
    this._streakAncestry = ancestryStamp;
    this._streakTransform = transformRevision;
  }

  /** Whether a missing source is worth one culling-free discovery walk now. */
  public shouldBuildSource(): boolean {
    return !this._sourceUnbuildable && this._rebuildStreak >= 1;
  }

  /** Discovery found the ROOT itself view-dependent (see {@link _sourceUnbuildable}). */
  public markSourceUnbuildable(): void {
    this._sourceUnbuildable = true;
  }

  /** Whether this view lies entirely inside the rect the capture culled against. */
  private _viewFitsCaptureCullRect(view: View): boolean {
    return this._hasCaptureCullRect && this._captureCullRect.containsRect(view.getBounds());
  }

  /**
   * Settle the transform channel for a frame whose other keys already match:
   * `true` means the product may be replayed, `false` that the frame must
   * re-collect.
   *
   * Transform-only descendant moves are the one change class that does NOT
   * invalidate here. The moved nodes arrive through the same seam a
   * {@link RetainedContainer} uses, and their baked rows are patched in place
   * (O(k)) rather than re-derived — which is what keeps a scene with a few
   * percent of moving nodes on the recorded tier.
   *
   * The queue is fed from a live capture onward, one tier earlier than a group's
   * — a group only needs it on the recorded tier, whereas the root needs the
   * queue as its PROOF that every move was accounted for. Without that proof one
   * frame earlier, a scene that moves something every frame would never reach the
   * clean frame it has to record on.
   *
   * The guards that make that sound against per-child view culling — which a
   * group does not have to face, since it suppresses culling inside itself and
   * is culled as a whole — live in {@link _canReconcileMovedNodes}.
   */
  public reconcileTransform(transformRevision: number, view: View, backend: RenderBackend): boolean {
    if (!this.fragment.hasDirtyTransformRows()) {
      // Nothing queued. Either nothing moved (revisions agree), or a move
      // happened while no recording was live — the enqueue gate skips those, so
      // there is no proof the queue saw everything and the frame re-collects.
      return this._transformRevision === transformRevision;
    }

    if (!this._canReconcileMovedNodes(view)) {
      this._dropRecording();

      return false;
    }

    if (!reconcileRetainedTransformRows(this.fragment, backend, () => true)) {
      return false;
    }

    this._transformRevision = transformRevision;

    return true;
  }

  /**
   * Whether every queued move can be applied to the captured product, growing
   * the kept-union by each moved node's CURRENT cull rect on the way.
   *
   * Two rejections, one per direction a move can break the selection:
   *
   * - **A moved node the capture never recorded, on a capture that culled.** It
   *   is not in the product, so it may be one of the culled ones — and it may
   *   have just moved INTO the view, which replay would silently omit. Patching
   *   cannot help: there is no row to patch. (On the recorded tier the row patch
   *   would catch this too, but the entry-replay tier has no such check, and
   *   this must hold on both.) When the capture culled nothing, every visible
   *   node is in the product and no such node exists.
   * - **A moved node that left the view, when only the kept-union rule is
   *   carrying validity.** Replaying would keep drawing it where a real collect
   *   would have dropped it — which matters because that rule's whole premise is
   *   that nothing was culled. Under the capture-rect rule the premise is
   *   different and this cannot go wrong: an out-of-view node that is still
   *   drawn is clipped, not wrong.
   */
  private _canReconcileMovedNodes(view: View): boolean {
    const viewRect = view.getBounds();
    const insideCaptureRect = this._viewFitsCaptureCullRect(view);

    for (const node of this.fragment.dirtyTransformRows) {
      if (this._culledDuringCapture && this.fragment.recordedDraw(node as unknown as Drawable) === undefined) {
        return false;
      }

      if (!node.cullable) {
        // Never culled: its position cannot change the selection.
        continue;
      }

      const rect = node.cullArea ?? node.getBounds();

      if (!insideCaptureRect && !viewRect.intersectsWith(rect)) {
        return false;
      }

      this._keptBounds.addRect(rect);
      this._keptEmpty = false;
    }

    return true;
  }

  /**
   * Give up the recorded tier without giving up the capture: the queue is
   * drained so no stale row survives, and dropping the recording closes the
   * enqueue gate so nothing accumulates until the next collect re-records.
   */
  private _dropRecording(): void {
    this.fragment.instructions?.invalidate();
    this.fragment.clearDirtyTransformRows();
  }

  /** The active capture was replayed at least once — it earned its keep. */
  public markReplayed(): void {
    this._replayedSinceCapture = true;
    this.fragment.markReplayed();
  }

  /**
   * Decide, on a frame whose key check already failed, whether the snapshot
   * should be skipped. Mutates the suppression state machine; call exactly once
   * per such frame, before collecting. Returns `true` to skip the capture.
   *
   * Same shape as {@link RetainedGroupFragment.shouldSuppressCapture} but keyed
   * on the FULL root key including the view: without the view in the observed
   * tuple, a panning camera over a partly-culled scene would alternate between
   * suppressed and recovered forever instead of settling.
   */
  public shouldSuppressCapture(contentRevision: number, structureRevision: number, transformRevision: number, view: View): boolean {
    if (this._hasCapture) {
      if (this._replayedSinceCapture) {
        this._wastedCaptures = 0;

        return false;
      }

      this._wastedCaptures++;

      if (this._wastedCaptures < 2) {
        // Grace: a single wasted capture recaptures immediately (the expected
        // behaviour for a one-shot mutation).
        return false;
      }

      this.invalidate();
      this._suppressed = true;
      this._observe(contentRevision, structureRevision, transformRevision, view);

      return true;
    }

    if (this._suppressed) {
      if (
        this._observedContent === contentRevision &&
        this._observedStructure === structureRevision &&
        this._observedTransform === transformRevision &&
        this._observedView === view &&
        this._observedViewUpdateId === view.updateId
      ) {
        // The key stopped moving: this frame would have been clean if a capture
        // existed. Recover the retained tier now.
        this._suppressed = false;

        return false;
      }

      this._observe(contentRevision, structureRevision, transformRevision, view);

      return true;
    }

    return false;
  }

  /**
   * Arm cull-union accumulation for the collect that is about to run, and record
   * the rect that collect will cull against — the view's rect plus the capture
   * margin, which is what later lets a moved view be judged in O(1).
   */
  public beginCapture(cullRect: ReadonlyRectangle): void {
    this._keptBounds.reset();
    this._keptEmpty = true;
    this._culledDuringCapture = false;
    this._viewDependentCapture = false;
    this._captureCullRect.set(cullRect.x, cullRect.y, cullRect.width, cullRect.height);
    this._hasCaptureCullRect = true;
  }

  /**
   * The collect being captured read the view (see {@link _viewDependentCapture}).
   * Called from `RenderPlanBuilder`'s public view getter, so it fires for any
   * node — engine or third-party — without one having to declare itself.
   */
  public noteViewRead(): void {
    this._viewDependentCapture = true;
  }

  /** A node passed the view test; `rect` is exactly what `inView` compared. */
  public noteKept(rect: ReadonlyRectangle): void {
    this._keptBounds.addRect(rect);
    this._keptEmpty = false;
  }

  /**
   * {@link noteKept} for a caller that holds the compared extent as four numbers
   * rather than a rectangle — the source selection, whose items store it that
   * way. Materialising a `Rectangle` per item just to hand it over would cost
   * more than the fold.
   */
  public noteKeptCoords(minX: number, minY: number, maxX: number, maxY: number): void {
    this._keptBounds.addCoords(minX, minY).addCoords(maxX, maxY);
    this._keptEmpty = false;
  }

  /** A node was dropped by the view test — the capture is view-locked. */
  public noteCulled(): void {
    this._culledDuringCapture = true;
  }

  /** Snapshot the root scope's entries and key the capture. */
  public commitCapture(
    contentRevision: number,
    structureRevision: number,
    transformRevision: number,
    ancestryStamp: number,
    view: View,
    backend: RenderBackend,
    target: RenderTargetIdentity | null,
    entries: readonly ScopeEntry[],
  ): void {
    // `true`: nested transform groups are recorded as live re-dispatches, so a
    // `RetainedContainer` under a render root keeps its own retention tier
    // untouched (see the snapshot policy in `RetainedGroupFragment`).
    this.fragment.capture(contentRevision, structureRevision, backend, entries, true);

    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._transformRevision = transformRevision;
    this._ancestryStamp = ancestryStamp;
    this._view = view;
    this._viewUpdateId = view.updateId;
    this._backend = backend;
    this._target = target;
    this._hasCapture = true;
    this._replayedSinceCapture = false;
  }

  /**
   * Drop the capture and its recording; the GPU bundle is kept (grow-only).
   *
   * The SOURCE deliberately survives. It is keyed on the node's own revisions
   * and validates itself, so it stays correct across anything that invalidates a
   * capture — and the loudest caller here is capture suppression, where the
   * frame that just lost its capture is exactly the one that most needs a cheap
   * path to fall back to.
   */
  public invalidate(): void {
    this.fragment.invalidate();
    this._hasCapture = false;
    this._replayedSinceCapture = false;
    this._wastedCaptures = 0;
    this._suppressed = false;
    this._keptBounds.reset();
    this._keptEmpty = true;
    this._culledDuringCapture = true;
    this._viewDependentCapture = false;
    this._hasCaptureCullRect = false;
    this._view = null;
    this._backend = null;
    this._target = null;
  }

  /** Release the capture AND the retained GPU resources (node destroy). */
  public dispose(): void {
    this.invalidate();
    this.fragment.dispose();
    this._source?.invalidate();
    this._source = null;
    this._derivedProduct?.release();
    this._derivedProduct = null;
    this._sourceUnbuildable = false;
    this._keptBounds.destroy();
  }

  private _observe(contentRevision: number, structureRevision: number, transformRevision: number, view: View): void {
    this._observedContent = contentRevision;
    this._observedStructure = structureRevision;
    this._observedTransform = transformRevision;
    this._observedView = view;
    this._observedViewUpdateId = view.updateId;
  }
}
