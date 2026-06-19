import type { Destroyable } from './types';

/**
 * Ownership container for {@link Destroyable} resources. Items registered with
 * {@link track} are destroyed in reverse registration order when the scope
 * itself is destroyed — the spine of ExoJS's ownership-driven cleanup. A
 * {@link Scene} owns one (exposed via `Scene.track`); an `Application` owns one
 * for app-scoped services.
 *
 * `track` is idempotent and returns its argument for fluent capture:
 *
 * ```ts
 * const world = scope.track(new PhysicsWorld());
 * ```
 *
 * {@link destroy} is idempotent and tolerant: every tracked item's `destroy()`
 * is attempted even if an earlier one throws, so a single failure cannot leak
 * the rest. In development the collected errors are rethrown as an
 * `AggregateError` once teardown completes; in production they are swallowed.
 *
 * A `DisposalScope` is itself {@link Destroyable}, so scopes can nest.
 */
export class DisposalScope implements Destroyable {
  private readonly _items = new Set<Destroyable>();
  private readonly _order: Destroyable[] = [];
  private _disposed = false;

  /** Whether {@link destroy} has already run. A disposed scope tracks nothing further. */
  public get disposed(): boolean {
    return this._disposed;
  }

  /** Number of items currently tracked. */
  public get size(): number {
    return this._items.size;
  }

  /**
   * Register `item` for destruction with this scope. No-op when `item` is
   * already tracked or the scope is already disposed. Returns `item` so it can
   * be captured inline: `const x = scope.track(new Thing())`.
   */
  public track<T extends Destroyable>(item: T): T {
    if (!this._disposed && !this._items.has(item)) {
      this._items.add(item);
      this._order.push(item);
    }

    return item;
  }

  /** Whether `item` is currently tracked. */
  public has(item: Destroyable): boolean {
    return this._items.has(item);
  }

  /**
   * Stop tracking `item` without destroying it (ownership returns to the
   * caller). Returns `true` if it was tracked. No-op after the scope is disposed.
   */
  public untrack(item: Destroyable): boolean {
    if (this._disposed || !this._items.delete(item)) {
      return false;
    }

    const index = this._order.indexOf(item);

    if (index !== -1) {
      this._order.splice(index, 1);
    }

    return true;
  }

  /**
   * Destroy every tracked item in reverse registration order, then clear the
   * scope. Idempotent. Continues past a throwing item; in development the
   * collected errors are rethrown as an `AggregateError` after teardown.
   */
  public destroy(): void {
    if (this._disposed) {
      return;
    }

    this._disposed = true;

    const errors: unknown[] = [];

    for (let index = this._order.length - 1; index >= 0; index--) {
      try {
        this._order[index].destroy();
      } catch (error) {
        errors.push(error);
      }
    }

    this._items.clear();
    this._order.length = 0;

    if (__DEV__ && errors.length > 0) {
      throw new AggregateError(errors, `[ExoJS] DisposalScope.destroy(): ${errors.length} tracked item(s) threw during destroy.`);
    }
  }
}
