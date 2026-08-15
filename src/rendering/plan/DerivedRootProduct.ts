import type { ReadonlyRectangle } from '#math/Rectangle';

import { DerivedSelectionState } from './DerivedSelectionState';
import type { RenderItemVisibility } from './RenderItemVisibility';
import type { SourceScope } from './RenderSourceItem';
import { MembershipBits, type VisibilityQueryStats } from './SourceVisibilityIndex';

/**
 * What one selection frame actually did, in structural terms.
 *
 * These are the numbers that decide whether a camera step costs O(spatial
 * candidates + delta) or merely runs the same O(N) loop faster, so they are
 * counters rather than a comment. A gate that only watched wall-clock would
 * pass a strategy that stopped culling.
 * @internal
 */
export interface SelectionDelta {
  /** Grid cells walked across every scope this frame. */
  cells: number;
  /** Items the visibility query looked at — the spatial candidate set. */
  candidates: number;
  /** Items admitted now that were not admitted last selection. */
  entered: number;
  /** Items admitted last selection that are not admitted now. */
  exited: number;
  /** Items admitted by both. */
  stayed: number;
  /** Items admitted this frame in total (`entered + stayed`). */
  visible: number;
  /** Whether a previous membership existed to diff against. */
  hadPrevious: boolean;
}

/** A zeroed delta record, reused across frames so a selection allocates none. @internal */
const resetDelta = (delta: SelectionDelta): void => {
  delta.cells = 0;
  delta.candidates = 0;
  delta.entered = 0;
  delta.exited = 0;
  delta.stayed = 0;
  delta.visible = 0;
};

const popcount = (value: number): number => {
  let v = value - ((value >>> 1) & 0x55555555);

  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;

  return Math.imul(v, 0x01010101) >>> 24;
};

/**
 * @internal
 *
 * The view-dependent half of a render root's persistent state: which of the
 * source's items the current camera admits, and how that set differs from the
 * one the previous selection produced.
 *
 * Deliberately NOT part of {@link RenderRootSource}. The source is the
 * backend- and view-NEUTRAL description of what the subtree contains; membership
 * is a function of the camera and of the target the root is drawn into, and
 * folding it into the source would make a root rendered through two views
 * overwrite its own answer every frame.
 *
 * Per render root, and nothing else: a `RetainedContainer` is culled as a whole
 * and never asks which of its children a rect admits, so it holds no membership
 * of any kind (see {@link RenderRootSource}).
 *
 * Membership is one bit per item, held per scope so a scope's bits are a plain
 * index range over its contiguous item store. That shape is the point: the delta
 * between two frames is three word-wise loops over `items / 32` words, so a
 * camera step that keeps 250,000 items and swaps 4,000 of them never visits the
 * 250,000 to find that out.
 */
export class DerivedRootProduct {
  /** Membership of the selection being computed, indexed by scope ordinal. */
  private _current: MembershipBits[] = [];
  /** Membership of the previous selection, same indexing. */
  private _previous: MembershipBits[] = [];
  private _hasPrevious = false;
  private _scopeCount = 0;
  /** Which scopes this selection actually queried; the rest were culled whole. */
  private _queried = new Uint8Array(0);
  private _handleCount = 0;

  /**
   * Stable derived slots and the draw-order stream over them.
   *
   * Only maintained while {@link slotsEnabled} holds: reconciling it costs one
   * order-stream write per visible item, which is worth paying exactly when a
   * backend is going to draw FROM it and pure overhead otherwise.
   */
  public readonly slots = new DerivedSelectionState();

  /**
   * Whether this root's selection feeds a persistent-indexed backend path.
   *
   * Decided per source by {@link RetainedRootRepresentation}, not per frame: the
   * eligibility question ("can this subtree's draw order be expressed as one
   * stream of slots into one texture table?") is a property of the source's
   * content, so it is answered when the source is built and holds until it is
   * thrown away.
   */
  public slotsEnabled = false;

  public readonly delta: SelectionDelta = {
    cells: 0,
    candidates: 0,
    entered: 0,
    exited: 0,
    stayed: 0,
    visible: 0,
    hadPrevious: false,
  };

  /** CPU bytes the membership sets hold, for the memory report. */
  public get byteLength(): number {
    let total = 0;

    for (const bits of this._current) {
      total += bits.byteLength;
    }

    for (const bits of this._previous) {
      total += bits.byteLength;
    }

    return total + this.slots.byteLength;
  }

