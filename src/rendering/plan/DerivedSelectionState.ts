import { RenderEntryKind } from './RenderCommand';
import type { SourceScope } from './RenderSourceItem';
import type { MembershipBits } from './SourceVisibilityIndex';

/**
 * Growth headroom for the slot space, as a multiple of the live slot count. The
 * table only ever grows, and a scrolling camera's live count oscillates around a
 * plateau, so overshooting once is cheaper than reallocating on the frames that
 * cross it.
 */
const slotGrowthFactor = 2;

/**
 * What one incremental update actually did. Counters rather than a comment,
 * for the same reason {@link SelectionDelta}'s are: a path that quietly stopped
 * being incremental - reallocating every slot, rewriting every order entry -
 * still produces correct pixels and would pass a timing-only gate on a small
 * scene.
 * @internal
 */
export interface DerivedSlotStats {
  /** Slots handed to items that were not visible last selection. */
  allocated: number;
  /** Of those, ones taken from the free list rather than from fresh space. */
  reused: number;
  /** Slots whose item stayed visible, and which were therefore not touched. */
  retained: number;
  /** Slots returned to the free list because their item left the view. */
  released: number;
  /** Entries written into the order stream - one per visible item. */
  orderEntries: number;
  /** High-water mark of the slot space, i.e. how many slots exist at all. */
  slotCapacity: number;
}

const resetSlotStats = (stats: DerivedSlotStats): void => {
  stats.allocated = 0;
  stats.reused = 0;
  stats.retained = 0;
  stats.released = 0;
  stats.orderEntries = 0;
};

/**
 * @internal
 *
 * The half of a render root's derived state that survives a camera step: which
 * derived slot each visible item owns, and the order those slots are drawn in.
 *
 * # Why the two are separate
 *
 * A slot is a PHYSICAL address - a row in the persistent per-item stores a
 * backend keeps (static quad attributes, world transform, tint). It is handed
 * out when an item enters the view and taken back when it leaves, so it comes
 * off a free list and its numeric value says nothing about draw order.
 *
 * The order stream is the SEMANTIC sequence: the visible items in exactly the
 * order a full collect would have emitted them, expressed as slot numbers. It is
 * what the backend's instanced draw walks, so `(zIndex, seq)` survives verbatim
 * even though the data it points at is scattered.
 *
 * Keeping them apart is the whole point of the design. Compacting the physical
 * store into draw order instead would move every item behind an insertion on
 * every camera step, which is the O(visible) rebuild this class exists to
 * remove; drawing the physical store in slot order instead would silently
 * reorder equal-z transparent draws, which is a pixel change.
 *
 * # Cost
 *
 * Per selection: the delta scan is word-wise over `items / 32`, slot
 * allocation and release are O(entered + exited), and the order stream is
 * rebuilt in full - O(items / 32 + visible) integer writes, no per-item object
 * touched. Rebuilding it beats diffing it: an entry is four bytes, and a diff
 * would have to answer where each survivor MOVED to, which costs more than
 * writing it.
 *
 * A STAY item contributes exactly one order-stream write and nothing else. Its
 * quad attributes, its transform row and its tint stay where they are, unread.
 */
export class DerivedSelectionState {
  /** Derived slot of each global item handle, or -1 when the item is not visible. */
  private _slotOfHandle: Int32Array<ArrayBuffer> = new Int32Array(0);
  /** Global item handle occupying each slot, or -1 when the slot is free. */
  private _handleOfSlot: Int32Array<ArrayBuffer> = new Int32Array(0);
  private _freeSlots: Int32Array<ArrayBuffer> = new Int32Array(0);
  private _freeCount = 0;
  private _slotCount = 0;
  private _handleCount = 0;

  /** Visible slots in draw order; valid for `[0, orderCount)`. */
  private _order = new Uint32Array(0);
  private _orderCount = 0;

  /**
   * Items that just took a slot, as flat `(scopeOrdinal, localIndex, slot)`
   * triples. These - and only these - need their persistent per-item data
   * written, which is why the list exists instead of a flag per slot: the
   * backend walks it directly rather than searching the slot space for work.
   */
  private _entered: Int32Array<ArrayBuffer> = new Int32Array(0);
  private _enteredCount = 0;

  public readonly stats: DerivedSlotStats = {
    allocated: 0,
    reused: 0,
    retained: 0,
    released: 0,
    orderEntries: 0,
    slotCapacity: 0,
  };

  public get order(): Uint32Array {
    return this._order;
  }

  public get orderCount(): number {
    return this._orderCount;
  }

  public get enteredCount(): number {
    return this._enteredCount;
  }

