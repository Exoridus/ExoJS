import { Bounds } from '#core/Bounds';
import { logger } from '#core/logging';
import { nextNodeRevision } from '#core/NodeRevision';
import { registerTransformGroupBoundary, unregisterTransformGroupBoundary } from '#core/SceneNode';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderBackend } from '#rendering/RenderBackend';

import { Container } from './Container';
import type { Drawable } from './Drawable';
import { PixelSnapMode } from './pixelSnap';
import type { RetainedGroupBundle } from './plan/RetainedInstructionSet';
import type { RenderNode } from './RenderNode';
import { packTransformRow, TRANSFORM_FLOATS_PER_ROW } from './TransformBuffer';

/**
 * A backend exposing a renderer registry, structurally — the same narrow
 * shape `drawCommandUsesSharedTransform` (`plan/RenderCommand.ts`) resolves
 * through, so both call sites agree on what "the renderer for this drawable"
 * means without a hard dependency between the two modules.
 */
interface BackendWithRendererRegistry {
  readonly rendererRegistry?: {
    resolve(drawable: Drawable): unknown;
  };
}

/**
 * Optional per-renderer escape hatch from the generic shared-`TransformBuffer`
 * row patch (`RetainedGroupBundle._patchTransformRow`): a renderer that packs
 * its own private per-node data (`_consumesSharedTransform === false`, e.g.
 * Text — its row format and storage differ from the shared buffer's) implements
 * this instead, patching whatever it owns directly. `base` is the same
 * capture-frame direct-draw base {@link RetainedContainer._tryPatchTransformRow}
 * already computes for the generic path; a renderer whose own indexing scheme
 * doesn't use it is free to ignore the parameter. Returns `false` when the
 * node isn't fast-patch-eligible (mirrors the generic path's own eligibility
 * guards), which drops the recording and falls back to a full re-record —
 * never wrong pixels, only a missed optimization.
 *
 * Renderer-agnostic by design: a WebGL2 implementation of the same renderer
 * (CPU-side vertex re-bake instead of a GPU buffer write) satisfies this exact
 * interface unchanged.
 * @internal
 */
export interface OwnTransformRowPatcher {
  _patchOwnTransformRow(node: RenderNode, bundle: RetainedGroupBundle, base: number): boolean;
}

const hasOwnTransformRowPatch = (renderer: unknown): renderer is OwnTransformRowPatcher =>
  typeof (renderer as { _patchOwnTransformRow?: unknown } | null)?._patchOwnTransformRow === 'function';

/**
 * Reused scratch for one patched transform row (3 rgba32f texels, the
 * {@link TransformBuffer} layout). Filled and consumed synchronously inside a
 * single patch call, so one module-level buffer is safe and allocation-free
 * under churn.
 */
const patchRowScratch = new Float32Array(TRANSFORM_FLOATS_PER_ROW);

/**
 * A {@link RetainedGroupBundle} with its optional `_patchTransformRow` capability
 * confirmed present. Exists so the runtime guard in {@link RetainedContainer._reconcileTransformRows}
 * only has to establish this once; the narrowing then carries through the
 * type system into {@link RetainedContainer._tryPatchTransformRow} instead of a
 * blind non-null assertion at the call site.
 */
type PatchableRetainedGroupBundle = RetainedGroupBundle & { _patchTransformRow: NonNullable<RetainedGroupBundle['_patchTransformRow']> };

/** Observation window for the S2-D1 retention diagnostic, in fragment builds (~frames). */
const retainedDiagnosticWindow = 120;
/** Invalidated builds within one window that trigger the warning (90% — "effectively every frame"). */
const retainedDiagnosticThreshold = 108;

