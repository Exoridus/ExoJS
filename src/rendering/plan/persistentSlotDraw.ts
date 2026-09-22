import { RenderEntryKind } from './renderCommand';
import type { RenderRootSource } from './RenderRootSource';
import type { LiveEntry, SourceScope } from './renderSourceItem';

/**
 * Backend-owned GPU state for one render root's persistent slot space: the
 * per-slot quad attributes, world transform and tint, plus whatever the backend
 * needs to issue the draw (a vertex array, a bind group, an order buffer).
 *
 * The plan layer never looks inside. It only holds the handle so the state
 * outlives a frame, and reads {@link generation} the way it reads a retained
 * bundle's - a bump means the backend recreated or dropped the resources, so
 * every slot the plan believes is written has to be written again.
 * @internal
 */
export interface PersistentSlotBundle {
  /** Monotonic resource generation; a change invalidates every written slot. */
  readonly generation: number;
  /** Release the GPU resources (root destroy, source invalidation, backend switch). */
  destroy?(): void;
  /**
   * Whether the backend can hold a selection this size at all, asked before the
   * slots are written and answered against the device's real limits.
   *
   * The question exists because the bound is a property of the SELECTION, not of
   * the source: a store's buffers grow with the slots the camera hands out, and
   * a root of ten million items whose view admits a few thousand needs a few
   * thousand. Refusing such a root at acquisition - the only other place the
   * decision could live - would withdraw the indexed path from exactly the
   * scenes it exists for.
   *
   * A `false` is a REFUSAL, not an error: the plan drops the store and puts the
   * root back on the ordinary path, which has no per-root allocation to
   * overflow. A backend whose representation has no such ceiling omits the
   * method.
   */
  canRepresent?(slots: number, orderEntries: number): boolean;
}

/**
 * The backend half of the persistent-indexed selection path.
 *
 * A backend that implements all three can draw a render root's visible set
 * straight out of slot-addressed stores, which is what lets a camera step touch
 * only the items that entered or left. A backend that implements none keeps
 * today's behaviour with no branch on the hot path - every call site checks for
 * `undefined` first.
 *
 * Contract:
 *
 * - `_acquirePersistentSlots(source)` - decide whether this backend can serve
 *   the source's items through a slot store and, if so, allocate one. Called
 *   once per built source (and again after a backend switch), never per frame.
 *   Returning `null` is the sanctioned refusal and costs nothing: the root
 *   simply stays on the ordinary selection path. The backend is responsible for
 *   the checks only it can make - that every drawable's renderer supports the
 *   path, that the whole source fits one texture table, that one pipeline
 *   serves it - because "which draws batch together" is a backend rule.
 * - `_writePersistentSlots(bundle, source, entered, count)` - fill the per-slot
 *   stores for the items in `entered`, a flat `(scopeOrdinal, localIndex, slot)`
 *   triple list. Called with the items that just took a slot and with nothing
 *   else, which is the whole point: a staying item's rows are already correct.
 * - `_drawPersistentOrder(bundle, order, orderCount, offset, count)` - draw
 *   `count` instances, instance `i` reading slot `order[offset + i]`. The order
 *   IS the draw order, so the backend must not sort, group or otherwise permute
 *   it. `orderCount` is the whole stream's length: a root whose stream is cut
 *   around live entries issues one call per segment, in stream order, with live
 *   playback in between, and a backend that keeps the stream on the device
 *   sizes its buffer for `orderCount` on the first segment so a later one never
 *   replaces a buffer an earlier draw of the same frame still reads.
 * - `_rekeyPersistentSlots(bundle, source, carried, previousHandleCount)` -
 *   re-derive whatever the store keys on the item numbering, after a structure
 *   delta re-discovered part of the source. `carried` gives, for each new global
 *   handle, the handle the same drawable held before, or -1 when it is new or
 *   changed; an implementation must re-derive only the latter, because this runs
 *   on every structural frame and a walk over the whole source here is the cost
 *   the delta exists to remove. `false` means the store must be dropped; the
 *   written slots survive a `true`, so anything keyed per SLOT has to keep its
 *   meaning across the call. Optional: a backend that omits it simply loses its
 *   store on such a frame and acquires a new one.
 * @internal
 */
