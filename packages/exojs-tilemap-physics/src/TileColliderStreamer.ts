import { PhysicsBody, type PhysicsWorld } from '@codexo/exojs-physics';
import type { ReadonlyTileChunk, TileLayer, TileMapObject } from '@codexo/exojs-tilemap';
import { buildTileCollisionGeometry } from '@codexo/exojs-tilemap';

import { buildTileColliders } from './buildColliders';
import { resolveDefaults, type ResolvedMaterial } from './material';
import type { ColliderDefaults, TileRegionMode } from './types';

/** Options for a {@link TileColliderStreamer}. All optional. */
export interface TileColliderOptions extends ColliderDefaults {
  /** How solid whole-cell regions are represented. Default `'boxes'`. */
  regionMode?: TileRegionMode;
  /**
   * Merge adjacent whole-cell boxes sharing a `type` into larger rectangles.
   * Default `true`. Merging never crosses a chunk boundary.
   */
  merge?: boolean;
  /** Drop a source shape before any collider is built for it. */
  accept?: (object: TileMapObject, tx: number, ty: number) => boolean;
}

interface ChunkEntry {
  readonly cx: number;
  readonly cy: number;
  /** The chunk instance the body was built from; a re-adopted chunk is a new one. */
  readonly chunk: ReadonlyTileChunk;
  readonly revision: number;
  /** `null` when the chunk holds no collision geometry at all. */
  readonly body: PhysicsBody | null;
}

const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

/**
 * Keeps a physics world's static tile colliders in sync with a
 * {@link TileLayer}: one static body per resident chunk, rebuilt when that
 * chunk changes, destroyed when it is evicted.
 *
 * The bridge owns every body it creates and nothing else. It observes the layer
 * through its public revision counters, so it works with any chunk source -
 * {@link import('@codexo/exojs-tilemap').ChunkStreamer}, a hand-rolled loader,
 * or a fully resident bounded layer.
 *
 * Tick it from your update loop:
 *
 * ```ts
 * const colliders = new TileColliderStreamer(world, layer);
 * scene.systems.add({ update: () => colliders.sync() });
 * ```
 *
 * Two consequences worth knowing before shipping a level:
 *
 * - Whole-cell merging never crosses a chunk boundary, so a solid run spanning
 *   two chunks is at least two rectangles. This is what makes the result
 *   independent of the order chunks were loaded in.
 * - A dynamic body resting on a chunk that gets evicted falls. Eviction is the
 *   chunk source's decision; widen its unload radius if that matters.
 */
export class TileColliderStreamer {
  private readonly _world: PhysicsWorld;
  private readonly _layer: TileLayer;
  private readonly _options: TileColliderOptions;
  private readonly _defaults: ResolvedMaterial;
  private readonly _regionMode: TileRegionMode;

  private readonly _built = new Map<string, ChunkEntry>();
  private readonly _seen = new Set<string>();

  private _layerRevision = -1;
  private _offsetX: number;
  private _offsetY: number;
  private _destroyed = false;

  public constructor(world: PhysicsWorld, layer: TileLayer, options: TileColliderOptions = {}) {
    this._world = world;
    this._layer = layer;
    this._options = options;
    this._defaults = resolveDefaults(options);
    this._regionMode = options.regionMode ?? 'boxes';
    this._offsetX = layer.offsetX;
    this._offsetY = layer.offsetY;
  }

  /** Number of bodies currently owned by this bridge. */
  public get bodyCount(): number {
    let count = 0;

    for (const entry of this._built.values()) {
      if (entry.body !== null) count++;
    }

    return count;
  }

  /**
   * The bodies this bridge owns, in `(cy, cx)` chunk order - independent of the
   * order the chunks became resident in.
   */
  public *bodies(): IterableIterator<PhysicsBody> {
    const ordered = [...this._built.values()].sort((a, b) => a.cy - b.cy || a.cx - b.cx);

    for (const entry of ordered) {
      if (entry.body !== null) yield entry.body;
    }
  }

  /**
   * Bring the world's tile colliders up to date with the layer: build bodies
   * for newly resident chunks, rebuild edited ones, destroy evicted ones.
   *
   * Cheap to call every frame. With no change since the last call it performs
   * no work and allocates nothing. No-op once {@link destroy}ed or once the
   * layer is destroyed.
   */
  public sync(): void {
    if (this._destroyed || this._layer.destroyed) return;

    const layer = this._layer;
    const offsetChanged = layer.offsetX !== this._offsetX || layer.offsetY !== this._offsetY;

    if (!offsetChanged && layer.revision === this._layerRevision) return;

    if (offsetChanged) {
      // Geometry is emitted in layer pixel space, so a moved layer invalidates
      // every collider - and moving a layer does not bump its revision.
      this._clear();
      this._offsetX = layer.offsetX;
      this._offsetY = layer.offsetY;
    }

    const seen = this._seen;

    seen.clear();

    for (const chunk of layer.loadedChunks()) {
      const key = chunkKey(chunk.cx, chunk.cy);
      const entry = this._built.get(key);

      seen.add(key);

      if (entry?.chunk === chunk && entry.revision === chunk.revision) {
        continue;
      }

      if (entry?.body != null) {
        this._world.destroyBody(entry.body);
      }

      this._built.set(key, {
        cx: chunk.cx,
        cy: chunk.cy,
        chunk,
        revision: chunk.revision,
        body: this._buildChunk(chunk),
      });
    }

    for (const [key, entry] of this._built) {
      if (seen.has(key)) continue;

      if (entry.body !== null) this._world.destroyBody(entry.body);
      this._built.delete(key);
    }

    this._layerRevision = layer.revision;
  }

  /**
   * Destroy every body this bridge created and stop responding to
   * {@link sync}. Bodies it did not create are untouched. Idempotent.
   */
  public destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._clear();
  }

  private _clear(): void {
    for (const entry of this._built.values()) {
      if (entry.body !== null) this._world.destroyBody(entry.body);
    }

    this._built.clear();
    this._layerRevision = -1;
  }

  private _buildChunk(chunk: ReadonlyTileChunk): PhysicsBody | null {
    const layer = this._layer;
    const options = this._options;
    const startTx = chunk.cx * layer.chunkWidth;
    const startTy = chunk.cy * layer.chunkHeight;
    const geometry = buildTileCollisionGeometry(layer, {
      region: { x: startTx, y: startTy, width: chunk.width, height: chunk.height },
      ...(options.merge !== undefined && { merge: options.merge }),
      ...(options.accept !== undefined && { accept: options.accept }),
    });

    if (geometry.rects.length === 0 && geometry.shapes.length === 0) {
      return null;
    }

    const x = startTx * layer.tileWidth + layer.offsetX;
    const y = startTy * layer.tileHeight + layer.offsetY;
    const colliders = buildTileColliders(geometry, {
      x,
      y,
      tileWidth: layer.tileWidth,
      tileHeight: layer.tileHeight,
      layerOffsetX: layer.offsetX,
      layerOffsetY: layer.offsetY,
      regionMode: this._regionMode,
      defaults: this._defaults,
      material: options.material,
    });

    if (colliders.length === 0) {
      return null;
    }

    return this._world.add(new PhysicsBody({ type: 'static', position: { x, y }, colliders }));
  }
}