/**
 * A {@link Container} that declares its subtree "mostly static and/or moves
 * as a whole" (Track B Wave 4). While the subtree is unchanged, its whole
 * previously-collected command range is spliced into the render plan — no
 * walk, no per-child culling, no material keys — and moving the container
 * (or the camera) changes only one per-group GPU matrix instead of touching
 * every descendant.
 *
 * Opt-in at construction; there is no runtime toggle (S2-D1). The existing
 * revision contract ({@link RenderNode.invalidateContent} and the automatic
 * bumps on built-in mutation paths) is the entire authoring surface: any
 * mutation inside the subtree drops the retained fragment for one frame.
 *
 * Trade-offs of the group-local space convention (spec §5/§6): descendants
 * resolve group-relative transforms, so hit-testing/`getBounds()` inside the
 * group are group-local; per-child view culling is disabled inside the group
 * (the group is culled as a whole); particle-extension drawables bake their own
 * transforms and are not group-transform-aware. `pixelSnapMode` IS group-aware —
 * the renderer composes the group matrix in before snapping, so a snapped node
 * inside a translated/scaled group still lands on the device-pixel grid. Group-wide fades are done
 * per-drawable tint (the engine has no inherited alpha) or via
 * {@link RenderNode.cacheAsBitmap}. Nodes with filters/mask/clip/
 * cacheAsBitmap are supported as DIRECT children (they stay world-space and
 * re-collect every frame); nesting one deeper pushes ONLY the direct child
 * branch containing it out of the group (F13/R3) — that sub-branch renders
 * world-space and re-collects every frame like a direct barrier child, while
 * retention and the group transform stay active for the rest of the group —
 * and warns once in dev builds. Note that any escaped branch keeps the
 * group's fragment off the recorded-instruction tier (barrier entries are
 * not batch-recordable, S3-D5); the group stays on entry replay.
 *
 * World-space queries against nodes inside the group (picking, spatial
 * audio, physics, cross-group math) go through
 * {@link SceneNode.getWorldTransform}, which composes through the boundary
 * and returns the true world matrix.
 *
 * @advanced
 * @example
 * ```ts
 * const world = new RetainedContainer(); // large static tilemap decor
 * world.addChild(...thousandsOfSprites);
 * scene.root.addChild(world);
 * world.setPosition(-cameraX, -cameraY); // one matrix update per frame
 * ```
 */
export class RetainedContainer extends Container {
  private readonly _fragment = new RetainedGroupFragment();
  private _groupVersion = 0;
  private _devFragmentBuilds = 0;
  private _devFragmentInvalidations = 0;
  private _devRetentionWarned = false;
  private _devDestroyedWarned = false;

  public constructor() {
    super();
    // Arm the Slice-4b transform-move seam: while at least one boundary is live,
    // own-transform mutations walk to their enclosing group (see SceneNode's
    // transformGroupBoundaryCount). Balanced by destroy().
    registerTransformGroupBoundary();
  }

  /**
   * The boundary is ALWAYS engaged (F13/R3 superseded the whole-group
   * deep-barrier disengage of plan D-P4 Option A): a deep barrier now pushes
   * only its own direct-child branch out of the group via
   * {@link _childEscapesTransformGroup}, and affected descendants pick a flip
   * up lazily through the getGlobalTransform parent-version seam.
   * @internal
   */
  public override get _isTransformGroupBoundary(): boolean {
    return true;
  }

  /**
   * Monotonic stamp of the container's own transform mutations (spec §4.3).
   * The retained fragment does not key on it — the group matrix is read live
   * at playback — but diagnostics and tests observe decoupling through it.
   * @internal
   */
  public get _groupMatrixVersion(): number {
    return this._groupVersion;
  }

  /**
   * Own-transform mutations move the whole group: bump the group-matrix
   * version and refresh ancestor bounds flags (the group's world AABB
   * moved), but do NOT content-dirty the fragment — that decoupling is the
   * entire point of the retained tier (spec §4.3).
   */
  protected override _markOwnTransformDirty(): void {
    this._groupVersion = nextNodeRevision();
    this._invalidateBoundsFlags();

    // The whole group moved: anchored interactive descendants are hit-tested
    // live, but world-space (escaped) ones are indexed in the world quadtree
    // with bounds captured at insert time and must be re-indexed. The manager
    // resolves exactly that set in O(1) (no-op when the group has none).
    this._getStage()?.interaction._notifyTransformGroupMoved(this);
  }

  /**
   * Slice 4b seam: a descendant's own transform moved. Queue its row on the
   * fragment; {@link _collectContent} patches the queued rows in place on a
   * content/structure-clean frame instead of re-collecting. The group's OWN
   * move does not route here — {@link _markOwnTransformDirty} above handles it
   * as a one-matrix group move.
   *
   * Gated on a live committed recording (F4): only the recorded-instruction
   * tier ever consumes a queued row. On every tier without one — entry
   * replay, and a recording-less group (e.g. an escaped-branch group, whose
   * `_fragment.dispose()` drops any recording) — transforms are re-read live
   * and {@link _reconcileTransformRows} would just drain the queue unread on
   * the next collect. Skipping the enqueue there is free: nothing else
   * observes the queue between now and that drain. (A recording backend
   * lacking patch support, e.g. pre-4c WebGPU, DOES still enqueue here —
   * `hasRecording` is true — and {@link _reconcileTransformRows} is the one
   * that drops the recording and falls back to entry replay.)
   */
  public override _enqueueDirtyTransformRow(node: RenderNode): void {
    if (this._fragment.instructions?.hasRecording !== true) {
      return;
    }

    this._fragment.enqueueDirtyTransformRow(node);
  }

