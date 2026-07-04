import { Asset } from '#resources/Asset';
import { Assets } from '#resources/Assets';

describe('Assets', () => {
  test('wraps plain configs in Asset instances exposed as direct properties and via entries', () => {
    const bag = new Assets({
      logo: { type: 'texture', source: '/logo.png' },
    });

    expect(bag.logo.source).toBe('/logo.png');
    expect(bag.logo.type).toBe('texture');
    expect(bag.entries.logo).toBe(bag.logo);
  });

  test('passes through an already-constructed Asset instance unchanged', () => {
    const existing = new Asset({ type: 'texture', source: '/shared.png' });
    const bag = new Assets({ logo: existing });

    expect(bag.logo).toBe(existing);
    expect(bag.entries.logo).toBe(existing);
  });

  test('rejects a definition that defines a reserved "entries" key', () => {
    expect(() => new Assets({ entries: { type: 'texture', source: '/x.png' } } as never)).toThrow(/reserved/);
  });
});
