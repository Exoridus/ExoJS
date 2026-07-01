import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { AnimatedSprite, Spritesheet, Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import type { AsepriteData, AsepriteDirection } from '../src/AsepriteData';
import { isAsepriteArrayData } from '../src/AsepriteData';
import { AsepriteSheet } from '../src/AsepriteSheet';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PKG_DIR = basename(process.cwd()) === 'exojs-aseprite' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-aseprite');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): AsepriteData {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8')) as AsepriteData;
}

const arrayData = loadFixture('hero.array.json');
const hashData = loadFixture('hero.hash.json');

function newTexture(): Texture {
  const tex = new Texture();
  tex.width = 48;
  tex.height = 16;

  return tex;
}

// ── isAsepriteArrayData ────────────────────────────────────────────────────────

describe('isAsepriteArrayData', () => {
  it('returns true for the array-frames form', () => {
    expect(isAsepriteArrayData(arrayData)).toBe(true);
  });

  it('returns false for the hash-frames form', () => {
    expect(isAsepriteArrayData(hashData)).toBe(false);
  });
});

// ── AsepriteSheet.parse — array form ───────────────────────────────────────────

describe('AsepriteSheet.parse — array form', () => {
  it('returns an AsepriteSheet instance', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    expect(sheet).toBeInstanceOf(AsepriteSheet);
  });

  it('builds a Spritesheet with one frame per Aseprite frame', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    expect(sheet.spritesheet).toBeInstanceOf(Spritesheet);
    expect(sheet.spritesheet.frames.size).toBe(3);
  });

  it('keys spritesheet frames by zero-based index string', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    expect(sheet.spritesheet.frames.has('0')).toBe(true);
    expect(sheet.spritesheet.frames.has('1')).toBe(true);
    expect(sheet.spritesheet.frames.has('2')).toBe(true);
  });

  it('maps each frame rectangle to the Aseprite frame pixel region', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    const frame2 = sheet.spritesheet.getFrame('2');
    expect(frame2.x).toBe(32);
    expect(frame2.y).toBe(0);
    expect(frame2.width).toBe(16);
    expect(frame2.height).toBe(16);
  });

  it('forwards the supplied texture onto the Spritesheet', () => {
    const texture = newTexture();
    const sheet = AsepriteSheet.parse(arrayData, texture);
    expect(sheet.spritesheet.texture).toBe(texture);
  });
});

// ── AsepriteSheet.parse — clips from frameTags ─────────────────────────────────

describe('AsepriteSheet.parse — clips from frameTags', () => {
  it('creates one clip per frame tag', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    expect(sheet.clips.size).toBe(2);
    expect(sheet.clips.has('walk')).toBe(true);
    expect(sheet.clips.has('bounce')).toBe(true);
  });

  it('resolves a clip to one rectangle per inclusive frame in the [from,to] range', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    // walk: from 0 to 1 inclusive -> 2 frames.
    expect(sheet.clips.get('walk')!.frames).toHaveLength(2);
  });

  it('clip frames are live references into the spritesheet frames', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    expect(sheet.clips.get('walk')!.frames[0]).toBe(sheet.spritesheet.getFrame('0'));
    expect(sheet.clips.get('walk')!.frames[1]).toBe(sheet.spritesheet.getFrame('1'));
  });

  it('marks every clip as looping regardless of direction', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    expect(sheet.clips.get('walk')!.loop).toBe(true);
    expect(sheet.clips.get('bounce')!.loop).toBe(true);
  });

  it('a two-frame pingpong tag has no middle frame to repeat, so it plays like forward', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    // bounce: from 1 to 2 pingpong -> forward pass [1,2], backward pass excludes
    // both endpoints, and there is no frame strictly between 1 and 2 -> [1, 2].
    expect(sheet.clips.get('bounce')!.frames).toHaveLength(2);
    expect(sheet.clips.get('bounce')!.frames[0]).toBe(sheet.spritesheet.getFrame('1'));
    expect(sheet.clips.get('bounce')!.frames[1]).toBe(sheet.spritesheet.getFrame('2'));
  });

  it('derives clip fps from the average frame duration (100ms -> 10fps)', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    expect(sheet.clips.get('walk')!.fps).toBe(10);
  });
});

// ── AsepriteSheet.parse — direction expansion ──────────────────────────────────

