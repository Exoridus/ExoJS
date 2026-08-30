import '#assets/coreAssetTypes';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Asset } from '#assets/Asset';
import { _readMeta } from '#assets/assetMeta';
import { AssetRef } from '#assets/AssetRef';
import { _readProvenance, Assets } from '#assets/Assets';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { Sound } from '#audio/Sound';
import { materializeAssetTypes } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

const createCoreLoader = (): Loader => {
  const loader = new Loader();
  const owner = loader.createScope({ name: 'owner' });
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

// jsdom has no audio decoder - mirror the `{ duration }` AudioBuffer stub used
// by the other loader tests (see test/assets/loader-claims.test.ts).
const { decodeAudioDataMock } = vi.hoisted(() => ({
  decodeAudioDataMock: vi.fn(async (): Promise<AudioBuffer> => ({ duration: 2 }) as AudioBuffer),
}));

vi.mock('#audio/audioContext', () => ({
  decodeAudioData: decodeAudioDataMock,
}));

const originalFetch = global.fetch;

const mockFetchAudio = (): void => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => new ArrayBuffer(8),
  })) as unknown as typeof fetch;
};

describe('Assets.compose', () => {
  it('combines conflict-free catalogs into one ordinary catalog', () => {
    const shared = Assets.from({ logo: 'sprites/logo.png', config: 'game.json' });
    const forest = Assets.from({ tree: 'sprites/tree.png' });

    const composed = Assets.compose(shared, forest);

    expect(composed).toBeInstanceOf(Assets);
    expect(Object.keys(composed.entries).sort()).toEqual(['config', 'logo', 'tree']);
    expect(composed.logo).toBeInstanceOf(Texture);
    expect(composed.tree).toBeInstanceOf(Texture);
    expect(composed.config).toBeInstanceOf(AssetRef);
    expect(composed.entries.logo).toBe(composed.logo);
  });

  it('shares the input catalogs leaves instead of re-materializing them', () => {
    const shared = Assets.from({ logo: 'sprites/logo.png' });
    const forest = Assets.from({ tree: 'sprites/tree.png' });

    const composed = Assets.compose(shared, forest);

    expect(composed.logo).toBe(shared.logo);
    expect(composed.tree).toBe(forest.tree);
    expect(_readMeta(composed.logo)).toEqual(_readMeta(shared.logo));
  });

  it('does not mutate its input catalogs', () => {
    const shared = Assets.from({ logo: 'sprites/logo.png' });
    const forest = Assets.from({ tree: 'sprites/tree.png' });

    Assets.compose(shared, forest);

    expect(Object.keys(shared.entries)).toEqual(['logo']);
    expect(Object.keys(forest.entries)).toEqual(['tree']);
    expect((shared as unknown as Record<string, unknown>).tree).toBeUndefined();
  });

  it('throws naming the duplicate key and pointing at extend()', () => {
    const a = Assets.from({ logo: 'sprites/a.png' });
    const b = Assets.from({ logo: 'sprites/b.png' });

    expect(() => Assets.compose(a, b)).toThrow(/duplicate catalog key "logo"/);
    expect(() => Assets.compose(a, b)).toThrow(/use Assets\.extend\(base, \{ \.\.\. \}\) to override it deliberately/);
  });

  it('reports every duplicate key, not just the first', () => {
    const a = Assets.from({ logo: 'sprites/a.png', theme: 'a.ogg' });
    const b = Assets.from({ logo: 'sprites/b.png', theme: 'b.ogg' });

    expect(() => Assets.compose(a, b)).toThrow(/duplicate catalog keys "logo", "theme"/);
  });

  it('treats two distinct catalogs with IDENTICAL entries as two declarations and still conflicts', () => {
    const a = Assets.from({ logo: 'sprites/logo.png' });
    const b = Assets.from({ logo: 'sprites/logo.png' });

    expect(() => Assets.compose(a, b)).toThrow(/duplicate catalog key "logo"/);
  });

  it('deduplicates a diamond: the same catalog reaching the composition twice', () => {
    const shared = Assets.from({ logo: 'sprites/logo.png' });
    const left = Assets.compose(shared, Assets.from({ tree: 'sprites/tree.png' }));
    const right = Assets.compose(shared, Assets.from({ rock: 'sprites/rock.png' }));

    const composed = Assets.compose(left, right);

    expect(Object.keys(composed.entries).sort()).toEqual(['logo', 'rock', 'tree']);
    expect(composed.logo).toBe(shared.logo);
  });

  it('deduplicates a catalog composed with itself', () => {
    const shared = Assets.from({ logo: 'sprites/logo.png' });

    expect(Object.keys(Assets.compose(shared, shared).entries)).toEqual(['logo']);
  });

  it('records provenance without introducing ownership', () => {
    const shared = Assets.from({ logo: 'sprites/logo.png' });
    const forest = Assets.from({ tree: 'sprites/tree.png' });

    const composed = Assets.compose(shared, forest);
    const provenance = _readProvenance(composed)!;

    expect(provenance.kind).toBe('compose');
    expect(provenance.sources).toHaveLength(2);
    expect(provenance.sources[0]).toBe(shared);
    expect(provenance.sources[1]).toBe(forest);
    expect(provenance.overrides).toEqual([]);
    expect(provenance.keyOrigins.get('logo')).toBe(shared);
    expect(provenance.keyOrigins.get('tree')).toBe(forest);
  });

  it('keeps provenance off the catalog itself', () => {
    const shared = Assets.from({ logo: 'sprites/logo.png' });
    const composed = Assets.compose(shared, Assets.from({ tree: 'sprites/tree.png' }));

    // Provenance lives in a module-private store, not on the object: no property,
    // no symbol, nothing a user can reach `keyOrigins` (a mutable Map) through.
    expect(Object.keys(composed).sort()).toEqual(['entries', 'logo', 'tree']);
    expect((composed as unknown as Record<string, unknown>)._provenance).toBeUndefined();
    expect(Object.getOwnPropertyNames(composed)).not.toContain('_provenance');
    expect(Object.getOwnPropertySymbols(composed)).toEqual([]);
  });

  it('reads provenance through the catalog callers hold, dev proxy included', () => {
    const shared = Assets.from({ logo: 'sprites/logo.png' });

    // The dev typo guard hands out a Proxy; provenance must be keyed by THAT
    // object, or composing a composed catalog would lose every inherited origin.
    expect(_readProvenance(shared)?.kind).toBe('from');
    expect(_readProvenance(shared)?.keyOrigins.get('logo')).toBe(shared);
  });

  it('rejects a non-catalog argument', () => {
    expect(() => Assets.compose({ logo: 'sprites/logo.png' } as never)).toThrow(/expects an Assets catalog/);
  });

  it('composes to an empty catalog when given no arguments', () => {
    expect(Object.keys(Assets.compose().entries)).toEqual([]);
  });
});

