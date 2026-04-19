import { defineAssetManifest } from '@/resources/AssetManifest';
import { TextAsset } from '@/resources/tokens';
import type { AssetManifest } from '@/resources/AssetManifest';

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
});
