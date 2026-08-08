import { removeArrayItems } from './utils';

/**
 * Listener function for a {@link Signal}. A Signal is a pure notification —
 * a handler's return value carries no meaning. Routable engine events that
 * need to stop propagating expose `stopPropagation()` on the event instead,
 * so control flow is never hidden in a return value.
 */
type SignalHandler<Args extends unknown[]> = (...params: Args) => void;

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
 * `dispatch` tracks re-entrancy with a depth counter instead of a snapshot
 * copy, so no allocation occurs per dispatch and a listener that dispatches
 * this same Signal again nests safely. Handlers added or removed during
 * dispatch take effect on the next call, never the dispatch in progress —
 * both `add` and `remove` mid-dispatch defer their mutation until after the
 * outermost dispatch finishes.
 */
export class Signal<Args extends unknown[] = []> {
  private readonly _handlers: Array<SignalHandler<Args>> = [];
  private _dispatchDepth = 0;
  private _pendingAdds: Array<SignalHandler<Args>> | null = null;
  private _pendingRemoves: Array<SignalHandler<Args>> | null = null;

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
   * correct `this` inside the handler. Adding a handler while this Signal is
   * dispatching defers registration until the outermost dispatch finishes —
   * it does not receive the dispatch in progress, only the next one.
   */
  public add(handler: SignalHandler<Args>): this {
    if (this._dispatchDepth > 0) {
      if (!this._handlers.includes(handler) && !this._pendingAdds?.includes(handler)) {
        (this._pendingAdds ??= []).push(handler);
      }
    } else if (!this._handlers.includes(handler)) {
      this._handlers.push(handler);
    }

    return this;
  }

  /**
   * Register a listener that auto-removes itself after the first dispatch.
   * The internal wrapper reference differs from `handler`, so calling
   * {@link Signal.remove} with the original `handler` reference does NOT
   * remove it — use {@link Signal.clear} to undo a `once` registration.
   *
   * The wrapper latches after its first call, so `handler` fires at most
   * once even if the wrapper is still present in `_handlers` for more than
   * one dispatch pass — e.g. a nested dispatch of this same Signal sees the
   * same wrapper the outer dispatch does, since the self-removal below is
   * itself deferred until the outermost dispatch completes.
   */
  public once(handler: SignalHandler<Args>): this {
    let fired = false;

    const wrapper = (...params: Args): void => {
      if (fired) {
        return;
      }

      fired = true;
      this.remove(wrapper);
      handler(...params);
    };

    this.add(wrapper);

    return this;
  }

  /** Remove a previously registered handler. No-op if absent. */
  public remove(handler: SignalHandler<Args>): this {
    if (this._dispatchDepth > 0) {
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
    if (this._dispatchDepth > 0) {
      this._pendingRemoves = [...this._handlers];
      // Cancel anything scheduled to be added by this same dispatch too —
      // "clear every listener" must not be undone by a pending add that was
      // queued earlier in the same outermost dispatch.
      this._pendingAdds = null;
    } else {
      this._handlers.length = 0;
    }

    return this;
  }

  /**
   * Notify every registered listener in registration order. Listeners may
   * safely add or remove themselves or others during dispatch — both kinds
   * of mutation are deferred until after the outermost dispatch completes.
   */
  public dispatch(...params: Args): this {
    const length = this._handlers.length;

    if (!length) {
      return this;
    }

    this._dispatchDepth++;

    try {
      for (let i = 0; i < length; i++) {
        this._handlers[i]!(...params);
      }
    } finally {
      // A normal dispatch deliberately propagates listener exceptions, but
      // the emitter's own bookkeeping must never remain stuck in its
      // mid-dispatch state when that happens. A listener that dispatches
      // this same Signal again nests another call here — the depth counter
      // (rather than a boolean) ensures the outer dispatch, still mid-loop
      // above it on the stack, keeps seeing itself as "dispatching" until
      // that outer frame's own `finally` runs, so pending adds/removes flush
      // exactly once, after the outermost dispatch completes.
      this._dispatchDepth--;

      if (this._dispatchDepth === 0) {
        this._flushPending();
      }
    }

    return this;
  }

  /**
   * Notify every registered listener in registration order, isolating each
   * listener's exceptions individually instead of letting the first throw
   * abort the whole dispatch — used for lifecycle signals
   * (`Scene.onActivate`/`onSuspend`, `SceneDirector.onStateChange`/
   * `onChangeScene`/`onStartScene`/`onStopScene`) where a listener must
   * never be able to abort a state transition that already happened, or
   * silently prevent every listener registered after it from running.
   *
   * A throwing listener is reported to `onError` (itself guarded — a
   * throwing `onError` callback never propagates back into this dispatch)
   * and dispatch continues to the remaining listeners.
   * `_dispatchDepth`/pending-add/pending-remove bookkeeping is guaranteed via
   * `finally`, so a throw here can never corrupt a later
   * `dispatch()`/`add()`/`remove()` call on this Signal the way an unguarded
   * throw inside {@link Signal.dispatch} would. `dispatch` and
   * `dispatchIsolated` share the same depth counter, so nesting either
   * variant inside the other still defers adds/removals correctly until the
   * outermost call finishes.
   */
  public dispatchIsolated(onError: (error: unknown) => void, ...params: Args): this {
    const length = this._handlers.length;

    if (!length) {
      return this;
    }

    this._dispatchDepth++;

    try {
      for (let i = 0; i < length; i++) {
        try {
          this._handlers[i]!(...params);
        } catch (error) {
          try {
            onError(error);
          } catch {
            // A throwing onError listener must never propagate back into
            // the lifecycle dispatch that triggered it.
          }
        }
      }
    } finally {
      this._dispatchDepth--;

      if (this._dispatchDepth === 0) {
        this._flushPending();
      }
    }

    return this;
  }

  /** Apply every deferred `add`/`remove`/`clear` once the outermost dispatch has finished. */
  private _flushPending(): void {
    if (this._pendingAdds !== null) {
      for (const handler of this._pendingAdds) {
        if (!this._handlers.includes(handler)) {
          this._handlers.push(handler);
        }
      }

      this._pendingAdds = null;
    }

    if (this._pendingRemoves !== null) {
      for (const handler of this._pendingRemoves) {
        const index = this._handlers.indexOf(handler);

        if (index !== -1) {
          removeArrayItems(this._handlers, index, 1);
        }
      }

      this._pendingRemoves = null;
    }
  }

  public destroy(): void {
    this._handlers.length = 0;
    this._pendingAdds = null;
    this._pendingRemoves = null;
  }
}