  // ── F12: group-local bounds aggregate cache ─────────────────────────────
  // The group-local child aggregate only changes when the SUBTREE changes,
  // which the content/structure revisions already key exactly — a group move
  // (camera pan, every frame) only changes the lift matrix. Cache the
  // aggregate and pay O(1) per move instead of O(children).
  private readonly _groupAggregate = new Bounds();
  /**
   * Direct children whose rects must be re-read on EVERY updateBounds because
   * their bounds move without bumping this container's revisions: barrier
   * children are world-space and follow world ancestors; nested transform
   * groups decouple their own moves from the content revision (spec §4.3).
   * Membership is revision-keyed: effect toggles and reparenting bump
   * content/structure, so the list rebuilds exactly when it can change.
   */
  private readonly _liveBoundsChildren: RenderNode[] = [];
  private _aggregateContentRevision = -1;
  private _aggregateStructureRevision = -1;
  private _aggregateTransformRevision = -1;

  /**
   * World AABB of the group: children aggregate in group-local space, so
   * the aggregate rect is lifted by the group's own world matrix (spec §6 —
   * group-local aggregate × group matrix). Barrier-bearing direct children
   * escape the group convention (plan D-P4) and are already world-space.
   *
   * The group-local aggregate is served from a revision-keyed cache (F12);
   * under a rotated group the lifted AABB of the cached union is a slightly
   * looser (still conservative) cover than per-child lifting — fine for the
   * culling/hit-prefilter consumers of container bounds.
   */
  public override updateBounds(): this {
    // Escape membership feeds the live-children split below; refresh it first
    // (revision-keyed, O(1) when the subtree is unchanged).
    this._refreshBranchEscapes();

    const world = this.getGlobalTransform();

    // Single read each: `_contentRevision`/`_structureRevision`/`_transformRevision`
    // are side-effecting getters (they advance the dirty-walk epoch, see
    // SceneNode), so reading each twice here would double that bump for no
    // reason.
    const contentRevision = this._contentRevision;
    const structureRevision = this._structureRevision;
    const transformRevision = this._transformRevision;

    // Keyed on the transform channel too (Slice 4b): a descendant transform-only
    // move changes its group-local rect but no longer stamps content (the 4b
    // flip), so without the transform key the cached aggregate would go stale.
    if (
      this._aggregateContentRevision !== contentRevision ||
      this._aggregateStructureRevision !== structureRevision ||
      this._aggregateTransformRevision !== transformRevision
    ) {
      this._rebuildGroupAggregate();
      this._aggregateContentRevision = contentRevision;
      this._aggregateStructureRevision = structureRevision;
      this._aggregateTransformRevision = transformRevision;
    }

    this._bounds.reset().addRect(this._groupAggregate.getRect(), world);

    // Index loop, no iterator allocation: this runs on every group move.
    for (let index = 0; index < this._liveBoundsChildren.length; index++) {
      const child = this._liveBoundsChildren[index]!;

      if (child._renderPlanHasBarrierEffects() || this._escapedBranches.has(child)) {
        // World-space escape (own barrier, or a deep-barrier branch): no lift.
        this._bounds.addRect(child.getBounds());
      } else {
        // Nested transform group: group-local rect, lift like the aggregate.
        this._bounds.addRect(child.getBounds(), world);
      }
    }

    return this;
  }

  /** Rebuild the cached group-local aggregate + the live-children list (see the F12 block comment). */
  private _rebuildGroupAggregate(): void {
    this._groupAggregate.reset().addRect(this.getLocalBounds());
    this._liveBoundsChildren.length = 0;

    for (let index = 0; index < this._children.length; index++) {
      const child = this._children[index]!;

      if (!child.visible) {
        continue;
      }

      // Escaped branches are world-space: they follow the container's own
      // moves, which bump no revision — like barrier children they must be
      // re-read live. Nested groups decouple their own moves the same way.
      if (child._renderPlanHasBarrierEffects() || this._escapedBranches.has(child) || child instanceof RetainedContainer || child._isTransformGroupBoundary) {
        this._liveBoundsChildren.push(child);
      } else {
        this._groupAggregate.addRect(child.getBounds());
      }
    }
  }