  /**
   * Re-key the product against a freshly built source.
   *
   * A rebuilt source renumbers its handles, so the previous membership no longer
   * describes anything — it is dropped rather than remapped, and the next
   * selection reports every admitted item as ENTERED, which is exactly true.
   */
  public rebind(scopes: readonly SourceScope[]): void {
    let handles = 0;

    for (const scope of scopes) {
      handles += scope.items.count;
    }

    this._scopeCount = scopes.length;
    this._hasPrevious = false;
    this._current = scopes.map(scope => sizedBits(scope.items.count));
    this._previous = scopes.map(scope => sizedBits(scope.items.count));
    this._queried = new Uint8Array(scopes.length);
    this._handleCount = handles;

    // Only sized when a backend is going to draw from it: the slot table and the
    // order stream are eight bytes an item, which at a million is worth nothing
    // to a root whose frames never reach the indexed path.
    if (this.slotsEnabled) {
      this.slots.rebind(handles);
    }
  }

  /** Whether the product still matches a source with `scopeCount` scopes. */
  public matches(scopeCount: number): boolean {
    return this._scopeCount === scopeCount;
  }

  /**
   * Start a selection: the set computed last time becomes the one this one is
   * diffed against, and the new set starts empty.
   */
  public beginSelection(): void {
    const swap = this._previous;

    this._previous = this._current;
    this._current = swap;
    this.delta.hadPrevious = this._hasPrevious;

    resetDelta(this.delta);
    this._queried.fill(0);

    for (const bits of this._current) {
      bits.clear();
    }
  }

  /**
   * Fill one scope's membership from `rect` and fold the result into the delta.
   *
   * A scope the caller skipped entirely — a group whose aggregate bounds miss
   * the rect — keeps its cleared bits, which is the correct answer (nothing in
   * it is admitted) and costs nothing to produce.
   */
  public selectScope(scope: SourceScope, rect: ReadonlyRectangle, visibility: RenderItemVisibility): MembershipBits {
    const bits = this._current[scope.ordinal]!;
    const stats: VisibilityQueryStats = this.delta;

    visibility.select(scope, rect, bits, stats);
    this._queried[scope.ordinal] = 1;
    this._accumulate(scope.ordinal, bits);

    return bits;
  }

  /** This selection's membership for `ordinal` — valid only inside a selection. */
  public bits(ordinal: number): MembershipBits {
    return this._current[ordinal]!;
  }

  /**
   * Seal the selection: fold every scope the walk never reached — a group culled
   * as a whole — so its items report as EXITED rather than silently vanishing
   * from the accounting, then make this membership the next one's baseline.
   */
  public commitSelection(scopes: readonly SourceScope[]): void {
    for (const scope of scopes) {
      if (this._queried[scope.ordinal] === 0) {
        this._accumulate(scope.ordinal, this._current[scope.ordinal]!);
      }
    }

    const hadPrevious = this._hasPrevious;

    this._hasPrevious = true;

    // Scope 0 IS the root (`finalizeSourceScopes` pushes it first), and the
    // previous membership is still intact here — `beginSelection` is what swaps
    // the two, so nothing has overwritten it during this selection.
    if (this.slotsEnabled && scopes.length > 0) {
      if (!this.slots.matches(this._handleCount)) {
        this.slots.rebind(this._handleCount);

        // A table sized only now has no previous assignment to diff against, so
        // every admitted item enters — which is what the backend's empty stores
        // require anyway.
        this.slots.update(scopes[0]!, this._current, null);

        return;
      }

      this.slots.update(scopes[0]!, this._current, hadPrevious ? this._previous : null);
    }
  }

  /** Drop everything (source invalidation / root destroy). */
  public release(): void {
    this._current = [];
    this._previous = [];
    this._queried = new Uint8Array(0);
    this._hasPrevious = false;
    this._scopeCount = 0;
    this.slots.release();
    resetDelta(this.delta);
    this.delta.hadPrevious = false;
  }

  private _accumulate(ordinal: number, bits: MembershipBits): void {
    const previous = this._previous[ordinal]!;
    const nowWords = bits.words;
    const wasWords = previous.words;
    const words = bits.wordCount;
    const delta = this.delta;
    let entered = 0;
    let exited = 0;
    let stayed = 0;

    for (let w = 0; w < words; w++) {
      const now = nowWords[w]!;
      const was = wasWords[w]!;

      entered += popcount(now & ~was);
      exited += popcount(was & ~now);
      stayed += popcount(now & was);
    }

    delta.entered += entered;
    delta.exited += exited;
    delta.stayed += stayed;
    delta.visible += entered + stayed;
  }
}

const sizedBits = (count: number): MembershipBits => {
  const bits = new MembershipBits();

  bits.reset(count);

  return bits;
};
