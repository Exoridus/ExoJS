/**
 * The pooled-record primitive both retained captures are built on.
 *
 * Its whole job is to make a steady-state recapture allocate nothing, and the
 * two ways that can quietly break are the ones pinned here: a rewind that hands
 * back a FRESH record instead of the previous one (allocation per capture, and a
 * consumer holding the old reference sees a frozen draw), and a copy that misses
 * a field (the record then replays the previous capture's value, which renders
 * plausibly and is wrong).
 */

import { describe, expect, test } from 'vitest';

import type { Drawable } from '#rendering/Drawable';
import { type DrawCommand, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { copyRetainedDrawData, type MutableRetainedDrawData, releasePooledDrawables, RetainedRecordPool } from '#rendering/plan/RetainedRecordPool';

const drawableA = { id: 'a' } as unknown as Drawable;
const drawableB = { id: 'b' } as unknown as Drawable;

const neutralKey = (): MaterialKey => ({ rendererId: 0, blendMode: 0, textureId: -1, shaderId: -1, pipelineKey: 0, bindKey: 0, ownMaterial: false });

const createRecord = (): MutableRetainedDrawData => ({
  drawable: undefined as unknown as Drawable,
  seq: 0,
  zIndex: 0,
  material: neutralKey(),
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
});

const command = (drawable: Drawable, seq: number, zIndex: number, minX: number): DrawCommand =>
  ({
    kind: RenderEntryKind.Draw,
    drawable,
    nodeIndex: 7,
    seq,
    zIndex,
    material: { rendererId: 3, blendMode: 1, textureId: 5, shaderId: 6, pipelineKey: 11, bindKey: 12, ownMaterial: true },
    groupIndex: undefined,
    minX,
    minY: minX + 1,
    maxX: minX + 2,
    maxY: minX + 3,
  }) as DrawCommand;

describe('RetainedRecordPool', () => {
  test('acquire constructs on first use and hands the same records back after a rewind', () => {
    let constructed = 0;
    const pool = new RetainedRecordPool(() => {
      constructed++;

      return createRecord();
    });

    const first = pool.acquire();
    const second = pool.acquire();

    expect(constructed).toBe(2);
    expect(pool.used).toBe(2);
    expect(second).not.toBe(first);

    pool.rewind();

    expect(pool.used).toBe(0);
    expect(pool.acquire()).toBe(first);
    expect(pool.acquire()).toBe(second);
    expect(constructed).toBe(2);
  });

  test('a capture shorter than its predecessor leaves the surplus records pooled, not dropped', () => {
    const pool = new RetainedRecordPool(createRecord);
    const first = pool.acquire();
    const second = pool.acquire();

    pool.rewind();
    pool.acquire();

    expect(pool.used).toBe(1);

    // The second record is beyond `used` and therefore not part of this capture,
    // but it is still pooled: the next capture that reaches depth two gets it
    // back rather than allocating.
    pool.rewind();
    pool.acquire();

    expect(pool.acquire()).toBe(second);
    expect(pool.at(0)).toBe(first);
  });

  test('releasePooledDrawables clears exactly the capture in progress', () => {
    const pool = new RetainedRecordPool(createRecord);
    const kept = pool.acquire();
    const dropped = pool.acquire();

    kept.drawable = drawableA;
    dropped.drawable = drawableB;

    // Shrink the live capture to one record, then release: the record beyond
    // `used` is not this capture's and is left alone.
    pool.rewind();
    pool.acquire();
    releasePooledDrawables(pool);

    expect(kept.drawable).toBeUndefined();
    expect(dropped.drawable).toBe(drawableB);
  });
});

describe('copyRetainedDrawData', () => {
  test('copies every replayed field and rewrites the pooled key in place', () => {
    const record = createRecord();
    const pooledKey = record.material;

    copyRetainedDrawData(record, command(drawableA, 4, 9, 100));

    expect(record.drawable).toBe(drawableA);
    expect(record.seq).toBe(4);
    expect(record.zIndex).toBe(9);
    expect(record.minX).toBe(100);
    expect(record.minY).toBe(101);
    expect(record.maxX).toBe(102);
    expect(record.maxY).toBe(103);

    // The key object is the record's own, never the command's: the command is
    // pooled per frame and would be rewritten under the capture.
    expect(record.material).toBe(pooledKey);
    expect(record.material).toEqual({ rendererId: 3, blendMode: 1, textureId: 5, shaderId: 6, pipelineKey: 11, bindKey: 12, ownMaterial: true });
  });

  test('a second copy leaves nothing of the first behind', () => {
    const record = createRecord();

    copyRetainedDrawData(record, command(drawableA, 4, 9, 100));
    copyRetainedDrawData(record, command(drawableB, 1, 2, 3));

    expect(record).toMatchObject({ drawable: drawableB, seq: 1, zIndex: 2, minX: 3, minY: 4, maxX: 5, maxY: 6 });
  });
});
