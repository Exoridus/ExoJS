import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { AssetFactoryContext } from '@codexo/exojs';
import { Asset, Texture } from '@codexo/exojs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AsepriteSheet } from '../src/AsepriteSheet';
import { AsepriteFormatError, asepriteType } from '../src/asepriteType';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PKG_DIR = basename(process.cwd()) === 'exojs-aseprite' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-aseprite');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

// ── Context factory ────────────────────────────────────────────────────────────

/** Drives the type end to end - codec then factory - against in-memory fixtures. */
function makeContext(fixtures: Record<string, unknown>) {
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
}

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

    await expect(asepriteType.codec!.fromResponse(response, { locator: 'doc.json' })).resolves.toBe('{"frames":[],"meta":{"image":"x.png"}}');
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
});

// ── load() - validation / AsepriteFormatError ───────────────────────────────────

describe('asepriteType - AsepriteFormatError on malformed input', () => {
  async function loadRaw(raw: unknown): Promise<AsepriteSheet> {
    const { loadSheet } = makeContext({ 'doc.json': raw });

    return loadSheet('doc.json');
  }

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
