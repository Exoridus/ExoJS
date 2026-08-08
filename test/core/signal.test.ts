import { Signal } from '#core/Signal';

describe('Signal type-level assertions', () => {
  it('dispatch parameters match the Args tuple', () => {
    expectTypeOf(new Signal<[number, string]>().dispatch).parameter(0).toBeNumber();
    expectTypeOf(new Signal<[number, string]>().dispatch).parameter(1).toBeString();
  });

  it('Signal<[]> dispatch takes no parameters', () => {
    expectTypeOf(new Signal<[]>().dispatch).parameters.toEqualTypeOf<[]>();
  });

  it('dispatch is a function', () => {
    expectTypeOf(new Signal<[number]>().dispatch).toBeFunction();
  });

  it('count is a number', () => {
    expectTypeOf(new Signal<[boolean]>().count).toBeNumber();
  });

  it('has returns boolean', () => {
    expectTypeOf(new Signal<[number]>().has).returns.toBeBoolean();
  });

  it('add, remove, clear return this for chaining', () => {
    const sig = new Signal<[]>();
    expectTypeOf(sig.add).returns.toEqualTypeOf(sig);
    expectTypeOf(sig.remove).returns.toEqualTypeOf(sig);
    expectTypeOf(sig.clear).returns.toEqualTypeOf(sig);
  });
});

