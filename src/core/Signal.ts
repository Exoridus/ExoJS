import { removeArrayItems } from '@/core/utils';

/**
 * Listener function for a {@link Signal}. Returning `false` from a handler
 * stops further dispatch to remaining listeners for the current invocation
 * (subsequent dispatches are unaffected).
 */
type SignalHandler<Args extends Array<unknown>> = (...params: Args) => void | boolean;

interface SignalBinding<Args extends Array<unknown>> {
    handler: SignalHandler<Args>;
    context?: object;
}

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
 * `dispatch` snapshots the bindings list before iterating, so handlers may
 * freely add or remove listeners during the same dispatch without corrupting
 * the loop. Returning `false` from a handler short-circuits the rest of the
 * dispatch (handy for capturing-style flows).
 */
export class Signal<Args extends Array<unknown> = []> {

    private readonly _bindings = new Array<SignalBinding<Args>>();

    public get bindings(): ReadonlyArray<SignalBinding<Args>> {
        return this._bindings;
    }

    /** `true` when `handler` is registered with the same `context`. */
    public has(handler: SignalHandler<Args>, context?: object): boolean {
        return this._bindings.some((binding) => (binding.handler === handler && binding.context === context));
    }

    /**
     * Register a listener. Idempotent — adding the same `(handler, context)`
     * pair twice is a no-op. `context` becomes `this` inside the handler.
     */
    public add(handler: SignalHandler<Args>, context?: object): this {
        if (!this.has(handler, context)) {
            this._bindings.push({ handler, context });
        }

        return this;
    }

    /**
     * Register a listener that auto-removes itself after the first dispatch.
     * Wraps `handler` in a self-removing closure; calling
     * {@link Signal.remove} with the original `handler` reference does NOT
     * remove the wrapper — use {@link Signal.clear} or
     * {@link Signal.clearByContext} to undo a `once` registration.
     */
    public once(handler: SignalHandler<Args>, context?: object): this {
        const once = (...params: Args): void => {
            this.remove(once, context);
            handler.call(context, ...params);
        };

        this.add(once, context);

        return this;
    }

    /** Remove a previously registered `(handler, context)` pair. No-op if absent. */
    public remove(handler: SignalHandler<Args>, context?: object): this {
        const index = this._bindings.findIndex((binding) => (binding.handler === handler && binding.context === context));

        if (index !== -1) {
            removeArrayItems(this._bindings, index, 1);
        }

        return this;
    }

    /**
     * Remove every listener bound to `context`. Useful when an object is
     * being torn down and needs to detach all its subscriptions in one call.
     */
    public clearByContext(context?: object): this {
        const bindings = this._bindings.filter(binding => binding.context === context);

        for (const binding of bindings) {
            removeArrayItems(this._bindings, this._bindings.indexOf(binding), 1);
        }

        return this;
    }

    /** Remove every listener. */
    public clear(): this {
        this._bindings.length = 0;

        return this;
    }

    /**
     * Notify every registered listener in registration order. Returning `false`
     * from a handler stops dispatch to the remaining listeners for this call.
     * Listeners may safely add/remove bindings during dispatch — the iteration
     * uses a pre-snapshot of the bindings array.
     */
    public dispatch(...params: Args): this {
        if (this._bindings.length) {
            // Snapshot bindings because handlers may mutate the array mid-dispatch
            // (notably `once()` wrappers that remove themselves), which would otherwise
            // cause the iterator to skip the binding shifted into the vacated slot.
            const bindings = this._bindings.slice();

            for (const binding of bindings) {
                if (binding.handler.call(binding.context, ...params) === false) {
                    break;
                }
            }
        }

        return this;
    }

    public destroy(): void {
        this.clear();
    }
}
