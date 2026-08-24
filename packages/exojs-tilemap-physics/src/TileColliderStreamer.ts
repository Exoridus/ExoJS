import { PhysicsBody, type PhysicsWorld } from '@codexo/exojs-physics';
import type { ReadonlyTileChunk, TileCellSource, TileLayer, TileMapObject } from '@codexo/exojs-tilemap';
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
  /**
   * Per-cell collision classification, for layers whose collision is authored
   * per cell rather than per tile. On a bounded layer this makes the bridge
   * cover the whole layer, including partitions that hold no tiles at all.
   *
   * Sampled while a partition is built and expected to answer identically for
   * the lifetime of this bridge: changing what it returns does not invalidate
   * colliders that already exist. Rebuild by recreating the bridge.
   */
  cells?: TileCellSource | undefined;
}

/**
 * One collision build block: the deterministic spatial partition this bridge
 * may own a body for. A partition is not the same thing as tile residency - a
 * cell source covers partitions that hold no {@link ReadonlyTileChunk} at all,
 * and nothing here makes a non-resident chunk look resident.
 *
 * An entry with `body === null` is a cached empty result, not an absence: it
 * is what keeps an unrelated layer revision from re-walking every cell of
 * every empty partition.
 */
interface BlockEntry {
  readonly cx: number;
  readonly cy: number;
  /** The chunk the body was built from; `null` for a cell-only partition. A re-adopted chunk is a new one. */
  readonly chunk: ReadonlyTileChunk | null;
  readonly revision: number;
  /** `null` when the partition holds no collision geometry at all. */
  readonly body: PhysicsBody | null;
}

const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

/**
 * Tile extent of a build block along one axis. Edge blocks of a bounded layer
 * are clipped, matching the dimensions the layer gives an edge chunk, so a
 * cell-only block never walks cells outside the layer.
 */
const blockExtent = (chunkExtent: number, layerExtent: number | undefined, start: number): number =>
  layerExtent === undefined ? chunkExtent : Math.min(chunkExtent, layerExtent - start);

/**
 * Keeps a physics world's static tile colliders in sync with a
 * {@link TileLayer}: one static body per chunk-sized partition of the layer,
 * rebuilt when that partition changes, destroyed when it is evicted.
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
 * - Whole-cell merging never crosses a partition boundary, so a solid run
 *   spanning two of them is at least two rectangles. This is what makes the
 *   result independent of the order chunks were loaded in.
 * - A dynamic body resting on a chunk that gets evicted falls. Eviction is the
 *   chunk source's decision; widen its unload radius if that matters.
 * - With {@link TileColliderOptions.cells}, a bounded layer's partitions are
 *   all covered, resident or not - collision authored per cell does not depend
 *   on tiles being placed.
 */
export class TileColliderStreamer {
  private readonly _world: PhysicsWorld;
  private readonly _layer: TileLayer;
  private readonly _options: TileColliderOptions;
  private readonly _defaults: ResolvedMaterial;
  private readonly _regionMode: TileRegionMode;

  private readonly _built = new Map<string, BlockEntry>();
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
   * The bodies this bridge owns, in `(cy, cx)` partition order - independent of
   * the order the chunks became resident in.
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
      this._syncBlock(chunk.cx, chunk.cy, chunk);
    }

    // A cell source covers the layer, not its residency: every partition of a
    // bounded layer is a build block, whether or not tiles were ever placed in
    // it. Without this the canonical case - collision authored per cell on a
    // layer that renders nothing - would produce no bodies at all.
    if (this._options.cells !== undefined) {
      const range = layer.chunkRange();

      if (range !== null) {
        for (let cy = range.minCy; cy <= range.maxCy; cy++) {
          for (let cx = range.minCx; cx <= range.maxCx; cx++) {
            this._syncBlock(cx, cy, layer.getChunk(cx, cy) ?? null);
          }
        }
      }
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

  /**
   * Reconcile one build block against what was built for it before. Skips
   * without sampling anything when neither the backing chunk nor its revision
   * moved - which is what keeps an empty cell-only block from re-walking its
   * cells on every unrelated layer change.
   */
  private _syncBlock(cx: number, cy: number, chunk: ReadonlyTileChunk | null): void {
    const key = chunkKey(cx, cy);

    if (this._seen.has(key)) return;

    this._seen.add(key);

    const entry = this._built.get(key);
    const revision = chunk?.revision ?? -1;

    if (entry?.chunk === chunk && entry.revision === revision) {
      return;
    }

    if (entry?.body != null) {
      this._world.destroyBody(entry.body);
    }

    this._built.set(key, { cx, cy, chunk, revision, body: this._buildBlock(cx, cy, chunk) });
  }

  private _buildBlock(cx: number, cy: number, chunk: ReadonlyTileChunk | null): PhysicsBody | null {
    const layer = this._layer;
    const options = this._options;
    const startTx = cx * layer.chunkWidth;
    const startTy = cy * layer.chunkHeight;
    const width = chunk?.width ?? blockExtent(layer.chunkWidth, layer.width, startTx);
    const height = chunk?.height ?? blockExtent(layer.chunkHeight, layer.height, startTy);
    const geometry = buildTileCollisionGeometry(layer, {
      region: { x: startTx, y: startTy, width, height },
      ...(options.merge !== undefined && { merge: options.merge }),
      ...(options.accept !== undefined && { accept: options.accept }),
      ...(options.cells !== undefined && { cells: options.cells }),
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
