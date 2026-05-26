import { Signal } from '@/core/Signal';

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
    const received: [number, string][] = [];

    signal.add((value, label) => {
      received.push([value, label]);
    });
    signal.dispatch(42, 'hello');

    expect(received).toEqual([[42, 'hello']]);
  });
});