describe('AsepriteSheet.parse — direction expansion', () => {
  function makeData(tag: { from: number; to: number; direction: AsepriteDirection }): AsepriteData {
    return {
      frames: [0, 1, 2].map(i => ({
        duration: 100,
        frame: { x: i * 16, y: 0, w: 16, h: 16 },
        rotated: false,
        trimmed: false,
        sourceSize: { w: 16, h: 16 },
        spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
      })),
      meta: {
        app: 'aseprite',
        version: '1.3',
        image: 'x.png',
        format: 'RGBA8888',
        size: { w: 48, h: 16 },
        scale: '1',
        frameTags: [{ name: 'clip', from: tag.from, to: tag.to, direction: tag.direction }],
      },
    };
  }

  function indicesOf(sheet: AsepriteSheet): number[] {
    const frames = sheet.clips.get('clip')!.frames;

    return frames.map(rect => {
      for (let i = 0; i < 3; i++) {
        if (rect === sheet.spritesheet.getFrame(String(i))) {
          return i;
        }
      }

      throw new Error('frame not found');
    });
  }

  it('forward (default) expands to [from..to] unchanged', () => {
    const sheet = AsepriteSheet.parse(makeData({ from: 0, to: 2, direction: 'forward' }), newTexture());
    expect(indicesOf(sheet)).toEqual([0, 1, 2]);
  });

  it('reverse expands to [to..from]', () => {
    const sheet = AsepriteSheet.parse(makeData({ from: 0, to: 2, direction: 'reverse' }), newTexture());
    expect(indicesOf(sheet)).toEqual([2, 1, 0]);
  });

  it('pingpong expands to a forward pass then a backward pass excluding both endpoints', () => {
    const sheet = AsepriteSheet.parse(makeData({ from: 0, to: 2, direction: 'pingpong' }), newTexture());
    expect(indicesOf(sheet)).toEqual([0, 1, 2, 1]);
  });

  it('pingpong_reverse expands starting from the reverse end', () => {
    const sheet = AsepriteSheet.parse(makeData({ from: 0, to: 2, direction: 'pingpong_reverse' }), newTexture());
    expect(indicesOf(sheet)).toEqual([2, 1, 0, 1]);
  });

  it('a single-frame tag (from === to) emits just that frame for any direction', () => {
    for (const direction of ['forward', 'reverse', 'pingpong', 'pingpong_reverse'] as const) {
      const sheet = AsepriteSheet.parse(makeData({ from: 1, to: 1, direction }), newTexture());
      expect(indicesOf(sheet)).toEqual([1]);
    }
  });

  it('averages duration across the full expanded pingpong sequence, weighting repeated frames', () => {
    const data: AsepriteData = {
      frames: [100, 300, 100].map((duration, i) => ({
        duration,
        frame: { x: i * 16, y: 0, w: 16, h: 16 },
        rotated: false,
        trimmed: false,
        sourceSize: { w: 16, h: 16 },
        spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
      })),
      meta: {
        app: 'aseprite',
        version: '1.3',
        image: 'x.png',
        format: 'RGBA8888',
        size: { w: 48, h: 16 },
        scale: '1',
        frameTags: [{ name: 'clip', from: 0, to: 2, direction: 'pingpong' }],
      },
    };
    const sheet = AsepriteSheet.parse(data, newTexture());
    // Expanded sequence is [100, 300, 100, 300] (frame 1's duration counted twice)
    // -> avg 200ms -> 5fps. A naive from..to average (100+300+100)/3 would give 6fps.
    expect(sheet.clips.get('clip')!.fps).toBe(5);
  });
});

// ── AsepriteSheet.parse — fps averaging and fallbacks ──────────────────────────

describe('AsepriteSheet.parse — fps derivation', () => {
  function makeData(durations: number[], tag: { from: number; to: number }): AsepriteData {
    return {
      frames: durations.map((duration, i) => ({
        duration,
        frame: { x: i * 16, y: 0, w: 16, h: 16 },
        rotated: false,
        trimmed: false,
        sourceSize: { w: 16, h: 16 },
        spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
      })),
      meta: {
        app: 'aseprite',
        version: '1.3',
        image: 'x.png',
        format: 'RGBA8888',
        size: { w: 48, h: 16 },
        scale: '1',
        frameTags: [{ name: 'clip', from: tag.from, to: tag.to, direction: 'forward' }],
      },
    };
  }

  it('averages mixed durations across the range (100/200/300 -> 200ms -> 5fps)', () => {
    const sheet = AsepriteSheet.parse(makeData([100, 200, 300], { from: 0, to: 2 }), newTexture());
    expect(sheet.clips.get('clip')!.fps).toBe(5);
  });

  it('falls back to 12fps when all frame durations are zero', () => {
    const sheet = AsepriteSheet.parse(makeData([0, 0, 0], { from: 0, to: 2 }), newTexture());
    expect(sheet.clips.get('clip')!.fps).toBe(12);
  });
});

