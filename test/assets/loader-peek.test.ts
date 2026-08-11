import { Asset } from '#assets/Asset';
import { coreAssetBindings } from '#assets/coreAssetBindings';
import { Loader } from '#assets/Loader';
import { materializeAssetBindings } from '#extensions/materialize';

/** Loader with all core asset bindings (mirrors createCoreLoader in the sibling loader tests). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

function mockFetchJson(payload: unknown): void {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );
}

// `get()` is an acquiring call: it resolves, claims, and starts a fetch when the
// source is unknown. `peek()` is the pure lookup that was missing next to it —
// the way to ask "is this already here?" without any of those side effects.
describe('Loader.peek — pure in-memory lookup', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns undefined for a source that was never loaded', () => {
    const loader = createCoreLoader();
    mockFetchJson({ ok: true });

    expect(loader.peek('data/config.json')).toBeUndefined();

    loader.destroy();
  });

  test('starts no fetch, unlike get()', () => {
    const loader = createCoreLoader();
    mockFetchJson({ ok: true });

    loader.peek('data/config.json');
    loader.peek('data/config.json');

    expect(global.fetch).not.toHaveBeenCalled();

    // The contrast that makes the point: the same call through get() does fetch.
    loader.get('data/config.json');

    expect(global.fetch).toHaveBeenCalledTimes(1);

    loader.destroy();
  });

  test('claims nothing, so it cannot keep an asset resident by accident', () => {
    const loader = createCoreLoader();
    mockFetchJson({ ok: true });

    loader.peek('data/config.json');

    expect(loader.inspect()).toEqual([]);

    // Teeth for the assertion above: get() on the very same source does
    // produce a residency row, so an empty inspect() is a real signal rather
    // than a check that can never fail.
    loader.get('data/config.json');

    expect(loader.inspect()).not.toEqual([]);

    loader.destroy();
  });

  test('returns the stored resource once the source is loaded', async () => {
    const loader = createCoreLoader();
    mockFetchJson({ level: 3 });

    await loader.load('data/config.json');

    expect(loader.peek('data/config.json')).toEqual({ level: 3 });

    loader.destroy();
  });

  test('accepts an Asset.type(...) descriptor for the same lookup', async () => {
    const loader = createCoreLoader();
    mockFetchJson({ level: 3 });

    expect(loader.peek(Asset.type('json', 'data/config.json'))).toBeUndefined();

    await loader.load('data/config.json');

    expect(loader.peek(Asset.type('json', 'data/config.json'))).toEqual({ level: 3 });

    loader.destroy();
  });

  // Invalid usage fails loudly exactly as it does on get(); only "the key is
  // fine, nothing stored under it" is the undefined case.
  // Both of these are rejected at compile time by the overloads too — an
  // unregistered extension resolves `KindByPath` to `never`, and a plain object
  // matches no overload. The runtime guards are what a JavaScript consumer, a
  // dynamic string, or a `registerType` gap runs into, so they get their own
  // coverage through a loosened view of the method.
  const untyped = (loader: Loader): { peek(input: unknown): unknown } => loader as unknown as { peek(input: unknown): unknown };

  test('throws for a path whose extension resolves to no registered type', () => {
    const loader = createCoreLoader();

    expect(() => untyped(loader).peek('data/config.unknownext')).toThrow(/no type registered/i);

    loader.destroy();
  });

  test('throws for an input that is neither a path nor a descriptor', () => {
    const loader = createCoreLoader();

    expect(() => untyped(loader).peek({ not: 'an asset' })).toThrow(/path string or an Asset\.type/i);

    loader.destroy();
  });
});
