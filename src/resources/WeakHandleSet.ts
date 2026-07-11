/**
 * An insertion-ordered set of asset handles held **weakly** (via {@link WeakRef}).
 *
 * The {@link Loader} tracks the live consumer handles for one asset key — the
 * representative plus every co-handle adopted for the same source — so that a
 * refcount-0 eviction can re-arm them all and a later claim heals them in place
 * (asset-system v2 §7). Holding them strongly would keep evicted `Texture` /
 * `Sound` objects alive for the loader's lifetime, so a streaming open world
 * that claims/releases thousands of sources would grow the deferred bookkeeping
 * unbounded (audit A4). Storing them weakly lets the GC reclaim a handle once
 * the game drops its last reference; a companion `FinalizationRegistry` in the
 * loader then prunes the emptied entry.
 *
 * Iteration and {@link first} transparently skip handles the GC has already
 * reclaimed; {@link prune} compacts the dead slots out.
 * @internal
 */
export class WeakHandleSet {
  private readonly _refs: Array<WeakRef<object>> = [];

  public constructor(handle?: object) {
    if (handle !== undefined) {
      this._refs.push(new WeakRef(handle));
    }
  }

  /** Add `handle` if it is not already a live member (dedup by identity). */
  public add(handle: object): void {
    if (this.has(handle)) {
      return;
    }

    this._refs.push(new WeakRef(handle));
  }

  /** True if `handle` is currently a live member. */
  public has(handle: object): boolean {
    for (const ref of this._refs) {
      if (ref.deref() === handle) {
        return true;
      }
    }

    return false;
  }

  /** The first still-live handle in insertion order, or `undefined` if none remain. */
  public first(): object | undefined {
    for (const ref of this._refs) {
      const handle = ref.deref();

      if (handle !== undefined) {
        return handle;
      }
    }

    return undefined;
  }

  /** Iterate the still-live handles in insertion order (dead slots are skipped). */
  public *[Symbol.iterator](): IterableIterator<object> {
    for (const ref of this._refs) {
      const handle = ref.deref();

      if (handle !== undefined) {
        yield handle;
      }
    }
  }

  /**
   * Drop the slots whose handle the GC has reclaimed. Returns `true` if at least
   * one live handle remains, `false` if the set is now empty.
   */
  public prune(): boolean {
    let write = 0;
    let alive = false;

    for (let read = 0; read < this._refs.length; read++) {
      const ref = this._refs[read];

      if (ref?.deref() !== undefined) {
        this._refs[write++] = ref;
        alive = true;
      }
    }

    this._refs.length = write;

    return alive;
  }

  /** True when no live handle remains. */
  public get isEmpty(): boolean {
    return this.first() === undefined;
  }
}
