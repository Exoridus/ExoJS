import type { AssetFactory } from '#resources/AssetFactory';
import { FactoryRegistry } from '#resources/FactoryRegistry';

class Base {}
class Derived extends Base {}

function makeFactory(): AssetFactory {
  return {
    storageName: 'test',
    process: vi.fn(),
    create: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('FactoryRegistry', () => {
  test('resolve() throws a descriptive error for an unregistered type', () => {
    const registry = new FactoryRegistry();

    expect(() => registry.resolve(Base)).toThrow(/No factory registered for Base/);
  });

  test('resolve() returns the exact factory registered for a type', () => {
    const registry = new FactoryRegistry();
    const factory = makeFactory();

    registry.register(Base, factory);

    expect(registry.resolve(Base)).toBe(factory);
  });

  test('resolve() walks the prototype chain to find an ancestor factory', () => {
    const registry = new FactoryRegistry();
    const factory = makeFactory();

    registry.register(Base, factory);

    expect(registry.resolve(Derived)).toBe(factory);
  });

  test('has() reflects registration including via prototype-chain walk', () => {
    const registry = new FactoryRegistry();

    expect(registry.has(Base)).toBe(false);

    registry.register(Base, makeFactory());

    expect(registry.has(Base)).toBe(true);
    expect(registry.has(Derived)).toBe(true);
  });

  test('destroy() disposes every registered factory and clears the registry', () => {
    const registry = new FactoryRegistry();
    const factory = makeFactory();

    registry.register(Base, factory);
    registry.destroy();

    expect(factory.destroy).toHaveBeenCalledTimes(1);
    expect(registry.has(Base)).toBe(false);
    expect(() => registry.resolve(Base)).toThrow(/No factory registered for Base/);
  });
});
