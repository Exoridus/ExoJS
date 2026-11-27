import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import type { AsepriteData } from '../src/AsepriteData';
import { AsepriteSheet } from '../src/AsepriteSheet';
import { AsepriteFormatError, asepriteType } from '../src/asepriteType';

const PKG_DIR = basename(process.cwd()) === 'exojs-aseprite' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-aseprite');
const raw = (): AsepriteData => JSON.parse(readFileSync(join(PKG_DIR, 'test', 'fixtures', 'knight.slices.json'), 'utf-8')) as AsepriteData;

const sheet = (): AsepriteSheet => {
  const texture = new Texture();

  texture.width = 48;
  texture.height = 14;

  return AsepriteSheet.parse(raw(), texture);
};

const decode = async (document: unknown): Promise<AsepriteData> =>
  asepriteType.codec!.decode(JSON.stringify(document), { locator: 'knight.json' });

describe('Aseprite slices per frame', () => {
  it('resolves the key in effect on a frame, holding it until the next key', () => {
    const knight = sheet();

    expect(knight.getSlice('hitbox', 0)).toBeNull();
    expect(knight.getSlice('hitbox', 1)).toMatchObject({ keyFrame: 1, bounds: { x: 8, y: 4, w: 6, h: 8 }, pivot: { x: 3, y: 8 } });
    expect(knight.getSlice('hitbox', 2)).toMatchObject({ keyFrame: 1, bounds: { x: 8, y: 4, w: 6, h: 8 } });
    expect(knight.getSlice('hitbox', 3)).toMatchObject({ keyFrame: 3, bounds: { x: 10, y: 5, w: 6, h: 6 }, pivot: { x: 3, y: 6 } });
    expect(knight.getSlice('missing', 1)).toBeNull();
  });

  it("joins a key with the slice's colour and user data, and keeps a nine-slice centre", () => {
    const knight = sheet();

    expect(knight.getSlice('hitbox', 1)).toEqual({
      name: 'hitbox',
      keyFrame: 1,
      bounds: { x: 8, y: 4, w: 6, h: 8 },
      pivot: { x: 3, y: 8 },
      color: '#ff0000ff',
      data: 'damage=3',
    });
    expect(knight.getSlice('panel', 2)).toEqual({
      name: 'panel',
      keyFrame: 0,
      bounds: { x: 0, y: 0, w: 16, h: 16 },
      center: { x: 4, y: 4, w: 8, h: 8 },
      color: '#0000ffff',
    });
  });

  it('maps every clip frame to its sheet frame, bounce included', () => {
    const knight = sheet();

    expect(knight.clipFrameIndices.get('idle')).toEqual([0]);
    expect(knight.clipFrameIndices.get('attack')).toEqual([1, 2, 3, 2]);
    expect(knight.clipFrameIndices.get('attack')).toHaveLength(knight.clips.get('attack')!.frames.length);
  });

  it('keeps slices in canvas space, the same space the trimmed frames are offset into', () => {
    const knight = sheet();
    const attack = knight.clips.get('attack')!;
    const sheetFrame = knight.clipFrameIndices.get('attack')![2]!;
    const offset = attack.frameOffsets![2]!;
    const hitbox = knight.getSlice('hitbox', sheetFrame)!;

    // Frame 3's trimmed image starts at (2, 2) on the canvas, so the hitbox
    // covers its pixels from (8, 3) on.
    expect(offset).toEqual({ x: 2, y: 2 });
    expect([hitbox.bounds.x - offset.x, hitbox.bounds.y - offset.y]).toEqual([8, 3]);
  });

  it('keeps tag colour and user data next to the clips', () => {
    expect(sheet().tags.get('attack')).toMatchObject({ color: '#fe5b59ff', data: 'hits:2', repeat: '2' });
  });
});

describe('Aseprite metadata diagnostics', () => {
  const withMeta = (meta: Record<string, unknown>): unknown => {
    const data = raw();

    return { ...data, meta: { ...data.meta, ...meta } };
  };

  it('accepts the fixture', async () => {
    await expect(decode(raw())).resolves.toBeDefined();
  });

  it('rejects malformed frame tags instead of dropping or mis-repeating them', async () => {
    await expect(decode(withMeta({ frameTags: [{ name: 'x', from: 2, to: 1, direction: 'forward' }] }))).rejects.toThrow(/from <= to/);
    await expect(decode(withMeta({ frameTags: [{ name: 'x', from: 0, to: 1, direction: 'sideways' }] }))).rejects.toThrow(
      /unknown direction "sideways"/,
    );
    await expect(decode(withMeta({ frameTags: [{ name: 'x', from: 0, to: 1, direction: 'forward', repeat: 'twice' }] }))).rejects.toThrow(
      AsepriteFormatError,
    );
  });

  it('rejects slice keys without a frame or bounds, or with a malformed pivot', async () => {
    await expect(decode(withMeta({ slices: [{ name: 's', keys: [{ frame: 0 }] }] }))).rejects.toThrow(/"meta.slices\[0\]" \("s"\)/);
    await expect(
      decode(withMeta({ slices: [{ name: 's', keys: [{ frame: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, pivot: { x: 'a', y: 0 } }] }] })),
    ).rejects.toThrow(AsepriteFormatError);
  });
});