describe('Assets.extend', () => {
  it('adds new keys while keeping the base leaves', () => {
    const base = Assets.from({ logo: 'sprites/logo.png' });

    const derived = Assets.extend(base, { theme: 'audio/theme.ogg' });

    expect(Object.keys(derived.entries).sort()).toEqual(['logo', 'theme']);
    expect(derived.logo).toBe(base.logo);
    expect(derived.theme).toBeInstanceOf(Sound);
  });

  it('overrides an existing key deliberately, leaving the base untouched', () => {
    const base = Assets.from({ theme: 'audio/shared.ogg', logo: 'sprites/logo.png' });

    const derived = Assets.extend(base, {
      theme: 'audio/forest.ogg',
      logo: Asset.type('texture', 'sprites/forest-logo.png', { mimeType: 'image/png' }),
    });

    expect(_readMeta(derived.theme)).toMatchObject({ kind: 'sound', src: 'audio/forest.ogg' });
    expect(_readMeta(derived.logo)).toMatchObject({ kind: 'texture', src: 'sprites/forest-logo.png', opts: { mimeType: 'image/png' } });
    expect(derived.theme).not.toBe(base.theme);

    // The base keeps its own declarations.
    expect(_readMeta(base.theme)).toMatchObject({ kind: 'sound', src: 'audio/shared.ogg' });
    expect(_readMeta(base.logo)).toMatchObject({ kind: 'texture', src: 'sprites/logo.png' });
  });

  it('records the base and the deliberate overrides as provenance', () => {
    const base = Assets.from({ logo: 'sprites/logo.png', theme: 'audio/shared.ogg' });

    const derived = Assets.extend(base, { theme: 'audio/forest.ogg', tree: 'sprites/tree.png' });

    const provenance = _readProvenance(derived)!;

    expect(provenance.kind).toBe('extend');
    expect(provenance.sources[0]).toBe(base);
    expect(provenance.overrides).toEqual(['theme']);
    // An untouched key still belongs to the base; an override is a NEW declaration.
    expect(provenance.keyOrigins.get('logo')).toBe(base);
    expect(provenance.keyOrigins.get('theme')).not.toBe(base);
  });

  it('conflicts when a derived catalog is composed back with the base it overrode', () => {
    const base = Assets.from({ theme: 'audio/shared.ogg' });
    const derived = Assets.extend(base, { theme: 'audio/forest.ogg' });

    expect(() => Assets.compose(base, derived)).toThrow(/duplicate catalog key "theme"/);
  });

  it('composes cleanly with its base for keys it merely inherited', () => {
    const base = Assets.from({ logo: 'sprites/logo.png' });
    const derived = Assets.extend(base, { tree: 'sprites/tree.png' });

    expect(Object.keys(Assets.compose(base, derived).entries).sort()).toEqual(['logo', 'tree']);
  });

  it('rejects a reserved key name', () => {
    const base = Assets.from({ logo: 'sprites/logo.png' });

    expect(() => Assets.extend(base, { entries: 'sprites/x.png' } as never)).toThrow(/reserved/);
  });

  it('accepts "_provenance" as an ordinary key now that provenance is off the object', () => {
    const base = Assets.from({ logo: 'sprites/logo.png' });
    const derived = Assets.extend(base, { _provenance: 'sprites/x.png' });

    expect(derived._provenance).toBeInstanceOf(Texture);
    expect(_readProvenance(derived)?.kind).toBe('extend');
  });

  it('rejects a non-catalog base', () => {
    expect(() => Assets.extend({ logo: 'sprites/logo.png' } as never, {})).toThrow(/expects an Assets catalog/);
  });
});

