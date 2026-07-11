import { Bounds } from '#core/Bounds';
import { logger } from '#core/logging';
import { nextNodeRevision } from '#core/NodeRevision';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';

import { Container } from './Container';
import type { RenderNode } from './RenderNode';

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
 * re-collect every frame); nesting them deeper DISENGAGES the group — it
 * then renders as an exact plain {@link Container} (correct output, no
 * retention) and warns once in dev builds.
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
  private _boundaryDisengaged = false;
  private _devFragmentBuilds = 0;
  private _devFragmentInvalidations = 0;
  private _devRetentionWarned = false;

  /**
   * The group convention is LIVE state (plan D-P4, Option A): `true` while
   * engaged; flips to `false` when a barrier-effect node sits deeper than
   * one level inside the subtree, falling back to exact plain-Container
   * behavior instead of rendering wrong effect placement. Descendants pick
   * a flip up lazily through the getGlobalTransform parent-version seam.
   * @internal
   */
  public override get _isTransformGroupBoundary(): boolean {
    return !this._boundaryDisengaged;
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
    if (this._boundaryDisengaged) {
      // Deep-barrier fallback: children are world-space, aggregate plainly.
      return super.updateBounds();
    }

    const world = this.getGlobalTransform();

    if (this._aggregateContentRevision !== this._contentRevision || this._aggregateStructureRevision !== this._structureRevision) {
      this._rebuildGroupAggregate();
      this._aggregateContentRevision = this._contentRevision;
      this._aggregateStructureRevision = this._structureRevision;
    }

    this._bounds.reset().addRect(this._groupAggregate.getRect(), world);

    // Index loop, no iterator allocation: this runs on every group move.
    for (let index = 0; index < this._liveBoundsChildren.length; index++) {
      const child = this._liveBoundsChildren[index]!;

      if (child._renderPlanHasBarrierEffects()) {
        // World-space escape: no lift.
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

      // Nested-group detection is by TYPE, not the live boundary getter: a
      // (rare) disengaged nested RetainedContainer still decouples its own
      // moves from the content revision, so it must stay out of the cache.
      if (child._renderPlanHasBarrierEffects() || child instanceof RetainedContainer || child._isTransformGroupBoundary) {
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

    if (this._boundaryDisengaged) {
      // Deep-barrier fallback (plan D-P4): exact plain-Container behavior,
      // including the Slice-1 per-child cache. Never captures a fragment.
      super._collectContent(builder);

      return;
    }

    if (this._fragment.isClean(this._contentRevision, this._structureRevision, builder.backend)) {
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

  public override destroy(): void {
    // dispose(): invalidates AND releases the retained GPU bundle (Slice 3, S3-D3).
    this._fragment.dispose();
    this._groupAggregate.destroy();
    this._liveBoundsChildren.length = 0;

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

  private _deepBarrierCheckContent = -1;
  private _deepBarrierCheckStructure = -1;
  private _deepBarrierWarned = false;

  /** @internal */
  public override _collect(builder: RenderPlanBuilder, seq?: number): void {
    // Re-evaluate the deep-barrier fallback BEFORE culling/bounds run, so an
    // engagement flip never mixes spaces within one frame (plan D-P4).
    // Skipped entirely while the subtree revisions are unchanged.
    this._refreshBoundaryEngagement();
    super._collect(builder, seq);
  }

  /**
   * Deep-barrier fallback decision (plan D-P4, Option A). Re-scans the
   * subtree only when its content/structure revisions changed since the last
   * check — every effect toggle and attach/detach bumps them (task 1), so the
   * runtime-toggle path invalidates for free, and the scan cost lands only on
   * frames that already pay an O(subtree) re-collect.
   */
  private _refreshBoundaryEngagement(): void {
    if (this._deepBarrierCheckContent === this._contentRevision && this._deepBarrierCheckStructure === this._structureRevision) {
      return;
    }

    this._deepBarrierCheckContent = this._contentRevision;
    this._deepBarrierCheckStructure = this._structureRevision;

    const disengage = this._subtreeHasDeepBarrier();

    if (disengage === this._boundaryDisengaged) {
      return;
    }

    this._boundaryDisengaged = disengage;
    // Spaces flip: descendants recombine lazily through the live boundary
    // getter; the fragment (captured in the other space), its retained GPU
    // bundle (S3-D3: disengage frees resources), and the aggregate bounds
    // must drop immediately.
    this._fragment.dispose();
    this._invalidateBoundsFlags();
    // The flip changes the transform SPACE of every descendant without
    // touching their bounds flags or revisions, so spatial-index consumers
    // (InteractionManager buckets nodes by group anchor) must be told
    // per-node. The manager filters to tracked interactive nodes (O(1)
    // Set-miss for the rest); flips are rare and already pay an O(subtree)
    // barrier scan, so the extra walk is in budget.
    this._notifySubtreeBoundsInvalidated(this);

    if (__DEV__ && disengage && !this._deepBarrierWarned) {
      this._deepBarrierWarned = true;
      logger.warn(
        `RetainedContainer${this.name ? ` '${this.name}'` : ''} contains a node with filters/mask/clip/cacheAsBitmap ` +
          'nested deeper than one level below the group boundary. Retention and the group transform are disabled — ' +
          'it renders as a plain Container — until the effect-bearing node is moved up to a direct child of the ' +
          'group or out of it.',
        { source: 'rendering' },
      );
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

  /**
   * `true` when any barrier-effect node sits deeper than one level below this
   * boundary. Direct barrier children escape to world space (supported), and
   * their subtrees are world-space wholesale, so the scan skips them.
   */
  private _subtreeHasDeepBarrier(): boolean {
    for (const child of this._children) {
      if (child._renderPlanHasBarrierEffects()) {
        continue;
      }

      if (child instanceof Container && this._scanForBarriers(child)) {
        return true;
      }
    }

    return false;
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