  /** Flat `(scopeOrdinal, localIndex, slot)` triples; valid for `3 * enteredCount` entries. */
  public get entered(): Int32Array {
    return this._entered;
  }

  /** How many slots exist - the size the backend's per-item stores must cover. */
  public get slotCount(): number {
    return this._slotCount;
  }

  /** CPU bytes this state holds, for the memory report. */
  public get byteLength(): number {
    return this._slotOfHandle.byteLength + this._handleOfSlot.byteLength + this._freeSlots.byteLength + this._order.byteLength + this._entered.byteLength;
  }

  /** The slot `handle` owns, or -1. Test/diagnostic access. */
  public slotOf(handle: number): number {
    return handle >= 0 && handle < this._handleCount ? this._slotOfHandle[handle]! : -1;
  }

  /** The handle occupying `slot`, or -1 when it is free. Test/diagnostic access. */
  public handleAt(slot: number): number {
    return slot >= 0 && slot < this._slotCount ? this._handleOfSlot[slot]! : -1;
  }

  /**
   * Re-key against a freshly built source of `handleCount` items.
   *
   * Everything is dropped rather than remapped: a rebuilt source renumbers its
   * handles, so a slot assignment made against the old numbering describes a
   * different item. The next update therefore reports every visible item as
   * entered, which is exactly true - the backend's stores hold nothing valid for
   * them either.
   */
  public rebind(handleCount: number): void {
    this._handleCount = handleCount;
    this._slotOfHandle = new Int32Array(handleCount).fill(-1);
    this._handleOfSlot = new Int32Array(0);
    this._freeSlots = new Int32Array(0);
    this._freeCount = 0;
    this._slotCount = 0;
    this._order = new Uint32Array(handleCount);
    this._orderCount = 0;
    this._entered = new Int32Array(0);
    this._enteredCount = 0;
    resetSlotStats(this.stats);
    this.stats.slotCapacity = 0;
  }

  /** Whether this state still keys a source of `handleCount` items. */
  public matches(handleCount: number): boolean {
    return this._handleCount === handleCount;
  }

  /** Drop everything (source invalidation / root destroy). */
  public release(): void {
    this.rebind(0);
  }

  /**
   * Apply one selection's membership to the slot table and rebuild the order
   * stream, walking `rootScope` in the order a collect emits it.
   *
   * `previous` supplies the membership the last selection produced, per scope
   * ordinal; pass `null` when there is none, in which case every admitted item
   * is treated as entering.
   */
  public update(rootScope: SourceScope, current: readonly MembershipBits[], previous: readonly MembershipBits[] | null): void {
    resetSlotStats(this.stats);
    this._enteredCount = 0;
    this._orderCount = 0;

    // Releases run over the WHOLE tree before any allocation, not scope by
    // scope. A camera step swaps items roughly one for one, so vacating first
    // lets the arrivals reuse the departures' slots instead of growing the
    // space - which is what keeps the backend's per-slot stores proportional to
    // what is on screen rather than to everything ever seen.
    if (previous !== null) {
      this._releaseTree(rootScope, current, previous);
    }

    this._admitTree(rootScope, current, previous);
    this._walkScope(rootScope, current);
    this.stats.orderEntries = this._orderCount;
    this.stats.slotCapacity = this._slotCount;
  }

  private _releaseTree(scope: SourceScope, current: readonly MembershipBits[], previous: readonly MembershipBits[]): void {
    this._releaseScope(scope, current, previous);

    for (const other of scope.others) {
      if (other.kind === RenderEntryKind.Group) {
        this._releaseTree(other, current, previous);
      }
    }
  }

  private _releaseScope(scope: SourceScope, current: readonly MembershipBits[], previous: readonly MembershipBits[]): void {
    const now = current[scope.ordinal]!;
    const was = previous[scope.ordinal]!;
    const nowWords = now.words;
    const wasWords = was.words;
    const wordCount = was.wordCount;
    const base = scope.handleBase;

    for (let w = 0; w < wordCount; w++) {
      let gone = wasWords[w]! & ~nowWords[w]!;

      if (gone === 0) {
        continue;
      }

      const wordBase = w << 5;

      while (gone !== 0) {
        const lowest = gone & -gone;

        gone ^= lowest;
        this._release(base + wordBase + (31 - Math.clz32(lowest)));
      }
    }
  }

  private _admitTree(scope: SourceScope, current: readonly MembershipBits[], previous: readonly MembershipBits[] | null): void {
    this._admitScope(scope, current, previous);

    for (const other of scope.others) {
      if (other.kind === RenderEntryKind.Group) {
        this._admitTree(other, current, previous);
      }
    }
  }