  /** @internal */
  protected override _collectContent(builder: RenderPlanBuilder): void {
    if (this._children.length === 0) {
      return;
    }

    const fragmentClean = this._fragment.isClean(this._contentRevision, this._structureRevision, builder.backend);

    if (fragmentClean && __DEV__ && this._fragment._devHasDestroyedDrawable()) {
      // P3f: a descendant was destroy()ed but left attached, so no revision
      // bumped and the capture still looks clean. Replaying it would splice a
      // dead drawable for a whole frame and pin it against GC. Drop the capture
      // (releasing the strong refs), warn once, and fall through to a full
      // collect — which skips the destroyed child (RenderNode._collect dev
      // guard) and recaptures a clean fragment.
      this._fragment.invalidate();
      this._warnReplayedDestroyed();
    } else if (fragmentClean) {
      // Slice 4b: a content/structure-clean frame may still carry transform-only
      // descendant moves (the flip: an own-transform move no longer content-
      // dirties). The recorded instruction set's baked transform rows are stale
      // for those nodes — patch the changed rows in place (O(k)), or drop the
      // recording so entry replay re-reads live transforms this frame.
      if (this._fragment.hasDirtyTransformRows()) {
        this._reconcileTransformRows(builder.backend);
      }

      // Fast tier (Slice 3, S3-D2): a valid recorded instruction set splices
      // as an EMPTY scope — the player replays O(batches), the optimizer sees
      // nothing. Falls through the ladder: instruction replay -> entry replay
      // (Slice 2) -> plain collect; every gate failure degrades to today's
      // correct behavior, never to wrong pixels.
      const set = this._fragment.instructions;

      if (set !== null && builder._markCurrentScopeRetained(set)) {
        this._fragment.markReplayed();

        if (__DEV__) {
          this._trackRetention(false);
        }

        return;
      }

      // The whole-range splice (spec §4.2): no walk, no cull, no material
      // keys. The key deliberately omits View.updateId (group-level culling
      // makes the fragment view-independent — the camera-pan win) and the
      // container's own transform (a move only changes the group matrix).
      builder._replayRetainedFragment(this._fragment.entries);
      this._fragment.markReplayed();
      // Record-on-first-clean-frame (S3-D8 composition): this clean playback
      // is the recording source; the player captures it if the backend
      // implements the hooks and the fragment is recordable (S3-D5).
      builder._armRetainedRecord(this._fragment);

      if (__DEV__) {
        this._trackRetention(false);
      }

      return;
    }

    // For the S2-D1 diagnostic, a dirty build "invalidates" whenever prior
    // retention state existed — a live capture OR an active suppression
    // window (F11b) — so per-frame thrash keeps counting as invalidation
    // even while suppressed frames no longer carry a capture.
    const invalidated = this._fragment.hasCapture || this._fragment.captureSuppressed;
    // Thrash suppression (Slice 3, F11b): when the previous captures were
    // never replayed, this dirty frame skips the snapshot entirely and pays
    // only the plain collect.
    const suppressCapture = this._fragment.shouldSuppressCapture(this._contentRevision, this._structureRevision);

    for (let index = 0; index < this._children.length; index++) {
      // In-bounds: index < length.
      this._children[index]!._collect(builder, index);
    }

    if (__DEV__) {
      this._trackRetention(invalidated);
    }

    if (!suppressCapture) {
      this._fragment.capture(this._contentRevision, this._structureRevision, builder.backend, builder._peekCurrentScopeEntries());
    }
  }

