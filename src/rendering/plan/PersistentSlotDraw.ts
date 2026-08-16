import { RenderEntryKind } from './RenderCommand';
import type { RenderRootSource } from './RenderRootSource';
import type { SourceScope } from './RenderSourceItem';

/**
 * Backend-owned GPU state for one render root's persistent slot space: the
 * per-slot quad attributes, world transform and tint, plus whatever the backend
 * needs to issue the draw (a vertex array, a bind group, an order buffer).
 *
 * The plan layer never looks inside. It only holds the handle so the state
 * outlives a frame, and reads {@link generation} the way it reads a retained
 * bundle's — a bump means the backend recreated or dropped the resources, so
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
   * thousand. Refusing such a root at acquisition — the only other place the
   * decision could live — would withdraw the indexed path from exactly the
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
 * today's behaviour with no branch on the hot path — every call site checks for
 * `undefined` first.
 *
 * Contract:
 *
 * - `_acquirePersistentSlots(source)` — decide whether this backend can serve
 *   the source's items through a slot store and, if so, allocate one. Called
 *   once per built source (and again after a backend switch), never per frame.
 *   Returning `null` is the sanctioned refusal and costs nothing: the root
 *   simply stays on the ordinary selection path. The backend is responsible for
 *   the checks only it can make — that every drawable's renderer supports the
 *   path, that the whole source fits one texture table, that one pipeline
 *   serves it — because "which draws batch together" is a backend rule.
 * - `_writePersistentSlots(bundle, source, entered, count)` — fill the per-slot
 *   stores for the items in `entered`, a flat `(scopeOrdinal, localIndex, slot)`
 *   triple list. Called with the items that just took a slot and with nothing
 *   else, which is the whole point: a staying item's rows are already correct.
 * - `_drawPersistentOrder(bundle, order, count)` — draw `count` instances,
 *   instance `i` reading slot `order[i]`. The order IS the draw order, so the
 *   backend must not sort, group or otherwise permute it.
 * @internal
 */
export interface PersistentSlotBackend {
  _acquirePersistentSlots?(source: RenderRootSource): PersistentSlotBundle | null;
  _writePersistentSlots?(bundle: PersistentSlotBundle, source: RenderRootSource, entered: Int32Array, count: number): void;
  _drawPersistentOrder?(bundle: PersistentSlotBundle, order: Uint32Array, count: number): void;
}

/**
 * One root's persistent draw, as the plan player receives it: the store to draw
 * from, and the order stream's live extent.
 *
 * Held per representation and mutated in place, never allocated per frame —
 * `order` is the {@link DerivedSelectionState}'s own array, whose identity is
 * stable across selections.
 * @internal
 */
export interface PersistentSlotDrawRecord {
  bundle: PersistentSlotBundle;
  order: Uint32Array;
  count: number;
}

/** Whether `backend` implements the whole persistent-indexed contract. @internal */
export const supportsPersistentSlots = (backend: PersistentSlotBackend): boolean =>
  backend._acquirePersistentSlots !== undefined && backend._writePersistentSlots !== undefined && backend._drawPersistentOrder !== undefined;

/**
 * Whether a source's SHAPE allows its visible set to be drawn as one ordered
 * stream of slots — the half of the eligibility question the plan layer owns.
 *
 * Two conditions, both about draw order rather than about batching:
 *
 * - No scope may have mixed `zIndex`. A scope that does is sorted by the
 *   optimizer, so its recorded order is NOT its draw order, and the order
 *   stream — which is built from recorded order — would paint it wrong. With
 *   uniform z in every scope the sort is a no-op and the two coincide.
 * - No scope may hold a live entry. Barriers, transform-group boundaries and
 *   view-dependent producers are re-dispatched through a full collect at their
 *   recorded position, so the stream would have to be cut around each of them
 *   and interleaved with live playback. That is a real extension, not a
 *   correctness shortcut, and it is deliberately not taken here: a root holding
 *   one keeps today's path in full.
 * @internal
 */
export const sourceShapeAllowsPersistentSlots = (source: RenderRootSource): boolean => {
  for (const scope of source.scopes) {
    if (scope.hasMixedZ) {
      return false;
    }

    if (!othersAreAllGroups(scope)) {
      return false;
    }
  }

  return source.rootScope !== null;
};

const othersAreAllGroups = (scope: SourceScope): boolean => {
  for (const other of scope.others) {
    if (other.kind !== RenderEntryKind.Group) {
      return false;
    }
  }

  return true;
};
