import type { Destroyable } from './types';

/**
 * Ownership container for {@link Destroyable} resources. Items registered with
 * {@link track} are destroyed in reverse registration order when the scope
 * itself is destroyed — the spine of ExoJS's ownership-driven cleanup.
 *
 * A {@link Scene} owns one for its whole lifetime, exposed as `Scene.track`.
 * An `Application` does not: it creates one for the duration of its
 * constructor, to release the subsystems already built if a later construction
 * step throws (the caller never receives an instance, so `destroy()` is
 * unreachable). Its own `Application.destroy()` runs an explicit ordered
 * teardown instead, because the WebGPU→WebGL2 backend fallback replaces
 * subsystems after construction, which a long-lived scope would not follow.
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
 * A `DestroyScope` is itself {@link Destroyable}, so scopes can nest.
 */
export class DestroyScope implements Destroyable {
  private readonly _items = new Set<Destroyable>();
  private readonly _order: Destroyable[] = [];
  private _destroyed = false;

  /** Whether {@link destroy} has already run. A destroyed scope tracks nothing further. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /** Number of items currently tracked. */
  public get size(): number {
    return this._items.size;
  }

  /**
   * Register `item` for destruction with this scope. No-op when `item` is
   * already tracked or the scope is already destroyed. Returns `item` so it can
   * be captured inline: `const x = scope.track(new Thing())`.
   */
  public track<T extends Destroyable>(item: T): T {
    if (!this._destroyed && !this._items.has(item)) {
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
   * caller). Returns `true` if it was tracked. No-op after the scope is destroyed.
   */
  public untrack(item: Destroyable): boolean {
    if (this._destroyed || !this._items.delete(item)) {
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
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    const errors: unknown[] = [];

    for (let index = this._order.length - 1; index >= 0; index--) {
      try {
        this._order[index]!.destroy();
      } catch (error) {
        errors.push(error);
      }
    }

    this._items.clear();
    this._order.length = 0;

    if (__DEV__ && errors.length > 0) {
      throw new AggregateError(errors, `[ExoJS] DestroyScope.destroy(): ${errors.length} tracked item(s) threw during destroy.`);
    }
  }
}