  private _admitScope(scope: SourceScope, current: readonly MembershipBits[], previous: readonly MembershipBits[] | null): void {
    const now = current[scope.ordinal]!;
    const was = previous === null ? null : previous[scope.ordinal]!;
    const nowWords = now.words;
    const wasWords = was === null ? null : was.words;
    const wordCount = now.wordCount;
    const base = scope.handleBase;
    const ordinal = scope.ordinal;
    let stayed = 0;

    for (let w = 0; w < wordCount; w++) {
      const nowWord = nowWords[w]!;

      if (nowWord === 0) {
        continue;
      }

      const wasWord = wasWords === null ? 0 : wasWords[w]!;
      const wordBase = w << 5;
      let arrived = nowWord & ~wasWord;

      stayed += popcount(nowWord & wasWord);

      while (arrived !== 0) {
        const lowest = arrived & -arrived;
        const local = wordBase + (31 - Math.clz32(lowest));

        arrived ^= lowest;
        this._admit(ordinal, local, base + local);
      }
    }

    this.stats.retained += stayed;
  }

  private _release(handle: number): void {
    const slot = this._slotOfHandle[handle]!;

    if (slot < 0) {
      return;
    }

    this._slotOfHandle[handle] = -1;
    this._handleOfSlot[slot] = -1;

    if (this._freeCount === this._freeSlots.length) {
      this._freeSlots = growInt32(this._freeSlots, Math.max(16, this._freeSlots.length * 2));
    }

    this._freeSlots[this._freeCount++] = slot;
    this.stats.released++;
  }

  private _admit(scopeOrdinal: number, localIndex: number, handle: number): void {
    if (this._slotOfHandle[handle]! >= 0) {
      return;
    }

    let slot: number;

    if (this._freeCount > 0) {
      slot = this._freeSlots[--this._freeCount]!;
      this.stats.reused++;
    } else {
      slot = this._slotCount++;

      if (slot >= this._handleOfSlot.length) {
        this._handleOfSlot = growInt32(this._handleOfSlot, Math.max(16, slot * slotGrowthFactor + 1));
      }
    }

    this._slotOfHandle[handle] = slot;
    this._handleOfSlot[slot] = handle;
    this.stats.allocated++;

    const cursor = this._enteredCount * 3;

    if (cursor + 3 > this._entered.length) {
      this._entered = growInt32(this._entered, Math.max(48, (cursor + 3) * slotGrowthFactor));
    }

    this._entered[cursor] = scopeOrdinal;
    this._entered[cursor + 1] = localIndex;
    this._entered[cursor + 2] = slot;
    this._enteredCount++;
  }

  /**
   * Append `scope`'s visible slots to the order stream, interleaving nested
   * scopes at the recorded position their `itemMark` gives them.
   *
   * This is the same walk `RenderPlanBuilder._emitSourceSelection` performs, and
   * it has to stay the same walk: the order stream IS the draw order, so any
   * divergence here is a reordered frame. Nested groups are entered
   * unconditionally rather than behind their subtree cull test - the per-item
   * membership already answers that question, and an empty nested scope
   * contributes nothing to append.
   */
  private _walkScope(scope: SourceScope, current: readonly MembershipBits[]): void {
    const bits = current[scope.ordinal]!;
    const words = bits.words;
    const wordCount = bits.wordCount;
    const others = scope.others;
    const otherCount = others.length;
    const base = scope.handleBase;
    const slotOfHandle = this._slotOfHandle;
    const order = this._order;
    let other = 0;
    let cursor = this._orderCount;

    for (let w = 0; w < wordCount; w++) {
      let word = words[w]!;

      if (word === 0) {
        continue;
      }

      const wordBase = w << 5;

      while (word !== 0) {
        const lowest = word & -word;
        const local = wordBase + (31 - Math.clz32(lowest));

        word ^= lowest;

        while (other < otherCount && others[other]!.itemMark <= local) {
          const nested = others[other]!;

          other++;

          if (nested.kind === RenderEntryKind.Group) {
            this._orderCount = cursor;
            this._walkScope(nested, current);
            cursor = this._orderCount;
          }
        }

        order[cursor++] = slotOfHandle[base + local]!;
      }
    }

    this._orderCount = cursor;

    while (other < otherCount) {
      const nested = others[other]!;

      other++;

      if (nested.kind === RenderEntryKind.Group) {
        this._walkScope(nested, current);
      }
    }
  }
}

const growInt32 = (source: Int32Array<ArrayBuffer>, capacity: number): Int32Array<ArrayBuffer> => {
  const next = new Int32Array(capacity);

  next.set(source);

  return next;
};

const popcount = (value: number): number => {
  let v = value - ((value >>> 1) & 0x55555555);

  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;

  return Math.imul(v, 0x01010101) >>> 24;
};