describe('composed catalogs in the loader', () => {
  afterEach(() => {
    decodeAudioDataMock.mockClear();
    global.fetch = originalFetch;
  });

  it('loads and releases like an ordinary catalog, healing the input catalogs own leaves', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();
    const owner = loader.createScope({ name: 'owner' });
    const shared = Assets.from({ boom: 'sfx/boom.ogg' });
    const local = Assets.from({ hit: 'sfx/hit.ogg' });
    const composed = Assets.compose(shared, local);

    await owner.load(composed);

    // The composition shares its inputs' leaves, so THOSE handles heal.
    expect(shared.boom).toBe(composed.boom);
    expect(shared.boom.loadState).toBe('ready');
    expect(local.hit.audioBuffer).not.toBeNull();

    owner.release(composed);

    expect(shared.boom.audioBuffer).toBeNull();
    expect(local.hit.audioBuffer).toBeNull();
  });

  it('claims each key exactly once — composition adds no ownership of its own', async () => {
    mockFetchAudio();
    const loader = createCoreLoader();
    const owner = loader.createScope({ name: 'owner' });
    const shared = Assets.from({ boom: 'sfx/boom.ogg' });
    const composed = Assets.compose(shared, shared);

    await owner.load(composed);
    owner.release(composed);

    expect(shared.boom.audioBuffer).toBeNull();
  });
});
