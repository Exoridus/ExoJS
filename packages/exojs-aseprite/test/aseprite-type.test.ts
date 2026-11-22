import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { AssetFactoryContext } from '@codexo/exojs';
import { Asset, Texture } from '@codexo/exojs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AsepriteArrayData } from '../src/AsepriteData';
import { AsepriteSheet } from '../src/AsepriteSheet';
import { AsepriteFormatError, asepriteType } from '../src/asepriteType';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PKG_DIR = basename(process.cwd()) === 'exojs-aseprite' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-aseprite');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

const loadFixture = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));

// ── Context factory ────────────────────────────────────────────────────────────

/** Drives the type end to end - codec then factory - against in-memory fixtures. */
const makeContext = (fixtures: Record<string, unknown>) => {
  const loaderLoad = vi.fn(async (asset: unknown): Promise<unknown> => {
    const { type } = (asset as { _config: { type: string } })._config;

    if (type !== 'texture') {
      throw new Error(`aseprite-type.test: unexpected dependency "${type}"`);
    }

    const texture = new Texture();

    texture.width = 48;
    texture.height = 16;

    return texture;
  });

  const loadSheet = async (source: string): Promise<AsepriteSheet> => {
    if (!Object.hasOwn(fixtures, source)) {
      throw new Error(`aseprite-type.test: no fixture for "${source}"`);
    }

    const data = await asepriteType.codec!.decode(JSON.stringify(fixtures[source]), { locator: source });

    return asepriteType.createFactory().create(data, {
      source,
      resourceKey: `test|${source}`,
      sourceKey: `url:${source}`,
      locator: source,
      dependencies: { load: loaderLoad } as unknown as AssetFactoryContext['dependencies'],
    } as never);
  };

  return { loadSheet, loaderLoad };
};

// ── Descriptor ───────────────────────────────────────────────────────────────

describe('asepriteType descriptor', () => {
  it('dispatches on the AsepriteSheet constructor', () => {
    expect(asepriteType._token).toBe(AsepriteSheet);
  });

  it('is named "asepriteSheet"', () => {
    expect(asepriteType.id).toBe('asepriteSheet');
  });

  it('claims no file extension: a bare .json path stays with the built-in json type', () => {
    expect(asepriteType.extensions).toEqual([]);
  });

  it('declares no resource discriminator - type and locator alone identify it', () => {
    expect(asepriteType.resourceIdentity).toBeUndefined();
  });

  it('stores the text that arrived, so a cache hit re-parses exactly what was downloaded', async () => {
    const response = { text: async () => '{"frames":[],"meta":{"image":"x.png"}}' } as unknown as Response;

    await expect(asepriteType.codec!.fromResponse(response, { locator: 'doc.json' })).resolves.toBe(
      '{"frames":[],"meta":{"image":"x.png"}}',
    );
  });
});

// ── load() - happy path ─────────────────────────────────────────────────────────

