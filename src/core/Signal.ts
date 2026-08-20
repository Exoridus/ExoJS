import { removeArrayItems } from './utils';

/**
 * Listener function for a {@link Signal}. A Signal is a pure notification -
 * a handler's return value carries no meaning. Routable engine events that
 * need to stop propagating expose `stopPropagation()` on the event instead,
 * so control flow is never hidden in a return value.
 */
type SignalHandler<Args extends unknown[]> = (...params: Args) => void;

/** A deferred mutation queued while a Signal is mid-dispatch, resolved once the outermost dispatch finishes. */
type PendingOp = 'add' | 'remove';

/**
 * Lightweight typed event emitter. Each `Signal` represents one named
 * notification channel (e.g. `onResize`, `onFrame`). Listeners are added with
 * {@link Signal.add} or {@link Signal.once}, removed with
 * {@link Signal.remove}, and notified with {@link Signal.dispatch}.
 *
 * `Args` is the tuple of arguments passed to listeners - type-checked end to
 * end so a `new Signal<[number, string]>()` enforces both `dispatch(1, 'x')`
 * and the listener signature `(n: number, s: string) => …`.
 *
 * Handlers are stored as direct function references (no wrapper objects).
 * `dispatch` tracks re-entrancy with a depth counter instead of a snapshot
 * copy, so no allocation occurs per dispatch and a listener that dispatches
 * this same Signal again nests safely. Handlers added or removed during
 * dispatch take effect on the next call, never the dispatch in progress -
 * both `add` and `remove` mid-dispatch defer their mutation until after the
 * outermost dispatch finishes, and reconcile per handler (the *last*
 * `add`/`remove` requested for a given handler during one outermost dispatch
 * wins, resolved against whether `_handlers` - never mutated while any
 * dispatch is in progress - actually contained that handler when dispatch
 * started) rather than each call consulting the other's un-flushed queue as
 * if it were already-applied state. {@link Signal.destroy} is safe to call
 * from inside a listener: it terminates the dispatch that triggered it (and
 * every dispatch nested inside it on the same call stack) immediately,
 * without invoking any further listener at any nesting level.
 */
export class Signal<Args extends unknown[] = []> {
  private readonly _handlers: Array<SignalHandler<Args>> = [];
  private _dispatchDepth = 0;
  private _pendingOps: Map<SignalHandler<Args>, PendingOp> | null = null;
  private _destroyed = false;

  /** Number of currently registered listeners. */
  public get count(): number {
    return this._handlers.length;
  }

  /** `true` when `handler` is currently registered. */
  public has(handler: SignalHandler<Args>): boolean {
    return this._handlers.includes(handler);
  }

  /**
   * Register a listener. Idempotent - adding the same handler reference
   * twice is a no-op. Use arrow functions or pre-bound methods to ensure
   * correct `this` inside the handler. Adding a handler while this Signal is
   * dispatching defers registration until the outermost dispatch finishes -
   * it does not receive the dispatch in progress, only the next one. A
   * `remove` followed by an `add` for the same handler within one outermost
   * dispatch nets to "still registered" - the add is not silently dropped
   * just because the remove was queued first. No-op once {@link
   * Signal.destroy} has been called.
   */
  public add(handler: SignalHandler<Args>): this {
    if (this._destroyed) {
      return this;
    }

    if (this._dispatchDepth > 0) {
      // Always record the latest intent, resolved later against the actual
      // (unmutated while depth > 0) `_handlers` membership in
      // `_flushPending` - not against whether `handler` currently "looks"
      // present/absent from this call's point of view, which is exactly
      // what let a `remove` immediately before this `add` win regardless of
      // order.
      (this._pendingOps ??= new Map()).set(handler, 'add');
    } else if (!this._handlers.includes(handler)) {
      this._handlers.push(handler);
    }

    return this;
  }

  /**
   * Register a listener that auto-removes itself after the first dispatch.
   * The internal wrapper reference differs from `handler`, so calling
   * {@link Signal.remove} with the original `handler` reference does NOT
   * remove it - use {@link Signal.clear} to undo a `once` registration.
   *
   * The wrapper latches after its first call, so `handler` fires at most
   * once even if the wrapper is still present in `_handlers` for more than
   * one dispatch pass - e.g. a nested dispatch of this same Signal sees the
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

  /**
   * Remove a previously registered handler. No-op if absent, and no-op once
   * {@link Signal.destroy} has been called. See {@link Signal.add} for how a
   * `remove` and a later `add` for the same handler reconcile when both are
   * requested during the same outermost dispatch.
   */
  public remove(handler: SignalHandler<Args>): this {
    if (this._destroyed) {
      return this;
    }

    if (this._dispatchDepth > 0) {
      (this._pendingOps ??= new Map()).set(handler, 'remove');
    } else {
      const index = this._handlers.indexOf(handler);

      if (index !== -1) {
        removeArrayItems(this._handlers, index, 1);
      }
    }

    return this;
  }

