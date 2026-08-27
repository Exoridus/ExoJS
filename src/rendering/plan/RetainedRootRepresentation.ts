import { type ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import type { View } from '#rendering/View';

import { DerivedRootProduct } from './DerivedRootProduct';
import {
  type PersistentSlotBackend,
  type PersistentSlotBundle,
  type PersistentSlotDrawRecord,
  sourceShapeAllowsPersistentSlots,
  supportsPersistentSlots,
} from './PersistentSlotDraw';
import { RenderRootSource } from './RenderRootSource';
import type { ScopeEntry } from './RenderScope';
import { type RenderTargetIdentity, RetainedCaptureSlot } from './RetainedCaptureSlot';
import type { RetainedGroupFragment } from './RetainedGroupFragment';

/**
 * Products one root may hold at once. Two, and not as a first guess: a slot
 * carries a full instruction set plus the recorded entries behind it, which is
 * the dominant memory position for a large root, and "the screen plus one
 * offscreen target" covers the cases that recur every frame - minimap, portal,
 * mirror, post-processing source. A third target in the same frame falls back
 * to re-capturing, which is what every target did before the set existed.
 */
const MAX_CAPTURE_SLOTS = 2;

/**
 * The automatic persistent render representation of one **render root** - the
 * node handed to `RenderingContext.render()` / `renderTo()` / `capture()` or
 * to `RenderNode.render()`. Created lazily by the node
 * ({@link RenderNode._retainedRootRepresentation}) and disposed with it.
 *
 * It reuses {@link RetainedGroupFragment} as its derived product (the entry
 * snapshot plus the recorded instruction set) and adds the keys a root needs
 * that a {@link RetainedContainer} deliberately does not:
 *
 * - the subtree's TRANSFORM revision - a plain container has no group matrix and
 *   no row-patch path, so a descendant move re-collects (same rule
 *   {@link RetainedPlanCache} already applies to the per-child skip);
 * - the root's own global-transform stamp - a render root is not a closed
 *   dependency boundary, so an ancestor ABOVE it moving must invalidate even
 *   though it stamps none of the root's revisions;
 * - the backend's render target - compiled products are pass/target-specific,
 *   so a root drawn to more than one target holds one product per target (see
 *   {@link selectCaptureSlot});
 * - the view SELECTION (see {@link isClean}) - per-child culling is view
 *   dependent even though the captured records are not.
 *
 * Unlike a `RetainedContainer` this changes no scene-graph semantics: children
 * keep world-space transforms, per-child culling, and their own bounds
 * convention. The representation only decides whether the frame is rebuilt from
 * the scene graph or replayed.
 * @internal
 */
export class RetainedRootRepresentation {
  /**
   * The products this root holds, most recently used first, one per
   * (backend, render target) pair. Kept as a short array rather than a map: it
   * is at most {@link MAX_CAPTURE_SLOTS} long, so a linear scan is the whole
   * lookup and the order doubles as the eviction order.
   */
  private readonly _captureSlots: RetainedCaptureSlot[] = [new RetainedCaptureSlot()];
  /** The slot the current draw reads and writes; see {@link selectCaptureSlot}. */
  private _capture: RetainedCaptureSlot = this._captureSlots[0]!;

  /**
   * Point this representation at the product held for `backend` drawing into
   * `target`, evicting the least recently used one when a new pair arrives and
   * the set is full. Call once per draw, before anything else on the capture
   * tier is asked or told.
   *
   * Everything from here to {@link commitCapture} then reads one product and is
   * unaware of the others, which is what keeps the tier's reasoning about views,
   * cull rects and thrash unchanged from when there was a single field.
   */
  public selectCaptureSlot(backend: RenderBackend, target: RenderTargetIdentity | null): void {
    const slots = this._captureSlots;

    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index]!;

      if (slot.matchesKey(backend, target)) {
        this._promote(index);
        this._capture = slot;

        return;
      }
    }

    // An untouched slot has a null key and matches nothing, so the first draw of
    // a root lands here and simply claims it.
    const reused = slots.length < MAX_CAPTURE_SLOTS && slots[0]!.hasCapture ? this._addSlot() : slots[slots.length - 1]!;

    reused.retarget(backend, target);
    this._promote(slots.indexOf(reused));
    this._capture = reused;
  }

  /** Move the slot at `index` to the front of the eviction order. */
  private _promote(index: number): void {
    if (index > 0) {
      this._captureSlots.unshift(...this._captureSlots.splice(index, 1));
    }
  }

  private _addSlot(): RetainedCaptureSlot {
    const slot = new RetainedCaptureSlot();

    this._captureSlots.push(slot);

    return slot;
  }

  /** The product the selected slot holds - the recorded entries and instruction set. */
  public get fragment(): RetainedGroupFragment {
    return this._capture.fragment;
  }

  /**
   * Offer a moved descendant's baked transform row to every product that holds
   * one, not only to the one this frame draws: a product compiled for another
   * target is replayed on a later draw and would otherwise replay the position
   * the node has left.
   */
  public enqueueDirtyTransformRow(node: RenderNode): void {
    for (const slot of this._captureSlots) {
      if (slot.fragment.hasCapture) {
        slot.fragment.enqueueDirtyTransformRow(node);
      }
    }
  }

  public isCleanIgnoringTransform(contentRevision: number, structureRevision: number, ancestryStamp: number, view: View): boolean {
    return this._capture.isCleanIgnoringTransform(contentRevision, structureRevision, ancestryStamp, view);
  }

  public reconcileTransform(transformRevision: number, view: View, backend: RenderBackend): boolean {
    return this._capture.reconcileTransform(transformRevision, view, backend);
  }

  public markReplayed(): void {
    this._capture.markReplayed();
  }

  public shouldSuppressCapture(contentRevision: number, structureRevision: number, transformRevision: number, view: View): boolean {
    return this._capture.shouldSuppressCapture(contentRevision, structureRevision, transformRevision, view);
  }

  public beginCapture(cullRect: ReadonlyRectangle): void {
    this._capture.beginCapture(cullRect);
  }

  public noteViewRead(): void {
    this._capture.noteViewRead();
  }

  public noteKept(rect: ReadonlyRectangle): void {
    this._capture.noteKept(rect);
  }

  public noteKeptCoords(minX: number, minY: number, maxX: number, maxY: number): void {
    this._capture.noteKeptCoords(minX, minY, maxX, maxY);
  }

  public noteCulled(): void {
    this._capture.noteCulled();
  }

  public commitCapture(
    contentRevision: number,
    structureRevision: number,
    transformRevision: number,
    ancestryStamp: number,
    view: View,
    backend: RenderBackend,
    entries: readonly ScopeEntry[],
    entryCount: number,
  ): void {
    this._capture.commitCapture(contentRevision, structureRevision, transformRevision, ancestryStamp, view, backend, entries, entryCount);
  }

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
   * backend- and frame-NEUTRAL half: the keys that are not - view selection,
   * render target, backend identity - stay on this class.
   *
   * Root-only, and not for want of a second consumer: a `RetainedContainer`
   * suppresses per-child culling inside its boundary, so it has no re-selection
   * to make and holds none of this (see {@link RenderRootSource}). The layer the
   * two tiers do share is the one below - the fragment's pooled records and the
   * capture-thrash rule.
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
  private _slotBundle: PersistentSlotBundle | null = null;
  private _slotBackend: RenderBackend | null = null;
  private _slotGeneration = -1;
  /** Remembered refusal, so an ineligible source is not re-examined every frame. */
  private _slotsRefused = false;
  private _slotRecord: PersistentSlotDrawRecord | null = null;
  private readonly _slotCullRect = new Rectangle();
  private _hasSlotCullRect = false;
  /**
   * Consecutive frames that had to rebuild and found the subtree exactly as the
   * rebuild before them left it, plus the keys that streak is measured against.
   *
   * The build gate ({@link shouldBuildSource}). One such frame proves nothing -
   * a camera that stepped once and stopped produces exactly one, and a source
   * built for it is one O(N) walk plus one record per drawable that will never
   * be selected from twice. Two in a row is the signature of a camera moving
   * across a settled scene, which is the case the source exists for.
   *
   * The keys are exactly the source's own, transform included, so a scene that
   * moves something every frame can never produce the streak - and therefore
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
   * persistable source at any granularity - attribution to the outermost
   * producer covers the entire subtree.
   *
   * Sticky across invalidation: it is a property of what the root node DOES
   * during collect, not of the content it holds, so re-running the walk on the
   * next view change would reach the same conclusion at the same cost.
   */
  private _sourceUnbuildable = false;

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

  /**
   * The backend's persistent slot store for the current source, acquiring it on
   * first use, or `null` when this root does not qualify for the indexed path.
   *
   * Decided once per source rather than per frame. Eligibility is a property of
   * the source's content - its draw order, its materials, its texture set - and
   * none of that changes while the source stays usable; asking again every frame
   * would put a walk over every item back on the path the whole design exists to
   * keep off it. A refusal is remembered for the same reason.
   *
   * A backend switch drops the answer along with the resources: which draws
   * batch together is the new backend's rule, and the old one's GPU objects mean
   * nothing to it.
   */
  public persistentSlots(source: RenderRootSource, backend: RenderBackend): PersistentSlotBundle | null {
    if (this._slotBackend !== backend) {
      this.releasePersistentSlots();
      this._slotBackend = backend;
    }

    if (this._slotBundle !== null) {
      return this._slotBundle.generation === this._slotGeneration ? this._slotBundle : this._reacquirePersistentSlots(source, backend);
    }

    if (this._slotsRefused) {
      return null;
    }

    return this._reacquirePersistentSlots(source, backend);
  }

  /**
   * Whether every slot the backend holds is still the one the plan believes it
   * wrote. False after a generation bump - device restore, a store the backend
   * had to reallocate - which is the signal that the next selection must treat
   * every visible item as entering.
   */
  public get persistentSlotsIntact(): boolean {
    return this._slotBundle !== null && this._slotBundle.generation === this._slotGeneration;
  }

  private _reacquirePersistentSlots(source: RenderRootSource, backend: RenderBackend): PersistentSlotBundle | null {
    this.releasePersistentSlots();
    this._slotBackend = backend;

    const hooks = backend as PersistentSlotBackend;

    if (!supportsPersistentSlots(hooks) || !sourceShapeAllowsPersistentSlots(source)) {
      this._slotsRefused = true;

      return null;
    }

    const bundle = hooks._acquirePersistentSlots!(source);

    if (bundle === null) {
      this._slotsRefused = true;

      return null;
    }

    this._slotBundle = bundle;
    this._slotGeneration = bundle.generation;

    return bundle;
  }

  /**
   * Drop the slot store and refuse the indexed path for as long as this source
   * lives - the backend has answered that it cannot represent the root.
   *
   * Sticky for the same reason an acquisition refusal is: the answer is a
   * property of the source and the device, so asking again next frame would
   * re-run the backend's walk over every item to be told the same thing. A
   * rebuilt source releases the representation and with it the refusal.
   */
  public refusePersistentSlots(backend: RenderBackend): void {
    this.releasePersistentSlots();
    this._slotBackend = backend;
    this._slotsRefused = true;
  }

  /** Drop the slot store (source invalidation, backend switch, root destroy). */
  public releasePersistentSlots(): void {
    this._slotBundle?.destroy?.();
    this._slotBundle = null;
    this._slotBackend = null;
    this._slotGeneration = -1;
    this._slotsRefused = false;
    this._hasSlotCullRect = false;
    this._slotRecord = null;
    this._derivedProduct?.slots.release();
  }

  /**
   * The draw record handed to the player, mutated in place across frames.
   *
   * `order` is the selection state's own array, whose identity survives every
   * update, so the record is written once per selection rather than allocated
   * per frame.
   */
  public persistentDrawRecord(bundle: PersistentSlotBundle, order: Uint32Array, count: number): PersistentSlotDrawRecord {
    const record = (this._slotRecord ??= { bundle, order, count });

    record.bundle = bundle;
    record.order = order;
    record.count = count;

    return record;
  }

  /** The record from the last selection, or `null` when there has been none. */
  public get lastPersistentDraw(): PersistentSlotDrawRecord | null {
    return this._slotRecord;
  }

  /**
   * Whether `view` still lies inside the rect the last indexed selection
   * admitted against - i.e. whether its order stream is still the right answer.
   *
   * Same argument as the capture margin, applied one tier down: a selection that
   * culled against a rect ENCLOSING the view admitted everything any view inside
   * that rect admits, so a camera step that stays within it re-issues the same
   * draw unchanged. That is what keeps the common frame at one draw call instead
   * of a membership query over the whole source.
   */
  public persistentSelectionCovers(view: View): boolean {
    return this._hasSlotCullRect && this._slotCullRect.containsRect(view.getBounds());
  }

  /** Remember the rect the indexed selection admitted against. */
  public notePersistentSelection(cullRect: ReadonlyRectangle): void {
    this._slotCullRect.set(cullRect.x, cullRect.y, cullRect.width, cullRect.height);
    this._hasSlotCullRect = true;
  }

  /** Force the next frame back through a full membership query. */
  public invalidatePersistentSelection(): void {
    this._hasSlotCullRect = false;
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

  /** Release every product AND the retained GPU resources (node destroy). */
  public dispose(): void {
    this.releasePersistentSlots();

    for (const slot of this._captureSlots) {
      slot.dispose();
    }

    this._source?.invalidate();
    this._source = null;
    this._derivedProduct?.release();
    this._derivedProduct = null;
    this._sourceUnbuildable = false;
  }
}