  /**
   * Slice 4b: reconcile the queued transform-only moves against the recorded
   * instruction set before replay. On the recorded tier the transforms are
   * baked into the group-owned store, so each moved DIRECT drawable child's row
   * is patched in place (O(k) rows + one sub-range upload). Any ineligible move
   * (nested below a sub-container, pixel-snapped, or not a recorded direct draw)
   * drops the recording, so this frame entry-replays with live transforms and
   * re-records — correct, O(entries), the rare fallback. On the entry-replay
   * tier there is nothing to reconcile (transforms are re-read live); the queue
   * is simply drained.
   */
  private _reconcileTransformRows(backend: RenderBackend): void {
    const set = this._fragment.instructions;
    const bundle = set?.ownedBundle ?? null;

    if (set === null || !set.hasRecording || bundle === null || typeof bundle._patchTransformRow !== 'function' || bundle.transformRowBase === undefined) {
      // The set holds a recording whose baked transform rows we cannot patch
      // (a backend without row-patch support — e.g. WebGPU before slice 4c),
      // yet a transform-only move must still take effect. Drop the recording so
      // `_markCurrentScopeRetained` fails validation and the group falls to
      // entry replay (live transforms) + re-record this frame. Without this the
      // group keeps splicing the stale rows and the moved node renders frozen.
      if (set?.hasRecording) {
        set.invalidate();
      }

      this._fragment.clearDirtyTransformRows();

      return;
    }

    // The group-local row origin is the fragment's CAPTURE-frame (F1) minimum
    // draw index — NOT `bundle.transformRowBase` (the record-frame F2 rebase
    // base). The two frames can start the group at different absolute rows, and
    // the store rows are group-local, so only the F1 subtree base maps a
    // captured index to its store row (see directDrawBaseNodeIndex).
    const base = this._fragment.directDrawBaseNodeIndex();
    // The guard above already confirmed `_patchTransformRow` is present; carry
    // that guarantee into the callee's parameter type instead of asserting
    // blind at the call site inside it. Calling through `patchableBundle`
    // (rather than a detached function reference) keeps the method's `this`
    // bound to the bundle instance.
    const patchableBundle: PatchableRetainedGroupBundle = bundle as PatchableRetainedGroupBundle;

    for (const node of this._fragment.dirtyTransformRows) {
      if (!this._tryPatchTransformRow(node, backend, patchableBundle, base)) {
        // Ineligible: drop the baked recording. `_markCurrentScopeRetained`
        // will now fail its validity check, so the group falls to entry replay
        // (live transforms) and re-records this frame.
        set.invalidate();
        break;
      }
    }

    this._fragment.clearDirtyTransformRows();
  }

  /**
   * Patch one moved node's group-local transform row, or return `false` when it
   * is not fast-patch-eligible (spec §3 eligibility). Eligible: a direct
   * drawable child, non-snapped, present in the recorded row map. The
   * group-local matrix is `getGlobalTransform()` composed to this boundary — the
   * exact value the recorder wrote (S3-D4).
   *
   * A renderer that opts out of the shared `TransformBuffer` (its resolved
   * renderer exposes {@link OwnTransformRowPatcher}, e.g. Text) is dispatched
   * to its OWN patch method instead of the generic `bundle._patchTransformRow`
   * below — its row lives in a private, renderer-owned store the generic path
   * never reads, so calling the generic patch there would silently no-op
   * against bytes nobody consumes (stale pixels, not a caught failure).
   */
  private _tryPatchTransformRow(node: RenderNode, backend: RenderBackend, bundle: PatchableRetainedGroupBundle, base: number): boolean {
    if (node.parent !== this) {
      return false;
    }

    const drawable = node as unknown as Drawable;
    const registry = (backend as BackendWithRendererRegistry).rendererRegistry;

    if (registry && typeof registry.resolve === 'function') {
      try {
        const renderer = registry.resolve(drawable);

        if (hasOwnTransformRowPatch(renderer)) {
          return renderer._patchOwnTransformRow(node, bundle, base);
        }
      } catch {
        // No renderer registered for this drawable (custom drawable type) —
        // fall through to the generic shared-transform patch path below,
        // unchanged from before this dispatch existed.
      }
    }

    const nodeIndex = this._fragment.directDrawNodeIndex(drawable);

    // Snapped nodes are excluded from recording (their instance words are
    // view-dependent), so a recorded direct child is never snapped — but guard
    // belt-and-braces: an ineligible node drops to the re-record fallback.
    if (nodeIndex === undefined || drawable.pixelSnapMode !== PixelSnapMode.None) {
      return false;
    }

    packTransformRow(patchRowScratch, 0, node.getGlobalTransform(), drawable.tint, drawable.pixelSnapMode);
    bundle._patchTransformRow(nodeIndex - base, patchRowScratch);

    return true;
  }