describe('Signal', () => {
  it('dispatches to every binding even when handlers mutate _bindings mid-iteration', () => {
    const signal = new Signal();
    const calls: string[] = [];

    signal.once(() => {
      calls.push('a');
    });
    signal.once(() => {
      calls.push('b');
    });
    signal.once(() => {
      calls.push('c');
    });

    signal.dispatch();

    expect(calls).toEqual(['a', 'b', 'c']);
    expect(signal.count).toBe(0);
  });

  it('notifies every listener regardless of what a handler returns', () => {
    const signal = new Signal();
    const calls: string[] = [];

    signal.add(() => {
      calls.push('a');
    });
    signal.add(() => {
      calls.push('b');
    });
    signal.add(() => {
      calls.push('c');
    });

    signal.dispatch();

    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('forwards arguments to handlers', () => {
    const signal = new Signal<[number, string]>();
    const received: Array<[number, string]> = [];

    signal.add((value, label) => {
      received.push([value, label]);
    });
    signal.dispatch(42, 'hello');

    expect(received).toEqual([[42, 'hello']]);
  });

  it('restores normal dispatch bookkeeping when a listener throws', () => {
    const signal = new Signal();
    const thrower = (): void => {
      signal.remove(thrower);
      throw new Error('boom');
    };

    signal.add(thrower);

    expect(() => signal.dispatch()).toThrow('boom');

    // The self-removal was deferred while dispatching, but must have been
    // flushed by finally even though the listener aborted dispatch.
    expect(signal.has(thrower)).toBe(false);

    const survivor = vi.fn();

    signal.add(survivor);
    expect(() => signal.dispatch()).not.toThrow();
    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it('a nested dispatch() on the same Signal does not flush the outer dispatch early', () => {
    // Regression: a boolean re-entrancy guard would have the inner
    // dispatch's `finally` clear the flag as it returns, so the still-running
    // outer loop below would see the guard cleared and flush pending
    // removals mid-iteration instead of after the outer dispatch completes.
    const signal = new Signal();
    const calls: string[] = [];
    let nested = false;

    const b = (): void => void calls.push('b');
    const a = (): void => {
      calls.push('a');

      if (!nested) {
        nested = true;
        signal.remove(b);
        signal.dispatch(); // nested dispatch — must not flush `b`'s removal yet
      }
    };

    signal.add(a);
    signal.add(b);
    signal.dispatch();

    // Neither the nested dispatch nor the outer dispatch mutate `_handlers`
    // itself while depth > 0, so both loops still walk the full [a, b] they
    // started with: the nested dispatch reaches `b` once, then the outer
    // loop's own iteration (resumed after `a` returns) reaches it again —
    // proving the outer dispatch still sees the listener set it started
    // with instead of a set truncated by an early flush.
    expect(calls).toEqual(['a', 'a', 'b', 'b']);
    // The removal itself still lands exactly once, only after the
    // outermost dispatch's `finally` runs.
    expect(signal.has(b)).toBe(false);
    expect(signal.count).toBe(1);
  });

  it('a nested dispatch() combined with clear() during dispatch defers the clear to the outermost dispatch', () => {
    const signal = new Signal();
    const calls: string[] = [];
    let nested = false;

    const b = (): void => void calls.push('b');
    const a = (): void => {
      calls.push('a');

      if (!nested) {
        nested = true;
        signal.clear();
        signal.dispatch();
      }
    };

    signal.add(a);
    signal.add(b);
    signal.dispatch();

    // Same reasoning as the `remove()` case above: `clear()` only snapshots
    // pending removals while depth > 0, it does not touch `_handlers`, so
    // both the nested and the outer loop still run over [a, b] in full.
    expect(calls).toEqual(['a', 'a', 'b', 'b']);
    expect(signal.count).toBe(0);
  });

  it('a nested dispatch() combined with once() during dispatch still fires the handler at most once', () => {
    // Regression: the once wrapper stays in `_handlers` for both the nested
    // and the outer pass (its self-removal is deferred while depth > 0, same
    // as the plain `remove()` case above), so without an internal "already
    // fired" latch the wrapper itself would run twice and call `handler`
    // twice — quietly breaking the "once" contract instead of the old code's
    // loud crash. The latch inside the wrapper must make the second
    // invocation a no-op.
    const signal = new Signal();
    const calls: string[] = [];
    let nested = false;

    const onceHandler = vi.fn(() => calls.push('once'));

    const a = (): void => {
      calls.push('a');

      if (!nested) {
        nested = true;
        signal.dispatch(); // nested dispatch — triggers the once wrapper before the outer loop reaches it too
      }
    };

    signal.add(a);
    signal.once(onceHandler);
    signal.dispatch();

    // `a` still runs twice (nested + outer pass, same as every other test in
    // this block), but `handler` itself only ever runs once.
    expect(calls).toEqual(['a', 'a', 'once']);
    expect(onceHandler).toHaveBeenCalledTimes(1);
    // The wrapper's self-removal lands exactly once, leaving only `a` behind.
    expect(signal.count).toBe(1);
  });

  it('mixing dispatch() and dispatchIsolated() nesting shares the same depth counter', () => {
    const signal = new Signal();
    const calls: string[] = [];
    let nested = false;

    const b = (): void => void calls.push('b');
    const a = (): void => {
      calls.push('a');

      if (!nested) {
        nested = true;
        signal.remove(b);
        signal.dispatchIsolated(() => {}); // nested isolated dispatch inside a normal dispatch
      }
    };

    signal.add(a);
    signal.add(b);
    signal.dispatch();

    expect(calls).toEqual(['a', 'a', 'b', 'b']);
    expect(signal.has(b)).toBe(false);
    expect(signal.count).toBe(1);
  });

  it('add() during dispatch defers registration to the next dispatch — not even a nested dispatch of the same Signal sees it early', () => {
    const signal = new Signal();
    const calls: string[] = [];
    let nested = false;

    const c = (): void => void calls.push('c');
    const a = (): void => {
      calls.push('a');

      if (!nested) {
        nested = true;
        signal.add(c);
        signal.dispatch(); // nested dispatch — `c` must not fire here either
      }
    };

    signal.add(a);
    signal.dispatch();

    // Neither the nested dispatch nor the rest of the outer dispatch invoke
    // `c` — it was added mid-dispatch, so it only takes effect once this
    // outermost dispatch has fully returned.
    expect(calls).toEqual(['a', 'a']);
    // The add itself did land, just deferred — `c` is registered now...
    expect(signal.has(c)).toBe(true);

    calls.length = 0;
    signal.dispatch();
    // ...and fires starting with the very next dispatch.
    expect(calls).toEqual(['a', 'c']);
  });

  it('add() of the same handler twice during dispatch is still idempotent', () => {
    const signal = new Signal();
    const calls: string[] = [];
    const b = (): void => void calls.push('b');
    let addCount = 0;

    const a = (): void => {
      calls.push('a');
      addCount++;

      if (addCount <= 2) {
        signal.add(b);
      }
    };

    signal.add(a);
    signal.dispatch(); // `a` calls add(b) once while depth > 0 — must not queue duplicate pending adds

    expect(signal.count).toBe(2);

    calls.length = 0;
    signal.dispatch();
    expect(calls).toEqual(['a', 'b']); // `b` present exactly once, not duplicated
  });

  it('remove() then add() for the same handler within one dispatch nets to "still registered"', () => {
    // Regression: add() used to consult the un-flushed `_handlers` array —
    // still physically containing `h` while depth > 0 — and treat that as
    // "already registered, nothing to do", so it queued no pending op. The
    // later flush then only saw the pending remove and dropped `h` for good,
    // even though the caller's last word on `h` was "add it back".
    const signal = new Signal();
    const calls: string[] = [];
    const h = (): void => void calls.push('h');
    const trigger = (): void => {
      calls.push('trigger');
      signal.remove(h);
      signal.add(h);
    };

    signal.add(trigger);
    signal.add(h);
    signal.dispatch(); // `h` is still in the handler set dispatch() started with, so it still fires this pass

    expect(calls).toEqual(['trigger', 'h']);
    expect(signal.has(h)).toBe(true); // net effect of remove-then-add: still registered

    calls.length = 0;
    signal.dispatch();
    expect(calls).toEqual(['trigger', 'h']); // and it keeps firing on subsequent dispatches
  });

  it('add() then remove() for the same (not-yet-present) handler within one dispatch nets to "never registered"', () => {
    const signal = new Signal();
    const calls: string[] = [];
    const h = (): void => void calls.push('h');
    const trigger = (): void => {
      calls.push('trigger');
      signal.add(h);
      signal.remove(h);
    };

    signal.add(trigger);
    signal.dispatch();

    expect(calls).toEqual(['trigger']);
    expect(signal.has(h)).toBe(false);
    expect(signal.count).toBe(1); // only `trigger`
  });

  it('clear() during dispatch discards a pending add queued earlier in the same dispatch', () => {
    const signal = new Signal();
    const calls: string[] = [];
    const c = (): void => void calls.push('c');
    const trigger = (): void => {
      calls.push('trigger');
      signal.add(c);
      signal.clear();
    };

    signal.add(trigger);
    signal.dispatch();

    expect(signal.count).toBe(0); // clear() wins — `c` never lands, `trigger` is gone too

    calls.length = 0;
    signal.dispatch();
    expect(calls).toEqual([]);
  });

  it('destroy() called from a listener aborts the dispatch instead of throwing, and remaining listeners do not run', () => {
    // Regression: destroy() emptied `_handlers` in place while dispatch()
    // was still iterating a pre-captured `length`, so the very next
    // iteration indexed past the (now truncated-to-empty) array and threw
    // `this._handlers[i] is not a function`.
    const signal = new Signal();
    const calls: string[] = [];

    signal.add(() => {
      calls.push('a');
      signal.destroy();
    });
    signal.add(() => calls.push('b')); // must NOT run — destroy() happened first
    signal.add(() => calls.push('c')); // must NOT run either

    expect(() => signal.dispatch()).not.toThrow();
    expect(calls).toEqual(['a']);
    expect(signal.count).toBe(0);

    // The signal is left destroyed, not merely emptied — further mutation
    // is inert rather than resurrecting it.
    signal.add(() => calls.push('resurrected'));
    expect(signal.count).toBe(0);
    expect(() => signal.dispatch()).not.toThrow();
    expect(calls).toEqual(['a']);
  });

  it('destroy() called from a nested dispatch unwinds every enclosing dispatch on the same Signal cleanly', () => {
    const signal = new Signal();
    const calls: string[] = [];
    let nested = false;

    const c = (): void => void calls.push('c'); // registered after `a`/`b` — must never run once destroyed
    const b = (): void => {
      calls.push('b');
      signal.destroy(); // called from inside a *nested* dispatch frame
    };
    const a = (): void => {
      calls.push('a');

      if (!nested) {
        nested = true;
        signal.dispatch(); // nested dispatch — `b` (and destroy()) run inside this
      }
    };

    signal.add(a);
    signal.add(b);
    signal.add(c);

    expect(() => signal.dispatch()).not.toThrow();

    // Nested dispatch: a, a (re-entrant), b (destroys) — both the nested
    // loop (at its next index) and the outer loop (resumed after `a`
    // returns) see `_destroyed` and stop before ever reaching `c`.
    expect(calls).toEqual(['a', 'a', 'b']);
    expect(signal.count).toBe(0);
  });
});

describe('dispatchIsolated', () => {
  it('calls onError and continues to the remaining listeners when one throws', () => {
    const signal = new Signal();
    const calls: string[] = [];
    const errors: unknown[] = [];
    const failure = new Error('listener boom');

    signal.add(() => calls.push('a'));
    signal.add(() => {
      throw failure;
    });
    signal.add(() => calls.push('c'));

    signal.dispatchIsolated(error => errors.push(error));

    expect(calls).toEqual(['a', 'c']);
    expect(errors).toEqual([failure]);
  });

  it('a throwing onError itself never propagates out of dispatchIsolated', () => {
    const signal = new Signal();

    signal.add(() => {
      throw new Error('listener boom');
    });

    expect(() =>
      signal.dispatchIsolated(() => {
        throw new Error('onError boom');
      }),
    ).not.toThrow();
  });

  it('notifies every listener regardless of what a handler returns', () => {
    const signal = new Signal();
    const calls: string[] = [];

    signal.add(() => {
      calls.push('a');
    });
    signal.add(() => {
      calls.push('b');
    });

    signal.dispatchIsolated(() => {});

    expect(calls).toEqual(['a', 'b']);
  });

  it('_dispatchDepth is always cleared via finally, even after a throw — remove()/add() work normally afterward', () => {
    const signal = new Signal();
    const thrower = (): void => {
      throw new Error('boom');
    };

    signal.add(thrower);
    signal.dispatchIsolated(() => {});

    expect(signal.has(thrower)).toBe(true); // isolation does not remove the listener

    signal.remove(thrower);
    expect(signal.has(thrower)).toBe(false); // removal applies immediately — proves _dispatchDepth was decremented back to 0, not left stuck above 0 (which would defer this removal into _pendingOps instead)

    const calls: string[] = [];

    signal.add(() => calls.push('second-dispatch-listener'));
    signal.dispatch();

    expect(calls).toEqual(['second-dispatch-listener']);
  });

  it('a listener removing itself mid-dispatch (via isolated dispatch) is still deferred correctly', () => {
    const signal = new Signal();
    const calls: string[] = [];
    const selfRemoving: () => void = () => {
      calls.push('self');
      signal.remove(selfRemoving);
    };

    signal.add(selfRemoving);
    signal.add(() => calls.push('other'));

    signal.dispatchIsolated(() => {});
    expect(calls).toEqual(['self', 'other']);
    expect(signal.has(selfRemoving)).toBe(false);

    calls.length = 0;
    signal.dispatchIsolated(() => {});
    expect(calls).toEqual(['other']);
  });

  it('returns this for chaining', () => {
    const signal = new Signal();

    expect(signal.dispatchIsolated(() => {})).toBe(signal);
  });

  it('is a no-op (does not call onError) when there are no listeners', () => {
    const signal = new Signal();
    const onError = vi.fn();

    signal.dispatchIsolated(onError);

    expect(onError).not.toHaveBeenCalled();
  });
});
