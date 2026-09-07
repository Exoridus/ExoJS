import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { SOURCE_QUAD_FLOATS } from '#rendering/sourceQuadRecord';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TRANSFORM_FLOATS_PER_ROW, TRANSFORM_TINT_BYTES_PER_ROW } from '#rendering/TransformBuffer';
import type { BlendModes } from '#rendering/types';

import type { Sprite } from './Sprite';

/**
 * The parts of a backend's persistent slot store this module fills.
 *
 * Deliberately structural rather than a base class: the two stores share no
 * representation at all - one addresses its slots through data textures, the
 * other through storage buffers - and inheriting from a common ancestor would
 * be a claim about how they store things rather than about what they store.
 * @internal
 */
export interface PersistentSpriteSlotStore {
  readonly textures: Array<Texture | RenderTexture>;
  blendMode: BlendModes;
  textureIndexOfHandle: Uint8Array;
  /**
   * The table a rekey retires, kept as the next one's write target.
   *
   * Two buffers rather than one, because a rekey reads the old numbering while
   * writing the new one and an item's handle can move in either direction;
   * filling in place would overwrite an entry another item still has to read.
   * Grow-only, so a churning root allocates none per frame.
   */
  spareTextureIndexOfHandle: Uint8Array;
  ensureCapacity(slots: number): void;
  writeSlotFrom(
    slot: number,
    rows: Float32Array,
    rowOffset: number,
    tints: Uint8Array,
    tintOffset: number,
    quads: Float32Array,
    quadOffset: number,
    textureIndex: number,
  ): void;
}

/**
 * Decide whether one slot store can serve every sprite in `source`, filling its
 * texture table and per-handle texture index on the way.
 *
 * Three refusals, each of them a BATCHING rule rather than an ordering one -
 * ordering was already settled by the plan layer, which only offers a source
 * whose recorded order is its draw order:
 *
 * - A sprite carrying its own material takes the custom path, where a material
 *   switch is a hard flush/pipeline boundary. One ordered stream cannot express
 *   that, so any own-material item disqualifies the source.
 * - A blend-mode change is likewise a hard boundary, so the whole source has to
 *   agree on one - which is why the store keeps a single value rather than one
 *   per slot.
 * - The base textures must all fit ONE table. That is what makes a slot's
 *   texture index item-stable: with one table there is no per-batch re-slotting
 *   for a membership change to invalidate.
 *
 * Shared by both backends because it is the same question in both - the only
 * backend-specific input is `maxTextures`, the batch table's width. Runs once
 * per built source, never per frame.
 * @internal
 */
export const fillPersistentSpriteSlotTable = (source: RenderRootSource, store: PersistentSpriteSlotStore, maxTextures: number): boolean => {
  const textureIndexOfHandle = new Uint8Array(source.itemCount);
  let blendMode: BlendModes | null = null;

  for (const scope of source.scopes) {
    const drawables = scope.items.drawables;
    const count = scope.items.count;
    const handleBase = scope.handleBase;

    for (let i = 0; i < count; i++) {
      const sprite = drawables[i] as Sprite;
      const texture = sprite.texture;

      if (texture === null || sprite.material !== null) {
        return false;
      }

      const mode = sprite.blendMode;

      if (blendMode === null) {
        blendMode = mode;
      } else if (blendMode !== mode) {
        return false;
      }

      let index = store.textures.indexOf(texture);

      if (index === -1) {
        if (store.textures.length >= maxTextures) {
          return false;
        }

        index = store.textures.push(texture) - 1;
      }

      // Recorded per item here, on the walk that builds the table anyway, so an
      // ENTER never has to ask a drawable which texture it uses.
      textureIndexOfHandle[handleBase + i] = index;
    }
  }

  if (blendMode === null) {
    return false;
  }

  store.blendMode = blendMode;
  store.textureIndexOfHandle = textureIndexOfHandle;

  return true;
};