  /**
   * Release the retained GPU instruction set and fragment cache, then destroy
   * this container and its subtree.
   *
   * Beware the in-place-destroy footgun: {@link SceneNode.destroy} does not
   * detach a node from its parent, and the retained fragment keeps the whole
   * previously-collected command range — including a child's resources — until
   * a structural change drops it. Destroying a child directly leaves the
   * fragment replaying freed resources, because nothing invalidated it. Call
   * {@link Container.removeChild} first (removal bumps the structure revision
   * and drops the fragment), or destroy the whole group at once.
   */
  public override destroy(): void {
    // Balance the constructor's boundary registration exactly once (destroy may
    // be called more than once; `destroyed` flips only on the first super call).
    if (!this.destroyed) {
      unregisterTransformGroupBoundary();
    }

    // dispose(): invalidates AND releases the retained GPU bundle (Slice 3, S3-D3).
    this._fragment.dispose();
    this._groupAggregate.destroy();
    this._liveBoundsChildren.length = 0;
    this._escapedBranches.clear();

    super.destroy();
  }

  /**
   * S2-D1 dev diagnostic: count fragment builds vs invalidations over a
   * tumbling window and warn ONCE when this container invalidates on
   * effectively every frame — the retention is pure overhead there (the
   * reference's retained arm measured 1.5x slower than immediate mode on
   * fully-dynamic content). Dev builds only; stripped from production via
   * the __DEV__ guard at the call sites.
   */
  private _trackRetention(invalidated: boolean): void {
    if (this._devRetentionWarned) {
      return;
    }

    this._devFragmentBuilds++;

    if (invalidated) {
      this._devFragmentInvalidations++;
    }

    if (this._devFragmentBuilds < retainedDiagnosticWindow) {
      return;
    }

    if (this._devFragmentInvalidations >= retainedDiagnosticThreshold) {
      this._devRetentionWarned = true;
      logger.warn(
        `RetainedContainer${this.name ? ` '${this.name}'` : ''} invalidated its retained fragment on ` +
          `${this._devFragmentInvalidations} of the last ${this._devFragmentBuilds} frames — the retention is pure ` +
          `overhead here. Remove the RetainedContainer boundary or split the dynamic children out of the group.`,
        { source: 'rendering' },
      );
    }

    this._devFragmentBuilds = 0;
    this._devFragmentInvalidations = 0;
  }

  private _escapeCheckContent = -1;
  private _escapeCheckStructure = -1;

  /**
   * P3f dev diagnostic: warn ONCE when the retained fragment was found holding
   * a child that was `destroy()`ed without `removeChild()` (so it stayed
   * attached and the capture still looked clean). Dev builds only; the call
   * site is `__DEV__`-guarded and stripped from production.
   */
  private _warnReplayedDestroyed(): void {
    if (this._devDestroyedWarned) {
      return;
    }

    this._devDestroyedWarned = true;
    logger.warn(
      `RetainedContainer${this.name ? ` '${this.name}'` : ''} held a child that was destroy()ed without ` +
        'removeChild() — it stayed attached to the subtree, so no revision change dropped the retained fragment. ' +
        'The stale capture has been evicted and the destroyed child skipped; detach children (removeChild) before ' +
        'or instead of destroying them.',
      { source: 'rendering' },
    );
  }
  private _deepBarrierWarned = false;
  /**
   * Direct children whose subtrees contain a deep barrier (F13/R3): they
   * escape the group — world-space transforms, effect-less barrier wrap at
   * collect, live re-dispatch on fragment replay — while their siblings keep
   * retention and the group transform. Membership is revision-keyed by
   * {@link _refreshBranchEscapes}.
   */
  private readonly _escapedBranches = new Set<RenderNode>();

  /** @internal */
  public override _collect(builder: RenderPlanBuilder, seq?: number): void {
    // Re-evaluate branch escapes BEFORE culling/bounds run, so an escape
    // flip never mixes spaces within one frame (plan D-P4). Skipped entirely
    // while the subtree revisions are unchanged.
    this._refreshBranchEscapes();
    super._collect(builder, seq);
  }

  /**
   * @internal — the transform-seam and collect-time query for the sub-branch
   * escape (F13/R3). Lazily refreshes the revision-keyed escape set so every
   * consumer (getGlobalTransform seam, plan builder, interaction anchors)
   * observes the same membership.
   */
  public override _childEscapesTransformGroup(child: RenderNode): boolean {
    this._refreshBranchEscapes();

    return this._escapedBranches.has(child);
  }