export interface PersistentSlotBackend {
  _acquirePersistentSlots?(source: RenderRootSource): PersistentSlotBundle | null;
  _writePersistentSlots?(bundle: PersistentSlotBundle, source: RenderRootSource, entered: Int32Array, count: number): void;
  _drawPersistentOrder?(bundle: PersistentSlotBundle, order: Uint32Array, orderCount: number, offset: number, count: number): void;
  _rekeyPersistentSlots?(bundle: PersistentSlotBundle, source: RenderRootSource, carried: Int32Array, previousHandleCount: number): boolean;
}

/**
 * One root's persistent draw, as the plan player receives it: the store to draw
 * from, the order stream's live extent, and where the stream is cut for live
 * playback.
 *
 * A live entry - a barrier, a transform-group boundary, a view-dependent
 * producer - sits in the stream at `markPositions[i]`: every slot before that
 * position draws before the entry, every slot from it on draws after. The
 * entries themselves are re-dispatched through a full collect on every frame,
 * into the `i`-th child scope of the scope carrying this record, which is what
 * keeps a mask's rect or a parallax layer's coverage current while the slots
 * around it stay untouched.
 *
 * Held per representation and mutated in place, never allocated per frame -
 * `order` and the mark arrays are the {@link DerivedSelectionState}'s own,
 * whose identities are stable across selections.
 * @internal
 */
export interface PersistentSlotDrawRecord {
  bundle: PersistentSlotBundle;
  order: Uint32Array;
  count: number;
  /** Stream positions of the live entries, ascending; valid for `[0, markCount)`. */
  markPositions: readonly number[];
  /** The live entry at each mark; valid for `[0, markCount)`. */
  markEntries: readonly LiveEntry[];
  markCount: number;
}

/** Whether `backend` implements the whole persistent-indexed contract. @internal */
export const supportsPersistentSlots = (backend: PersistentSlotBackend): boolean =>
  backend._acquirePersistentSlots !== undefined && backend._writePersistentSlots !== undefined && backend._drawPersistentOrder !== undefined;

/**
 * Whether a source's SHAPE allows its visible set to be drawn as an ordered
 * stream of slots - the half of the eligibility question the plan layer owns.
 *
 * One condition, about draw order rather than about batching: no scope may
 * have mixed `zIndex`. A scope that does is sorted by the optimizer, so its
 * recorded order is NOT its draw order, and the order stream - which is built
 * from recorded order - would paint it wrong. With uniform z in every scope the
 * sort is a no-op and the two coincide.
 *
 * A live entry is not a refusal: the stream is cut at its recorded position and
 * the entry is played live between the two segments (see
 * {@link PersistentSlotDrawRecord}). One mask, boundary or parallax layer
 * therefore costs one cut, not the persistence of every item around it. It is
 * held to the same z rule as everything else in its scope, because a live
 * entry's own collect reserves its `zIndex` on the frame-local scope and the
 * optimizer would sort it away from the position the stream was cut at.
 * @internal
 */
export const sourceShapeAllowsPersistentSlots = (source: RenderRootSource): boolean => {
  for (const scope of source.scopes) {
    if (scope.hasMixedZ || liveEntriesMixZ(scope)) {
      return false;
    }
  }

  return source.rootScope !== null;
};

const liveEntriesMixZ = (scope: SourceScope): boolean => {
  let z = scope.firstZ;

  for (const other of scope.others) {
    if (other.kind !== RenderEntryKind.Barrier) {
      continue;
    }

    if (z === null) {
      z = other.zIndex;
    } else if (other.zIndex !== z) {
      return true;
    }
  }

  return false;
};
