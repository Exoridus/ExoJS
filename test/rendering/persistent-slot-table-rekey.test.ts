import { vi } from 'vitest';

import { Container } from '#rendering/Container';
import { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { createSourceScope, type SourceScope } from '#rendering/plan/renderSourceItem';
import { fillPersistentSpriteSlotTable, type PersistentSpriteSlotStore, rekeyPersistentSpriteSlotTable } from '#rendering/sprite/persistentSlots';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

/**
 * How a slot store's per-handle texture table survives a structure delta.
 *
 * The property under test is a COST one, and it is the reason the delta exists:
 * a re-key runs on every structural frame, so it may look at the items the delta
 * did not carry and at nothing else. A re-key that walked the whole source
 * instead would still produce a correct table - and would put an
 * acquisition-grade walk plus a fresh allocation back on a per-frame path, which
 * no pixel assertion anywhere would notice.
 */

/** Minimal stand-in for a backend store: the table plus what the fill/rekey rules read. */
const createStore = (): PersistentSpriteSlotStore => ({
  textures: [],
  blendMode: BlendModes.Normal,
  textureIndexOfHandle: new Uint8Array(0),
  spareTextureIndexOfHandle: new Uint8Array(0),
  ensureCapacity(): void {},
  writeSlotFrom(): void {},
});

/** A source holding `sprites` as the root scope's items, in the order given. */
const sourceOf = (root: Container, sprites: readonly Sprite[]): RenderRootSource => {
  const scope: SourceScope = createSourceScope();

  for (let i = 0; i < sprites.length; i++) {
    scope.items.push(sprites[i]!, i, 0, 0, 0, 16, 16);
  }

  const source = new RenderRootSource();

  source.adopt(root, scope, 0, 0, 0, 0);

  return source;
};

/** Carry map for "every sprite kept its position, except the ones named". */
const carryAllBut = (count: number, arrivals: readonly number[]): Int32Array => {
  const carried = new Int32Array(count);

  for (let handle = 0; handle < count; handle++) {
    carried[handle] = arrivals.includes(handle) ? -1 : handle;
  }

  return carried;
};

describe('persistent sprite slot table: structure delta rekey', () => {
  test('reads the drawables the delta did not carry, and no others', () => {
    const root = new Container();
    const texture = new Texture(null);
    const sprites = Array.from({ length: 32 }, () => new Sprite(texture));
    const store = createStore();
    const before = sourceOf(root, sprites);

    expect(fillPersistentSpriteSlotTable(before, store, 8)).toBe(true);

    const arrival = new Sprite(texture);
    const after = sourceOf(root, [...sprites.slice(0, 31), arrival]);
    const reads = vi.spyOn(Sprite.prototype, 'texture', 'get');

    try {
      expect(rekeyPersistentSpriteSlotTable(after, store, 8, carryAllBut(32, [31]), 32)).toBe(true);

      // One arrival, one read. A walk over the whole source would read 32 - the
      // cold-object cost this whole path exists to keep off a per-frame walk.
      expect(reads).toHaveBeenCalledTimes(1);
    } finally {
      reads.mockRestore();
      root.destroy();
      texture.destroy();
    }
  });

  test('carries a renumbered item’s table entry across the new numbering', () => {
    const root = new Container();
    const first = new Texture(null);
    const second = new Texture(null);
    // Handles 0 and 2 use `first`, handle 1 uses `second`, so the table entries
    // differ and a carry that ignored the map would be visible.
    const sprites = [new Sprite(first), new Sprite(second), new Sprite(first)];
    const store = createStore();

    expect(fillPersistentSpriteSlotTable(sourceOf(root, sprites), store, 8)).toBe(true);
    expect(Array.from(store.textureIndexOfHandle)).toEqual([0, 1, 0]);

    // Handle 0 left; the survivors slid down to 0 and 1 and a new sprite took 2.
    const arrival = new Sprite(second);
    const after = sourceOf(root, [sprites[1]!, sprites[2]!, arrival]);
    const carried = Int32Array.from([1, 2, -1]);

    expect(rekeyPersistentSpriteSlotTable(after, store, 8, carried, 3)).toBe(true);
    expect(Array.from(store.textureIndexOfHandle.subarray(0, 3))).toEqual([1, 0, 1]);

    root.destroy();
    first.destroy();
    second.destroy();
  });

  test('alternates between two tables instead of allocating one per rekey', () => {
    const root = new Container();
    const texture = new Texture(null);
    const sprites = [new Sprite(texture), new Sprite(texture)];
    const store = createStore();
    const source = sourceOf(root, sprites);

    expect(fillPersistentSpriteSlotTable(source, store, 8)).toBe(true);

    const carried = carryAllBut(2, []);

    rekeyPersistentSpriteSlotTable(source, store, 8, carried, 2);

    const first = store.textureIndexOfHandle;

    rekeyPersistentSpriteSlotTable(source, store, 8, carried, 2);

    const second = store.textureIndexOfHandle;

    rekeyPersistentSpriteSlotTable(source, store, 8, carried, 2);

    // Back to the first buffer: the retired table is the next one's write
    // target, so a churning root allocates none of these per frame.
    expect(second).not.toBe(first);
    expect(store.textureIndexOfHandle).toBe(first);

    root.destroy();
    texture.destroy();
  });

  test('refuses an arrival whose texture no longer fits the table', () => {
    const root = new Container();
    const first = new Texture(null);
    const second = new Texture(null);
    const store = createStore();
    const sprites = [new Sprite(first)];

    expect(fillPersistentSpriteSlotTable(sourceOf(root, sprites), store, 1)).toBe(true);

    const arrival = new Sprite(second);
    const after = sourceOf(root, [sprites[0]!, arrival]);
    const live = store.textureIndexOfHandle;

    expect(rekeyPersistentSpriteSlotTable(after, store, 1, Int32Array.from([0, -1]), 1)).toBe(false);
    // The live table is left as it was, so the caller is free to keep drawing
    // this frame's already-issued work before dropping the store.
    expect(store.textureIndexOfHandle).toBe(live);

    root.destroy();
    first.destroy();
    second.destroy();
  });

  test('refuses an arrival that disagrees with the store’s blend mode', () => {
    const root = new Container();
    const texture = new Texture(null);
    const store = createStore();
    const sprites = [new Sprite(texture)];

    expect(fillPersistentSpriteSlotTable(sourceOf(root, sprites), store, 8)).toBe(true);

    const arrival = new Sprite(texture);

    arrival.blendMode = BlendModes.Additive;

    expect(rekeyPersistentSpriteSlotTable(sourceOf(root, [sprites[0]!, arrival]), store, 8, Int32Array.from([0, -1]), 1)).toBe(false);

    root.destroy();
    texture.destroy();
  });
});