  /**
   * Sub-branch escape decision (F13/R3, superseding the whole-group
   * disengage of plan D-P4 Option A). Re-scans the subtree only when its
   * content/structure revisions changed since the last check — every effect
   * toggle and attach/detach bumps them, so the runtime-toggle path
   * invalidates for free, and the scan cost lands only on frames that
   * already pay an O(subtree) re-collect.
   */
  private _refreshBranchEscapes(): void {
    if (this._escapeCheckContent === this._contentRevision && this._escapeCheckStructure === this._structureRevision) {
      return;
    }

    this._escapeCheckContent = this._contentRevision;
    this._escapeCheckStructure = this._structureRevision;

    let changed = false;
    let escapedCount = 0;

    for (let index = 0; index < this._children.length; index++) {
      const child = this._children[index]!;
      // A direct barrier child escapes on its own (supported, world-space
      // wholesale), so its subtree is skipped — same rule the pre-R3 scan
      // used. Only Containers can hold a deep barrier.
      const escapes = !child._renderPlanHasBarrierEffects() && child instanceof Container && this._scanForBarriers(child);

      if (escapes) {
        escapedCount++;

        if (!this._escapedBranches.has(child)) {
          this._escapedBranches.add(child);
          this._notifyBranchSpaceFlipped(child);
          changed = true;
        }
      } else if (this._escapedBranches.delete(child)) {
        this._notifyBranchSpaceFlipped(child);
        changed = true;
      }
    }

    // Drop members that are no longer children (the reparent/removal is what
    // bumped the structure revision and got us here). Their new space is the
    // new parent's business; the removal path already notified interaction.
    if (this._escapedBranches.size > escapedCount) {
      for (const branch of this._escapedBranches) {
        if (branch.parent !== this) {
          this._escapedBranches.delete(branch);
          changed = true;
        }
      }
    }

    if (!changed) {
      return;
    }

    // Spaces flipped under at least one branch: the fragment (captured in
    // the other space) and the aggregate bounds must drop immediately. While
    // any branch is escaped the fragment can never record instructions
    // (barrier records gate S3-D5), so the retained GPU bundle is released
    // with it; a fully re-engaged group keeps the grow-only bundle for the
    // next recording (S3-D3).
    if (this._escapedBranches.size > 0) {
      this._fragment.dispose();
    } else {
      this._fragment.invalidate();
    }

    this._invalidateBoundsFlags();

    if (__DEV__ && this._escapedBranches.size > 0 && !this._deepBarrierWarned) {
      this._deepBarrierWarned = true;
      logger.warn(
        `RetainedContainer${this.name ? ` '${this.name}'` : ''} contains a node with filters/mask/clip/cacheAsBitmap ` +
          'nested deeper than one level below the group boundary. That sub-branch leaves the transform group and ' +
          're-collects in world space every frame — retention and the group transform stay active for the rest of ' +
          'the group — until the effect-bearing node is moved up to a direct child of the group or out of it.',
        { source: 'rendering' },
      );
    }
  }

  /**
   * An escape flip changes the transform SPACE of the whole branch without
   * touching its bounds flags or revisions, so spatial-index consumers
   * (InteractionManager buckets nodes by group anchor) must be told per-node.
   * The manager filters to tracked interactive nodes (O(1) Set-miss for the
   * rest); flips are rare and already pay an O(subtree) barrier scan, so the
   * walk is in budget — and it is scoped to the flipped branch only (F13/R3),
   * never the whole group.
   */
  private _notifyBranchSpaceFlipped(branch: RenderNode): void {
    branch._getStage()?.interaction._notifyBoundsInvalidated(branch);

    if (branch instanceof Container) {
      this._notifySubtreeBoundsInvalidated(branch);
    }
  }

  /** Depth-first bounds-invalidation notification for every descendant (see the flip comment above). */
  private _notifySubtreeBoundsInvalidated(container: Container): void {
    for (const child of container.children) {
      child._getStage()?.interaction._notifyBoundsInvalidated(child);

      if (child instanceof Container) {
        this._notifySubtreeBoundsInvalidated(child);
      }
    }
  }

  private _scanForBarriers(container: Container): boolean {
    // Uses the public `children` getter: protected `_children` of OTHER
    // Container instances is not accessible from a subclass in TypeScript.
    for (const child of container.children) {
      if (child._renderPlanHasBarrierEffects()) {
        return true;
      }

      if (child instanceof Container && this._scanForBarriers(child)) {
        return true;
      }
    }

    return false;
  }
}