  /** Remove every listener. No-op once {@link Signal.destroy} has been called. */
  public clear(): this {
    if (this._destroyed) {
      return this;
    }

    if (this._dispatchDepth > 0) {
      // Every handler currently, actually present in `_handlers` must end
      // up removed, and anything only *pending* addition from earlier in
      // this same dispatch (not yet applied to `_handlers`) must never land
      // - replacing the whole map (rather than layering onto it) discards
      // those pending adds instead of carrying them past the clear.
      this._pendingOps = new Map(this._handlers.map(handler => [handler, 'remove'] as const));
    } else {
      this._handlers.length = 0;
    }

    return this;
  }

  /**
   * Notify every registered listener in registration order. Listeners may
   * safely add or remove themselves or others during dispatch - both kinds
   * of mutation are deferred until after the outermost dispatch completes.
   * A listener that calls {@link Signal.destroy} aborts this dispatch (and
   * every dispatch nested inside it) immediately: no further listener, at
   * any nesting level, is invoked, and any add/remove queued earlier in the
   * now-aborted dispatch(es) is discarded rather than applied.
   */
  public dispatch(...params: Args): this {
    const length = this._handlers.length;

    if (!length) {
      return this;
    }

    this._dispatchDepth++;

    try {
      for (let i = 0; i < length; i++) {
        // Checked every iteration (not just once) so a `destroy()` called by
        // an earlier listener in *this* pass - or by a listener several
        // nested-dispatch frames down, unwinding back up through every
        // enclosing loop on the call stack - stops each of those loops
        // before it can index into `_handlers`, which `destroy()` has
        // already emptied. Without this, the loop below would throw
        // (`this._handlers[i]` no longer a function) instead of terminating
        // cleanly.
        if (this._destroyed) {
          break;
        }

        this._handlers[i]!(...params);
      }
    } finally {
      // A normal dispatch deliberately propagates listener exceptions, but
      // the emitter's own bookkeeping must never remain stuck in its
      // mid-dispatch state when that happens. A listener that dispatches
      // this same Signal again nests another call here - the depth counter
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
   * abort the whole dispatch - used for lifecycle signals
   * (`Scene.onActivate`/`onSuspend`, `SceneDirector.onStateChange`/
   * `onChangeScene`/`onStartScene`/`onStopScene`) where a listener must
   * never be able to abort a state transition that already happened, or
   * silently prevent every listener registered after it from running.
   *
   * A throwing listener is reported to `onError` (itself guarded - a
   * throwing `onError` callback never propagates back into this dispatch)
   * and dispatch continues to the remaining listeners. A listener that calls
   * {@link Signal.destroy} still aborts this dispatch immediately, the same
   * as in {@link Signal.dispatch} - destruction is not a "throw" `onError`
   * can observe or recover from.
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
        if (this._destroyed) {
          break;
        }

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

  /**
   * Apply every deferred `add`/`remove`/`clear` once the outermost dispatch
   * has finished - each handler's *last* requested op wins, resolved against
   * whatever `_handlers` actually contains at this point (unchanged since
   * before the outermost dispatch began).
   */
  private _flushPending(): void {
    if (this._pendingOps === null) {
      return;
    }

    for (const [handler, op] of this._pendingOps) {
      const index = this._handlers.indexOf(handler);

      if (op === 'add') {
        if (index === -1) {
          this._handlers.push(handler);
        }
      } else if (index !== -1) {
        removeArrayItems(this._handlers, index, 1);
      }
    }

    this._pendingOps = null;
  }

  /**
   * Permanently empty and disable this Signal. Idempotent - calling it more
   * than once, or on an already-empty Signal, is safe. `add`/`remove`/
   * `clear` become no-ops afterward.
   *
   * Safe to call from inside a listener while this Signal is dispatching:
   * the dispatch that triggered it (and every dispatch nested inside it on
   * the same call stack) terminates immediately after - no further
   * listener, at any nesting level, is invoked, and any add/remove queued
   * earlier in the now-aborted dispatch(es) is discarded rather than
   * applied once the call stack unwinds.
   */
  public destroy(): void {
    this._destroyed = true;
    this._handlers.length = 0;
    this._pendingOps = null;
  }
}