// ── AsepriteSheet.parse — frame-index edge cases ───────────────────────────────

describe('AsepriteSheet.parse — frame-index handling in tags', () => {
  function makeData(tag: { from: number; to: number }): AsepriteData {
    return {
      frames: [0, 1, 2].map(i => ({
        duration: 100,
        frame: { x: i * 16, y: 0, w: 16, h: 16 },
        rotated: false,
        trimmed: false,
        sourceSize: { w: 16, h: 16 },
        spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
      })),
      meta: {
        app: 'aseprite',
        version: '1.3',
        image: 'x.png',
        format: 'RGBA8888',
        size: { w: 48, h: 16 },
        scale: '1',
        frameTags: [{ name: 'clip', from: tag.from, to: tag.to, direction: 'forward' }],
      },
    };
  }

  it('silently skips out-of-range frame indices in a tag', () => {
    // from 1 to 10 against 3 frames -> only indices 1 and 2 resolve.
    const sheet = AsepriteSheet.parse(makeData({ from: 1, to: 10 }), newTexture());
    expect(sheet.clips.get('clip')!.frames).toHaveLength(2);
  });

  it('omits a clip whose entire range is out of bounds (zero resolved frames)', () => {
    const sheet = AsepriteSheet.parse(makeData({ from: 5, to: 9 }), newTexture());
    expect(sheet.clips.has('clip')).toBe(false);
  });
});

// ── AsepriteSheet.parse — missing frameTags ────────────────────────────────────

describe('AsepriteSheet.parse — no frame tags', () => {
  it('produces an empty clips map when meta.frameTags is absent', () => {
    const data: AsepriteData = {
      frames: [
        {
          duration: 100,
          frame: { x: 0, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          sourceSize: { w: 16, h: 16 },
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
        },
      ],
      meta: {
        app: 'aseprite',
        version: '1.3',
        image: 'x.png',
        format: 'RGBA8888',
        size: { w: 16, h: 16 },
        scale: '1',
      },
    };
    const sheet = AsepriteSheet.parse(data, newTexture());
    expect(sheet.clips.size).toBe(0);
  });
});

// ── AsepriteSheet.parse — hash form ────────────────────────────────────────────

describe('AsepriteSheet.parse — hash form', () => {
  it('produces the same frame count and index-string keys as the array form', () => {
    const sheet = AsepriteSheet.parse(hashData, newTexture());
    expect(sheet.spritesheet.frames.size).toBe(3);
    // Frames are re-keyed by ordinal index, NOT by the hash filename keys.
    expect(sheet.spritesheet.frames.has('0')).toBe(true);
    expect(sheet.spritesheet.frames.has('hero 0.aseprite')).toBe(false);
  });

  it('preserves frame order from object insertion order', () => {
    const sheet = AsepriteSheet.parse(hashData, newTexture());
    expect(sheet.spritesheet.getFrame('1').x).toBe(16);
  });

  it('builds the same clips as the array form', () => {
    const sheet = AsepriteSheet.parse(hashData, newTexture());
    expect([...sheet.clips.keys()].sort()).toEqual(['bounce', 'walk']);
  });
});

// ── createAnimatedSprite ───────────────────────────────────────────────────────

describe('AsepriteSheet.createAnimatedSprite', () => {
  it('returns an AnimatedSprite with every tag pre-defined as a playable clip', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    const sprite = sheet.createAnimatedSprite();
    expect(sprite).toBeInstanceOf(AnimatedSprite);
    expect(() => sprite.play('walk')).not.toThrow();
    expect(() => sprite.play('bounce')).not.toThrow();
  });

  it('play() activates the named clip and adopts its looping flag', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    const sprite = sheet.createAnimatedSprite();
    sprite.play('walk');
    expect(sprite.currentClip).toBe('walk');
    expect(sprite.playing).toBe(true);
    expect(sprite.loop).toBe(true);
  });

  it('throws when playing a clip that has no matching tag', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    const sprite = sheet.createAnimatedSprite();
    expect(() => sprite.play('missing')).toThrow(/clip "missing" is not defined/);
  });
});

// ── destroy ────────────────────────────────────────────────────────────────────

describe('AsepriteSheet.destroy', () => {
  it('clears the underlying spritesheet frames', () => {
    const sheet = AsepriteSheet.parse(arrayData, newTexture());
    expect(sheet.spritesheet.frames.size).toBe(3);
    sheet.destroy();
    expect(sheet.spritesheet.frames.size).toBe(0);
  });
});
