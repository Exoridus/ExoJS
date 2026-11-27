import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

const originalFetch = global.fetch;

const makeLoader = (): Loader => {
  const loader = new Loader();
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

const claimsOf = (loader: Loader): Map<string, unknown> =>
  (loader as unknown as { _residency: { _claims: Map<string, unknown> } })._residency._claims;

const claimCounts = (loader: Loader): Record<string, number> =>
  Object.fromEntries(loader.inspect().map(row => [row.canonicalKey.replace('texture|url:', ''), row.claims]));

describe('scope release cost', () => {
  beforeEach(() => {
    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response,
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4, close: () => undefined })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test.each([100, 1000, 5000])('destroying %i single-claim scopes never walks the claim map', count => {
    const loader = makeLoader();
    const claims = claimsOf(loader);
    const scopes = Array.from({ length: count }, (_, index) => {
      const scope = loader.createScope();
      scope.get(`asset-${index}.png`);

      return scope;
    });

    expect(claims.size).toBe(count);

    const walks = [Symbol.iterator, 'entries', 'keys', 'values', 'forEach'].map(name => vi.spyOn(claims, name as 'entries'));
    const lookups = vi.spyOn(claims, 'get');

    for (const scope of scopes) {
      scope.destroy();
    }

    expect(walks.reduce((total, spy) => total + spy.mock.calls.length, 0)).toBe(0);
    expect(lookups.mock.calls.length).toBeLessThanOrEqual(count * 2);
    expect(claims.size).toBe(0);

    loader.destroy();
  });

  test('a shared asset stays claimed until its last owner releases it', () => {
    const loader = makeLoader();
    const first = loader.createScope();
    const second = loader.createScope();
    const own = first.createScope();

    first.get('shared.png');
    second.get('shared.png');
    own.get('own.png');
    expect(claimCounts(loader)).toEqual({ 'shared.png': 2, 'own.png': 1 });

    first.destroy();
    expect(claimCounts(loader)).toEqual({ 'shared.png': 1, 'own.png': 0 });

    second.destroy();
    expect(claimCounts(loader)).toEqual({ 'shared.png': 0, 'own.png': 0 });

    loader.destroy();
  });

  test('an explicit release followed by scope teardown releases once and keeps other claims', () => {
    const loader = makeLoader();
    const scope = loader.createScope();
    const other = loader.createScope();
    const handle = scope.get('a.png');

    scope.get('b.png');
    other.get('a.png');
    expect(claimCounts(loader)).toEqual({ 'a.png': 2, 'b.png': 1 });

    scope.release(handle);
    expect(claimCounts(loader)).toEqual({ 'a.png': 1, 'b.png': 1 });

    scope.destroy();
    expect(claimCounts(loader)).toEqual({ 'a.png': 1, 'b.png': 0 });

    other.destroy();
    expect(claimCounts(loader)).toEqual({ 'a.png': 0, 'b.png': 0 });

    loader.destroy();
  });

  test('a scope that claims again after releasing is released again on teardown', () => {
    const loader = makeLoader();
    const scope = loader.createScope();
    const handle = scope.get('again.png');

    scope.release(handle);
    expect(claimCounts(loader)).toEqual({ 'again.png': 0 });

    scope.get('again.png');
    expect(claimCounts(loader)).toEqual({ 'again.png': 1 });

    scope.destroy();
    expect(claimCounts(loader)).toEqual({ 'again.png': 0 });

    loader.destroy();
  });
});