/**
 * Re-derive the table after a structure delta renumbered the source's items,
 * reading only the items the delta did not carry.
 *
 * `carried` gives, for each new handle, the handle the same drawable held
 * before, or -1. A carried item is by construction unchanged - the delta
 * withdraws the carry of anything marked since the last selection - so its
 * entry is copied across the renumbering instead of being re-derived, and the
 * drawable is not touched at all. Only arrivals are asked for their texture,
 * material and blend mode, which is what keeps a churning root's cost
 * proportional to what it added rather than to what it holds.
 *
 * The table stays append-only, so every entry an arrival copies still names the
 * texture it was written for. `false` leaves the store untouched and means it
 * can no longer serve the source: the caller must drop it, and the next
 * acquisition then starts from an empty table.
 * @internal
 */
export const rekeyPersistentSpriteSlotTable = (
  source: RenderRootSource,
  store: PersistentSpriteSlotStore,
  maxTextures: number,
  carried: Int32Array,
  previousHandleCount: number,
): boolean => {
  const count = source.itemCount;
  const before = store.textureIndexOfHandle;
  const target = store.spareTextureIndexOfHandle.length >= count ? store.spareTextureIndexOfHandle : new Uint8Array(count);

  for (const scope of source.scopes) {
    const drawables = scope.items.drawables;
    const items = scope.items.count;
    const handleBase = scope.handleBase;

    for (let i = 0; i < items; i++) {
      const handle = handleBase + i;
      const previous = carried[handle]!;

      if (previous >= 0 && previous < previousHandleCount) {
        target[handle] = before[previous]!;

        continue;
      }

      const sprite = drawables[i] as Sprite;
      const texture = sprite.texture;

      if (texture === null || sprite.material !== null || sprite.blendMode !== store.blendMode) {
        return false;
      }

      let index = store.textures.indexOf(texture);

      if (index === -1) {
        if (store.textures.length >= maxTextures) {
          return false;
        }

        index = store.textures.push(texture) - 1;
      }

      target[handle] = index;
    }
  }

  store.spareTextureIndexOfHandle = before;
  store.textureIndexOfHandle = target;

  return true;
};

/**
 * Fill the persistent rows of the items that just took a slot, entirely from the
 * source's prepacked tables.
 *
 * `entered` is a flat `(scopeOrdinal, localIndex, slot)` triple list holding
 * arrivals only - a staying item's rows are already what this would write, which
 * is the whole saving. No drawable is touched: an item entering the view has not
 * been read for hundreds of frames, and resolving its transform, bounds and
 * texture frame out of cold objects was the measured cost of a camera step.
 * Everything here is a fixed-size copy between typed arrays, plus one lookup for
 * the store-table texture index.
 *
 * The capacity pass runs first and over the whole list, so a store grows at most
 * once per selection no matter how the arrivals are ordered.
 * @internal
 */
export const writePersistentSpriteSlots = (store: PersistentSpriteSlotStore, source: RenderRootSource, entered: Int32Array, count: number): void => {
  const scopes = source.scopes;
  const textureIndexOfHandle = store.textureIndexOfHandle;
  let highest = -1;

  for (let i = 0; i < count; i++) {
    const slot = entered[i * 3 + 2]!;

    if (slot > highest) {
      highest = slot;
    }
  }

  store.ensureCapacity(highest + 1);

  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const scope = scopes[entered[base]!]!;
    const localIndex = entered[base + 1]!;
    const items = scope.items;

    store.writeSlotFrom(
      entered[base + 2]!,
      items.rows,
      localIndex * TRANSFORM_FLOATS_PER_ROW,
      items.tints,
      localIndex * TRANSFORM_TINT_BYTES_PER_ROW,
      items.quads,
      localIndex * SOURCE_QUAD_FLOATS,
      textureIndexOfHandle[scope.handleBase + localIndex]!,
    );
  }
};
