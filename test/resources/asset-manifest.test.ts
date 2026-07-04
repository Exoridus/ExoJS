import type { AssetManifest } from '#resources/AssetManifest';
import { BundleLoadError, defineAssetManifest } from '#resources/AssetManifest';
import { TextAsset } from '#resources/tokens';

class DummyAsset {}

describe('defineAssetManifest', () => {
  test('valid manifest passes through unchanged', () => {
    const manifest = {
      bundles: {
        boot: [
          { type: TextAsset, alias: 'intro', path: 'intro.txt' },
          { type: DummyAsset, alias: 'dummy', path: 'dummy.bin', options: { mode: 'fast' } },
        ],
      },
    } as const;

    const result = defineAssetManifest(manifest);

    expect(result).toBe(manifest);
  });

  test('empty manifest is allowed', () => {
    expect(() => defineAssetManifest({ bundles: {} })).not.toThrow();
  });

  test('invalid bundle name throws', () => {
    const manifest = {
      bundles: {
        '   ': [],
      },
    } as unknown as AssetManifest;

    expect(() => defineAssetManifest(manifest)).toThrow('bundle names');
  });

  test('invalid or missing entry fields throw', () => {
    const missingType = {
      bundles: {
        boot: [{ alias: 'intro', path: 'intro.txt' }],
      },
    } as unknown as AssetManifest;
    const emptyAlias = {
      bundles: {
        boot: [{ type: TextAsset, alias: '   ', path: 'intro.txt' }],
      },
    } as unknown as AssetManifest;
    const emptyPath = {
      bundles: {
        boot: [{ type: TextAsset, alias: 'intro', path: '' }],
      },
    } as unknown as AssetManifest;

    expect(() => defineAssetManifest(missingType)).toThrow('entry[0]');
    expect(() => defineAssetManifest(emptyAlias)).toThrow('"alias"');
    expect(() => defineAssetManifest(emptyPath)).toThrow('"path"');
  });

  test('duplicate (type, alias) within a bundle throws', () => {
    const manifest = {
      bundles: {
        boot: [
          { type: TextAsset, alias: 'hero', path: 'hero-a.txt' },
          { type: TextAsset, alias: 'hero', path: 'hero-b.txt' },
        ],
      },
    } as unknown as AssetManifest;

    expect(() => defineAssetManifest(manifest)).toThrow('duplicate');
  });

  test('a non-object manifest throws', () => {
    expect(() => defineAssetManifest(null as unknown as AssetManifest)).toThrow('manifest must be an object');
  });

  test('a non-object "bundles" field throws', () => {
    const manifest = { bundles: 'nope' } as unknown as AssetManifest;

    expect(() => defineAssetManifest(manifest)).toThrow('manifest.bundles must be an object');
  });

  test('a bundle whose value is not an array throws', () => {
    const manifest = { bundles: { boot: 'nope' } } as unknown as AssetManifest;

    expect(() => defineAssetManifest(manifest)).toThrow('must be an array of entries');
  });

  test('a non-object entry throws', () => {
    const manifest = { bundles: { boot: [42] } } as unknown as AssetManifest;

    expect(() => defineAssetManifest(manifest)).toThrow('entry[0] must be an object');
  });

  test('duplicate alias with an anonymous type constructor labels it "(anonymous type)"', () => {
    // A class returned from a function expression gets no name via JS's
    // named-evaluation rules (unlike `class Foo {}` or `const Foo = class {}`).
    const AnonType = (() => class {})();
    const manifest = {
      bundles: {
        boot: [
          { type: AnonType, alias: 'x', path: 'a.txt' },
          { type: AnonType, alias: 'x', path: 'b.txt' },
        ],
      },
    } as unknown as AssetManifest;

    expect(AnonType.name).toBe('');
    expect(() => defineAssetManifest(manifest)).toThrow('(anonymous type)');
  });
});

describe('BundleLoadError', () => {
  test('pluralizes the failure count in its message for zero and multiple failures', () => {
    const zero = new BundleLoadError('boot', []);
    const two = new BundleLoadError('boot', [
      { type: TextAsset, alias: 'a', error: new Error('x') },
      { type: TextAsset, alias: 'b', error: new Error('y') },
    ]);

    expect(zero.message).toBe('Failed to load bundle "boot" (0 failures).');
    expect(two.message).toBe('Failed to load bundle "boot" (2 failures).');
    expect(zero.name).toBe('BundleLoadError');
    expect(two.failures).toHaveLength(2);
  });

  test('does not pluralize the message for exactly one failure', () => {
    const one = new BundleLoadError('boot', [{ type: TextAsset, alias: 'a', error: new Error('x') }]);

    expect(one.message).toBe('Failed to load bundle "boot" (1 failure).');
  });
});
