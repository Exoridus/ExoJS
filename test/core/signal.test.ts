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

  it('stops dispatching when a handler returns false', () => {
    const signal = new Signal();
    const calls: string[] = [];

    signal.add(() => {
      calls.push('a');
    });
    signal.add(() => {
      calls.push('b');
      return false;
    });
    signal.add(() => {
      calls.push('c');
    });

    signal.dispatch();

    expect(calls).toEqual(['a', 'b']);
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

  it('a handler returning false still short-circuits the remaining listeners (unaffected by isolation)', () => {
    const signal = new Signal();
    const calls: string[] = [];

    signal.add(() => {
      calls.push('a');

      return false;
    });
    signal.add(() => calls.push('b'));

    signal.dispatchIsolated(() => {});

    expect(calls).toEqual(['a']);
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
