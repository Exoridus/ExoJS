/**
 * Options accepted by both the runtime (`TileMap`) and source (`TiledMap`)
 * asset bindings when loading a Tiled map.
 * @advanced
 */
export interface TiledLoadOptions {
  /**
   * Explicit format hint for ambiguous file extensions.
   *
   * `.tmj`/`.tsj` paths are recognised by extension and need no hint. Provide
   * `format: 'tiled'` when loading Tiled map data from a generic `.json` path:
   * `loader.load(Asset.kind('tileMap', 'world.json', { format: 'tiled' }))`. `'tiled'` is the
   * only accepted value, so a foreign format (e.g. `'ldtk'`) is a compile error
   * rather than a silent runtime fall-through.
   *
   * The hint participates in the asset identity key, so the same source loaded
   * under different (future) formats resolves to distinct cache entries.
   */
  readonly format?: 'tiled';
}

/**
 * Applies defaults and returns a normalized options object.
 *
 * Tiled parsing is unconditionally strict: {@link validateTiledMapData} throws
 * a `TiledFormatError` on any malformed *known* field and silently preserves
 * unknown fields. There is intentionally no `strict` toggle — a permissive
 * parse mode is a potential v0.14 follow-up, not part of v0.13.
 */
export function resolveTiledOptions(options: TiledLoadOptions | undefined): { format: 'tiled' } {
  return {
    format: options?.format ?? 'tiled',
  };
}
