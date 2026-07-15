/**
 * A chunk payload ready to install into a {@link import('./TileLayer').TileLayer}
 * via {@link import('./TileLayer').TileLayer._adoptChunk} — the same shape
 * {@link import('./TileChunk').TileChunk}'s constructor accepts as its
 * `source` parameter, named and exported so provider authors have a type to
 * import instead of matching an inline shape.
 * @advanced
 */
export interface ChunkPayload {
  readonly width: number;
  readonly height: number;
  readonly tiles: Uint32Array;
}

/**
 * Supplies chunk data for one {@link import('./TileLayer').TileLayer} on
 * demand, keyed by signed chunk coordinates — the abstraction a
 * {@link import('./ChunkStreamer').ChunkStreamer} drives to implement chunk
 * streaming, and the seam a format adapter or a procedural generator
 * implements.
 *
 * `getChunk` may return synchronously (e.g. slicing already-parsed source
 * data) or a `Promise` (e.g. an expensive procedural-generation algorithm,
 * plausibly off the main thread) — {@link import('./ChunkStreamer').ChunkStreamer}
 * installs a synchronous result in the same tick it was requested, with
 * zero pop-in. Returning `null` (synchronously or via a resolved `Promise`)
 * means "no data for this coordinate" — e.g. outside a finite provider's
 * authored extent, even though the layer itself may be unbounded.
 * @advanced
 */
export interface ChunkSource {
  getChunk(cx: number, cy: number): ChunkPayload | null | Promise<ChunkPayload | null>;
}
