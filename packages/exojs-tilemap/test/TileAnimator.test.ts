import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { TileAnimator } from '../src/TileAnimator';
import { TileLayer } from '../src/TileLayer';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

// ── Test helpers ──────────────────────────────────────────────────────────

function fakeTexture(): Texture {
  return {
    destroyed: false,
    destroy: () => {},
    height: 512,
    label: 'test',
    uid: 0,
    width: 512,
  } as unknown as Texture;
}

function fakeRegion(): TextureRegion {
  return new TextureRegion(fakeTexture(), { height: 512, width: 512, x: 0, y: 0 });
}

function makeTileset256(name = 'ts'): TileSet {
  return new TileSet({
    columns: 16,
    name,
    tileCount: 256,
    tileHeight: 32,
    tileWidth: 32,
    texture: fakeRegion(),
  });
}

function makeLayer(ts: TileSet, w = 3, h = 3): TileLayer {
  return new TileLayer({
    height: h,
    id: 0,
    name: 'layer',
    tileHeight: 32,
    tileWidth: 32,
    tilesets: [ts],
    width: w,
  });
}

function setTile(layer: TileLayer, ts: TileSet, tx: number, ty: number, localTileId = 0): void {
  layer.setTileAt(tx, ty, { localTileId, tileset: ts, transform: TILE_TRANSFORM_IDENTITY });
}

// ═══════════════════════════════════════════════════════════════════════════

