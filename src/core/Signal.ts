import { removeArrayItems } from '@/core/utils';

/**
 * Listener function for a {@link Signal}. Returning `false` from a handler
 * stops further dispatch to remaining listeners for the current invocation
 * (subsequent dispatches are unaffected).
 */
type SignalHandler<Args extends unknown[]> = (...params: Args) => void | boolean;

/**
 * Lightweight typed event emitter. Each `Signal` represents one named
 * notification channel (e.g. `onResize`, `onFrame`). Listeners are added with
 * {@link Signal.add} or {@link Signal.once}, removed with
 * {@link Signal.remove}, and notified with {@link Signal.dispatch}.
 *
 * `Args` is the tuple of arguments passed to listeners — type-checked end to
 * end so a `new Signal<[number, string]>()` enforces both `dispatch(1, 'x')`
 * and the listener signature `(n: number, s: string) => …`.
 *
 * Handlers are stored as direct function references (no wrapper objects).
 * `dispatch` uses a guard flag instead of a snapshot copy, so no allocation
 * occurs per dispatch. Handlers added or removed during dispatch take effect
 * on the next call; a `remove` mid-dispatch defers the splice until after the
 * current iteration finishes. Returning `false` from a handler short-circuits
 * the rest of the dispatch.
 */
export class Signal<Args extends unknown[] = []> {
  private readonly _handlers: SignalHandler<Args>[] = [];
  private _dispatching = false;
  private _pendingRemoves: SignalHandler<Args>[] | null = null;

  /** Number of currently registered listeners. */
  public get count(): number {
    return this._handlers.length;
  }

  /** `true` when `handler` is currently registered. */
  public has(handler: SignalHandler<Args>): boolean {
    return this._handlers.includes(handler);
  }

  /**
   * Register a listener. Idempotent — adding the same handler reference
   * twice is a no-op. Use arrow functions or pre-bound methods to ensure
   * correct `this` inside the handler.
   */
  public add(handler: SignalHandler<Args>): this {
    if (!this._handlers.includes(handler)) {
      this._handlers.push(handler);
    }

    return this;
  }

  /**
   * Register a listener that auto-removes itself after the first dispatch.
   * The internal wrapper reference differs from `handler`, so calling
   * {@link Signal.remove} with the original `handler` reference does NOT
   * remove it — use {@link Signal.clear} to undo a `once` registration.
   */
  public once(handler: SignalHandler<Args>): this {
    const wrapper = (...params: Args): void => {
      this.remove(wrapper);
      handler(...params);
    };

    this._handlers.push(wrapper);

    return this;
  }

  /** Remove a previously registered handler. No-op if absent. */
  public remove(handler: SignalHandler<Args>): this {
    if (this._dispatching) {
      (this._pendingRemoves ??= []).push(handler);
    } else {
      const index = this._handlers.indexOf(handler);

      if (index !== -1) {
        removeArrayItems(this._handlers, index, 1);
      }
    }

    return this;
  }

  /** Remove every listener. */
  public clear(): this {
    if (this._dispatching) {
      this._pendingRemoves = [...this._handlers];
    } else {
      this._handlers.length = 0;
    }

    return this;
  }

  /**
   * Notify every registered listener in registration order. Returning `false`
   * from a handler stops dispatch to the remaining listeners for this call.
   * Listeners may safely remove themselves or others during dispatch — removals
   * are deferred until after the current iteration completes.
   */
  public dispatch(...params: Args): this {
    const length = this._handlers.length;

    if (!length) {
      return this;
    }

    this._dispatching = true;

    for (let i = 0; i < length; i++) {
      if (this._handlers[i](...params) === false) {
        break;
      }
    }

    this._dispatching = false;

    if (this._pendingRemoves !== null) {
      for (const handler of this._pendingRemoves) {
        const index = this._handlers.indexOf(handler);

        if (index !== -1) {
          removeArrayItems(this._handlers, index, 1);
        }
      }

      this._pendingRemoves = null;
    }

    return this;
  }

  public destroy(): void {
    this._handlers.length = 0;
    this._pendingRemoves = null;
  }
}
