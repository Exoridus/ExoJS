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

    const b = (): void => calls.push('b');
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

    const b = (): void => calls.push('b');
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

  it('a nested dispatch() combined with once() during dispatch flushes the self-removal exactly once, after the outermost dispatch', () => {
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

    // The once wrapper is still present in `_handlers` for both the nested
    // and the outer pass (its self-removal is deferred while depth > 0), so
    // it fires from both — the same "outer dispatch still sees the listener
    // set it started with" guarantee as the plain `remove()` case.
    expect(calls).toEqual(['a', 'a', 'once', 'once']);
    expect(onceHandler).toHaveBeenCalledTimes(2);
    // Despite firing twice, the wrapper's self-removal only ever lands once
    // in `_handlers` — a repeated `indexOf` after the first splice is a
    // guaranteed no-op, so the depth-0 flush leaves exactly `a` behind.
    expect(signal.count).toBe(1);
  });

  it('mixing dispatch() and dispatchIsolated() nesting shares the same depth counter', () => {
    const signal = new Signal();
    const calls: string[] = [];
    let nested = false;

    const b = (): void => calls.push('b');
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

  it('_dispatching is always cleared via finally, even after a throw — remove()/add() work normally afterward', () => {
    const signal = new Signal();
    const thrower = (): void => {
      throw new Error('boom');
    };

    signal.add(thrower);
    signal.dispatchIsolated(() => {});

    expect(signal.has(thrower)).toBe(true); // isolation does not remove the listener

    signal.remove(thrower);
    expect(signal.has(thrower)).toBe(false); // removal applies immediately — proves _dispatching was cleared, not left stuck true (which would defer this removal into _pendingRemoves instead)

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
