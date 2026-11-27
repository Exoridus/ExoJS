import { Registry } from '#core/Registry';

describe('Registry.destroy', () => {
  test('a throwing disposer does not skip later values, and the store is emptied', () => {
    const disposed: string[] = [];
    const registry = new Registry<string, string>({
      dispose: value => {
        disposed.push(value);

        if (value === 'a') {
          throw new Error('dispose a');
        }
      },
    });

    registry.set('x', 'a');
    registry.set('y', 'b');

    expect(() => registry.destroy()).toThrow('dispose a');
    expect(disposed).toEqual(['a', 'b']);
    expect(registry.has('x')).toBe(false);
    expect(registry.has('y')).toBe(false);
  });

  test('several failures surface as one AggregateError', () => {
    const registry = new Registry<string, string>({
      dispose: value => {
        throw new Error(value);
      },
    });

    registry.set('x', 'a');
    registry.set('y', 'b');

    expect(() => registry.destroy()).toThrow(AggregateError);
  });
});