describe('asepriteType - array fixture', () => {
  const fixtures = { 'sprites/hero.json': loadFixture('hero.array.json') };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a fully-parsed AsepriteSheet', async () => {
    const { loadSheet } = makeContext(fixtures);
    const sheet = await loadSheet('sprites/hero.json');
    expect(sheet).toBeInstanceOf(AsepriteSheet);
    expect(sheet.spritesheet.frames.size).toBe(3);
    expect(sheet.clips.size).toBe(2);
  });

  it('resolves the packed image URL relative to the JSON source and sub-loads it as a Texture', async () => {
    const { loadSheet, loaderLoad } = makeContext(fixtures);
    await loadSheet('sprites/hero.json');
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'sprites/hero.png'));
  });

  it('passes absolute image references through unchanged', async () => {
    const doc = loadFixture('hero.array.json') as { meta: { image: string } };
    doc.meta.image = 'https://cdn.example.com/hero.png';
    const { loadSheet, loaderLoad } = makeContext({ 'sprites/hero.json': doc });
    await loadSheet('sprites/hero.json');
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'https://cdn.example.com/hero.png'));
  });

  it('loads the hash-form fixture identically', async () => {
    const { loadSheet } = makeContext({ 'sprites/hero.json': loadFixture('hero.hash.json') });
    const sheet = await loadSheet('sprites/hero.json');
    expect(sheet.spritesheet.frames.size).toBe(3);
  });

  it('uses the loaded texture density when a deferred dependency settles', async () => {
    const fixture = loadFixture('hero.array.json') as AsepriteArrayData;
    const data = {
      ...fixture,
      frames: fixture.frames.map(frame => ({
        ...frame,
        trimmed: true,
        sourceSize: { w: 128, h: 128 },
        spriteSourceSize: { ...frame.spriteSourceSize, x: 58, y: 86 },
      })),
    };
    const { loadSheet, loaderLoad } = makeContext({ 'sprites/hero.json': data });
    let resolveTexture!: (texture: Texture) => void;
    const dependency = new Promise<Texture>(resolve => {
      resolveTexture = resolve;
    });

    loaderLoad.mockReturnValueOnce(dependency);

    const loading = loadSheet('sprites/hero.json');
    const texture = new Texture();

    await Promise.resolve();
    texture.width = 48;
    texture.height = 16;
    texture._assetResolution = 2;
    resolveTexture(texture);

    const sheet = await loading;
    const sprite = sheet.createAnimatedSprite().setAnchor(0.5, 0.75).play('walk');

    expect(sprite.origin.x).toBe(32);
    expect(sprite.origin.y).toBe(48);
    expect(sprite.getLocalBounds().x).toBe(29);
    expect(sprite.getLocalBounds().y).toBe(43);
    sprite.destroy();
    sheet.destroy();
    texture.destroy();
  });

  it('resolves a relative image ref against an absolute (scheme-qualified) source URL', async () => {
    const { loadSheet, loaderLoad } = makeContext({ 'https://cdn.example.com/sprites/hero.json': loadFixture('hero.array.json') });
    await loadSheet('https://cdn.example.com/sprites/hero.json');
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', 'https://cdn.example.com/sprites/hero.png'));
  });

  it('resolves a relative image ref against a root-relative source, preserving the leading slash', async () => {
    const { loadSheet, loaderLoad } = makeContext({ '/assets/sprites/hero.json': loadFixture('hero.array.json') });
    await loadSheet('/assets/sprites/hero.json');
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', '/assets/sprites/hero.png'));
  });

  it('resolves a relative image ref against a protocol-relative source, preserving the authority', async () => {
    const { loadSheet, loaderLoad } = makeContext({ '//cdn.example.com/art/hero.json': loadFixture('hero.array.json') });
    await loadSheet('//cdn.example.com/art/hero.json');
    expect(loaderLoad).toHaveBeenCalledWith(Asset.type('texture', '//cdn.example.com/art/hero.png'));
  });
});

// ── load() - validation / AsepriteFormatError ───────────────────────────────────