describe('TileAnimator', () => {
  it('registers only cells whose tile carries a multi-frame animation', () => {
    const ts = makeTileset256();
    // Tile 0 is a 2-frame animation: 0 → 1 → (loop).
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 1, duration: 100 },
      ],
    });

    const layer = makeLayer(ts, 3, 3);
    setTile(layer, ts, 0, 0, 0); // animated
    setTile(layer, ts, 1, 1, 5); // static (no definition)

    const animator = new TileAnimator(layer);
    expect(animator.animatedCellCount).toBe(1);
  });

  it('advances the animated cell across frame boundaries and loops', () => {
    const ts = makeTileset256();
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 1, duration: 100 },
      ],
    });

    const layer = makeLayer(ts, 3, 3);
    setTile(layer, ts, 0, 0, 0);
    setTile(layer, ts, 1, 1, 5); // static control

    const animator = new TileAnimator(layer);

    // 50ms → frame 0 (window [0,100)).
    animator.update(0.05);
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(0);

    // +60ms = 110ms → frame 1 (window [100,200)).
    animator.update(0.06);
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(1);

    // +100ms = 210ms → 210 % 200 = 10 → back to frame 0.
    animator.update(0.1);
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(0);

    // The static cell was never touched.
    expect(layer.getTileAt(1, 1)?.localTileId).toBe(5);
  });

  it('does not rewrite a cell that stays within the same frame window', () => {
    const ts = makeTileset256();
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 1, duration: 100 },
      ],
    });

    const layer = makeLayer(ts, 3, 3);
    setTile(layer, ts, 0, 0, 0);

    const animator = new TileAnimator(layer);

    // First tick writes frame 0 (from the initial -1 state) → revision bumps.
    animator.update(0.02);
    const revAfterFirst = layer.revision;

    // Another tick still inside frame 0 → no write, revision unchanged.
    animator.update(0.02);
    expect(layer.revision).toBe(revAfterFirst);
  });

  it('reset restores frame 0 and zeroes the clock', () => {
    const ts = makeTileset256();
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 1, duration: 100 },
      ],
    });

    const layer = makeLayer(ts, 3, 3);
    setTile(layer, ts, 0, 0, 0);

    const animator = new TileAnimator(layer);
    animator.update(0.15); // → frame 1
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(1);

    animator.reset();
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(0);
    expect(animator.elapsedMs).toBe(0);
  });

  it('preserves the placed orientation transform across frames', () => {
    const ts = makeTileset256();
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 1, duration: 100 },
      ],
    });

    const layer = makeLayer(ts, 3, 3);
    layer.setTileAt(0, 0, {
      localTileId: 0,
      tileset: ts,
      transform: { flipX: true, flipY: false, diagonal: false },
    });

    const animator = new TileAnimator(layer);
    animator.update(0.15); // → frame 1

    const tile = layer.getTileAt(0, 0);
    expect(tile?.localTileId).toBe(1);
    expect(tile?.transform.flipX).toBe(true);
  });

  it('update() is a no-op for non-positive or non-finite deltaSeconds', () => {
    const ts = makeTileset256();
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 1, duration: 100 },
      ],
    });

    const layer = makeLayer(ts, 3, 3);
    setTile(layer, ts, 0, 0, 0);

    const animator = new TileAnimator(layer);

    animator.update(0); // zero
    animator.update(-1); // negative
    animator.update(NaN); // non-finite
    animator.update(Infinity); // non-finite

    // None of these advanced the clock or wrote a frame.
    expect(animator.elapsedMs).toBe(0);
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(0);
  });

  it('update() is a no-op when there are no animated cells to advance', () => {
    const ts = makeTileset256();
    const layer = makeLayer(ts, 2, 2);
    setTile(layer, ts, 0, 0, 5); // no animation definition → not registered

    const animator = new TileAnimator(layer);
    expect(animator.animatedCellCount).toBe(0);

    // update() must return early via the `this._cells.length === 0` guard clause.
    expect(() => animator.update(0.5)).not.toThrow();
    expect(animator.elapsedMs).toBe(0);
  });

  it('ignores an animation whose frames reference an out-of-range local tile id', () => {
    const ts = makeTileset256();
    // localTileId 999 exceeds the 256-tile tileset — malformed data.
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 999, duration: 100 },
      ],
    });

    const layer = makeLayer(ts, 2, 2);
    setTile(layer, ts, 0, 0, 0);

    const animator = new TileAnimator(layer);
    // The malformed cell must be skipped entirely during the scan.
    expect(animator.animatedCellCount).toBe(0);
  });

  it('ignores an animation whose total duration is zero', () => {
    const ts = makeTileset256();
    // Both frame durations clamp to 0 (Math.max(0, duration)) → total is 0.
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 0 },
        { localTileId: 1, duration: -5 },
      ],
    });

    const layer = makeLayer(ts, 2, 2);
    setTile(layer, ts, 0, 0, 0);

    const animator = new TileAnimator(layer);
    expect(animator.animatedCellCount).toBe(0);
  });

  it('rescan() resets to frame 0 before re-scanning the layers', () => {
    const ts = makeTileset256();
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 1, duration: 100 },
      ],
    });

    const layer = makeLayer(ts, 2, 2);
    setTile(layer, ts, 0, 0, 0);

    const animator = new TileAnimator(layer);
    animator.update(0.15); // → frame 1
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(1);

    // A second animated cell appears after construction; rescan() must pick it up.
    setTile(layer, ts, 1, 1, 0);
    animator.rescan();

    // rescan() resets first (frame 0, clock 0) then re-scans both cells.
    expect(layer.getTileAt(0, 0)?.localTileId).toBe(0);
    expect(animator.elapsedMs).toBe(0);
    expect(animator.animatedCellCount).toBe(2);
  });

  it('destroy() drops the cell registry and zeroes the clock', () => {
    const ts = makeTileset256();
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 1, duration: 100 },
      ],
    });

    const layer = makeLayer(ts, 2, 2);
    setTile(layer, ts, 0, 0, 0);

    const animator = new TileAnimator(layer);
    animator.update(0.05);
    expect(animator.animatedCellCount).toBe(1);

    animator.destroy();

    expect(animator.animatedCellCount).toBe(0);
    expect(animator.elapsedMs).toBe(0);
    // The layer itself is untouched by destroy — only the registry is dropped.
    expect(layer.destroyed).toBe(false);
  });

  it('accepts multiple layers', () => {
    const ts = makeTileset256();
    ts._setDefinition(0, {
      animation: [
        { localTileId: 0, duration: 100 },
        { localTileId: 1, duration: 100 },
      ],
    });

    const a = makeLayer(ts, 2, 2);
    const b = makeLayer(ts, 2, 2);
    setTile(a, ts, 0, 0, 0);
    setTile(b, ts, 1, 1, 0);

    const animator = new TileAnimator([a, b]);
    expect(animator.animatedCellCount).toBe(2);

    animator.update(0.15); // → frame 1 on both
    expect(a.getTileAt(0, 0)?.localTileId).toBe(1);
    expect(b.getTileAt(1, 1)?.localTileId).toBe(1);
  });
});
