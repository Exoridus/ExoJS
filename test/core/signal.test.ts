import { Signal } from '@/core/Signal';

describe('Signal', () => {
    it('dispatches to every binding even when handlers mutate _bindings mid-iteration', () => {
        const signal = new Signal();
        const calls: Array<string> = [];

        signal.once(() => { calls.push('a'); });
        signal.once(() => { calls.push('b'); });
        signal.once(() => { calls.push('c'); });

        signal.dispatch();

        expect(calls).toEqual(['a', 'b', 'c']);
        expect(signal.bindings).toHaveLength(0);
    });

    it('stops dispatching when a handler returns false', () => {
        const signal = new Signal();
        const calls: Array<string> = [];

        signal.add(() => { calls.push('a'); });
        signal.add(() => { calls.push('b'); return false; });
        signal.add(() => { calls.push('c'); });

        signal.dispatch();

        expect(calls).toEqual(['a', 'b']);
    });

    it('forwards arguments to handlers', () => {
        const signal = new Signal<[number, string]>();
        const received: Array<[number, string]> = [];

        signal.add((value, label) => { received.push([value, label]); });
        signal.dispatch(42, 'hello');

        expect(received).toEqual([[42, 'hello']]);
    });
});
