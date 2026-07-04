import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { type AssetLoaderContext, Texture } from '@codexo/exojs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asepriteBinding,AsepriteFormatError } from '../src/asepriteBinding';
import { AsepriteSheet } from '../src/AsepriteSheet';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PKG_DIR = basename(process.cwd()) === 'exojs-aseprite' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-aseprite');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

// ── Context factory ────────────────────────────────────────────────────────────

function makeContext(fixtures: Record<string, unknown>) {
  const loaderLoad = vi.fn();

  const context: AssetLoaderContext = {
    loader: { load: loaderLoad } as unknown as AssetLoaderContext['loader'],
    identityKey: 'test',
    fetchText: vi.fn(),
    fetchArrayBuffer: vi.fn(),
    fetchJson: vi.fn(async (source: string): Promise<unknown> => {
      if (Object.hasOwn(fixtures, source)) return fixtures[source];
      throw new Error(`aseprite-binding.test: no fixture for "${source}"`);
    }),
  };

  loaderLoad.mockImplementation(async (token: unknown): Promise<unknown> => {
    if (token === Texture) {
      const tex = new Texture();
      tex.width = 48;
      tex.height = 16;
      return tex;
    }
    throw new Error(`aseprite-binding.test: unexpected loader.load token: ${String(token)}`);
  });

  return { context, loaderLoad };
}

// ── Descriptor ───────────────────────────────────────────────────────────────

describe('asepriteBinding descriptor', () => {
  it('targets the AsepriteSheet constructor', () => {
    expect(asepriteBinding.type).toBe(AsepriteSheet);
  });

  it('declares typeNames ["asepriteSheet"]', () => {
    expect(asepriteBinding.typeNames).toEqual(['asepriteSheet']);
  });

  it('does NOT claim file extensions (token-only binding)', () => {
    expect((asepriteBinding as { extensions?: unknown }).extensions).toBeUndefined();
  });

  it('create() returns a handler with a load function', () => {
    expect(typeof asepriteBinding.create().load).toBe('function');
  });

  it('create() handler has no custom getIdentityKey (default source identity)', () => {
    expect(asepriteBinding.create().getIdentityKey).toBeUndefined();
  });
});

// ── load() — happy path ─────────────────────────────────────────────────────────

describe('asepriteBinding.load — array fixture', () => {
  const fixtures = { 'sprites/hero.json': loadFixture('hero.array.json') };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a fully-parsed AsepriteSheet', async () => {
    const { context } = makeContext(fixtures);
    const handler = asepriteBinding.create();
    const sheet = await handler.load({ source: 'sprites/hero.json' }, context);
    expect(sheet).toBeInstanceOf(AsepriteSheet);
    expect(sheet.spritesheet.frames.size).toBe(3);
    expect(sheet.clips.size).toBe(2);
  });

  it('resolves the packed image URL relative to the JSON source and sub-loads it as a Texture', async () => {
    const { context, loaderLoad } = makeContext(fixtures);
    const handler = asepriteBinding.create();
    await handler.load({ source: 'sprites/hero.json' }, context);
    expect(loaderLoad).toHaveBeenCalledWith(Texture, 'sprites/hero.png');
  });

  it('passes absolute image references through unchanged', async () => {
    const doc = loadFixture('hero.array.json') as { meta: { image: string } };
    doc.meta.image = 'https://cdn.example.com/hero.png';
    const { context, loaderLoad } = makeContext({ 'sprites/hero.json': doc });
    const handler = asepriteBinding.create();
    await handler.load({ source: 'sprites/hero.json' }, context);
    expect(loaderLoad).toHaveBeenCalledWith(Texture, 'https://cdn.example.com/hero.png');
  });

  it('loads the hash-form fixture identically', async () => {
    const { context } = makeContext({ 'sprites/hero.json': loadFixture('hero.hash.json') });
    const handler = asepriteBinding.create();
    const sheet = await handler.load({ source: 'sprites/hero.json' }, context);
    expect(sheet.spritesheet.frames.size).toBe(3);
  });

  it('resolves a relative image ref against an absolute (scheme-qualified) source URL', async () => {
    const { context, loaderLoad } = makeContext({ 'https://cdn.example.com/sprites/hero.json': loadFixture('hero.array.json') });
    const handler = asepriteBinding.create();
    await handler.load({ source: 'https://cdn.example.com/sprites/hero.json' }, context);
    expect(loaderLoad).toHaveBeenCalledWith(Texture, 'https://cdn.example.com/sprites/hero.png');
  });

  it('resolves a relative image ref against a root-relative source, preserving the leading slash', async () => {
    const { context, loaderLoad } = makeContext({ '/assets/sprites/hero.json': loadFixture('hero.array.json') });
    const handler = asepriteBinding.create();
    await handler.load({ source: '/assets/sprites/hero.json' }, context);
    expect(loaderLoad).toHaveBeenCalledWith(Texture, '/assets/sprites/hero.png');
  });
});

// ── load() — validation / AsepriteFormatError ───────────────────────────────────

describe('asepriteBinding.load — AsepriteFormatError on malformed input', () => {
  async function loadRaw(raw: unknown): Promise<AsepriteSheet> {
    const { context } = makeContext({ 'doc.json': raw });
    return asepriteBinding.create().load({ source: 'doc.json' }, context);
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
    const { context, loaderLoad } = makeContext({ 'doc.json': { frames: 5, meta: { image: 'x.png' } } });
    await expect(asepriteBinding.create().load({ source: 'doc.json' }, context)).rejects.toThrow(AsepriteFormatError);
    expect(loaderLoad).not.toHaveBeenCalled();
  });
});