describe('asepriteType - AsepriteFormatError on malformed input', () => {
  const loadRaw = async (raw: unknown): Promise<AsepriteSheet> => {
    const { loadSheet } = makeContext({ 'doc.json': raw });

    return loadSheet('doc.json');
  };

  it('rejects a non-object root', async () => {
    await expect(loadRaw(null)).rejects.toThrow(/root must be an object/);
    await expect(loadRaw(42)).rejects.toThrow(AsepriteFormatError);
  });

  it('rejects a document missing "frames"', async () => {
    await expect(loadRaw({ meta: { image: 'x.png' } })).rejects.toThrow(/missing required field "frames"/);
  });

  it('rejects a document missing "meta"', async () => {
    await expect(loadRaw({ frames: [] })).rejects.toThrow(/missing required field "meta"/);
  });

  it('rejects a document whose "meta" is not an object', async () => {
    await expect(loadRaw({ frames: [], meta: null })).rejects.toThrow(/missing required field "meta"/);
  });

  it('rejects an empty or missing "meta.image"', async () => {
    await expect(loadRaw({ frames: [], meta: { image: '' } })).rejects.toThrow(/"meta.image" must be a non-empty string/);
    await expect(loadRaw({ frames: [], meta: {} })).rejects.toThrow(/"meta.image" must be a non-empty string/);
  });

  it('rejects "frames" that is neither an array nor an object', async () => {
    await expect(loadRaw({ frames: 5, meta: { image: 'x.png' } })).rejects.toThrow(/"frames" must be an array or an object/);
  });

  it('rejects a rotated packed frame instead of sampling a transposed rectangle', async () => {
    const rect = { x: 0, y: 0, w: 16, h: 16 };
    await expect(loadRaw({ frames: [{ rotated: true, frame: rect }], meta: { image: 'x.png' } })).rejects.toThrow(/"frames\.0" is rotated/);
    await expect(loadRaw({ frames: { hero: { rotated: true, frame: rect } }, meta: { image: 'x.png' } })).rejects.toThrow(
      /"frames\.hero" is rotated/,
    );
  });

  it.each(['array', 'hash'])('rejects malformed %s frames before acquiring the image', async layout => {
    const rect = { x: 0, y: 0, w: 16, h: 16 };
    const valid = { frame: rect, duration: 100, trimmed: false, spriteSourceSize: rect };
    const invalidFrames: unknown[] = [
      null,
      7,
      {},
      { ...valid, frame: null },
      { ...valid, frame: { ...rect, w: '16' } },
      { ...valid, duration: undefined },
      { ...valid, duration: '100' },
      { ...valid, trimmed: 'false' },
      { ...valid, spriteSourceSize: null },
      { ...valid, spriteSourceSize: { ...rect, x: '0' } },
    ];

    for (const frame of invalidFrames) {
      const frames = layout === 'array' ? [valid, frame] : { good: valid, bad: frame };
      const { loadSheet, loaderLoad } = makeContext({ 'doc.json': { frames, meta: { image: 'x.png' } } });

      await expect(loadSheet('doc.json')).rejects.toThrow(AsepriteFormatError);
      expect(loaderLoad).not.toHaveBeenCalled();
    }
  });

  it.each([0, -100])('preserves the duration fallback for %s milliseconds', async duration => {
    const doc = loadFixture('hero.array.json') as { frames: Array<{ duration: number }> };

    for (const frame of doc.frames) {
      frame.duration = duration;
    }

    const sheet = await loadRaw(doc);

    expect(sheet.clips.get('walk')?.frameDurations).toEqual([1 / 12, 1 / 12]);
  });

  it.each([null, { w: 0, h: 16 }, { w: 16, h: -1 }, { w: '16', h: 16 }])(
    'rejects invalid sourceSize %j before acquiring the image',
    async sourceSize => {
      const fixture = loadFixture('hero.array.json') as AsepriteArrayData;
      const data = { ...fixture, frames: fixture.frames.map(frame => ({ ...frame, sourceSize })) };
      const { loadSheet, loaderLoad } = makeContext({ 'doc.json': data });

      await expect(loadSheet('doc.json')).rejects.toThrow(AsepriteFormatError);
      expect(loaderLoad).not.toHaveBeenCalled();
    },
  );

  it('continues to load older input without sourceSize using the legacy frame extent', async () => {
    const fixture = loadFixture('hero.array.json') as AsepriteArrayData;
    const frames = fixture.frames.map(({ sourceSize: _sourceSize, ...frame }) => frame);
    const sheet = await loadRaw({ ...fixture, frames });
    const sprite = sheet.createAnimatedSprite().setAnchor(0.5).play('walk');

    expect(sprite.origin.x).toBe(8);
    expect(sprite.origin.y).toBe(8);
    expect(sheet.clips.get('walk')!.sourceSize).toBeUndefined();
    sprite.destroy();
    sheet.destroy();
  });

  it.each([1, 2])('preserves legacy trimmed offsets without sourceSize at resolution %s', async resolution => {
    const fixture = loadFixture('hero.array.json') as AsepriteArrayData;
    const frames = fixture.frames.map(({ sourceSize: _sourceSize, ...frame }) => ({
      ...frame,
      trimmed: true,
      spriteSourceSize: { ...frame.spriteSourceSize, x: 58, y: 86 },
    }));
    const { loadSheet, loaderLoad } = makeContext({ 'doc.json': { ...fixture, frames } });
    const texture = new Texture();

    texture.width = 48;
    texture.height = 16;
    texture._assetResolution = resolution;
    loaderLoad.mockResolvedValueOnce(texture);

    const sheet = await loadSheet('doc.json');
    const sprite = sheet.createAnimatedSprite().setAnchor(0.5).play('walk');

    expect(sheet.clips.get('walk')!.sourceSize).toBeUndefined();
    expect(sprite.origin.x).toBe(37);
    expect(sprite.origin.y).toBe(51);
    expect(sprite.getLocalBounds().x).toBe(58);
    expect(sprite.getLocalBounds().y).toBe(86);
    sprite.destroy();
    sheet.destroy();
    texture.destroy();
  });

  it('attaches the source URL and typed name to the thrown error', async () => {
    let caught: unknown;

    try {
      await loadRaw(null);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AsepriteFormatError);
    expect((caught as AsepriteFormatError).name).toBe('AsepriteFormatError');
    expect((caught as AsepriteFormatError).source).toBe('doc.json');
    expect((caught as Error).message).toContain('[AsepriteFormatError] doc.json:');
  });

  it('does not attempt to load a texture when validation fails', async () => {
    const { loadSheet, loaderLoad } = makeContext({ 'doc.json': { frames: 5, meta: { image: 'x.png' } } });

    await expect(loadSheet('doc.json')).rejects.toThrow(AsepriteFormatError);
    expect(loaderLoad).not.toHaveBeenCalled();
  });
});
