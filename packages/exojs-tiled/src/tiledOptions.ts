/**
 * Options accepted by both the runtime (`TileMap`) and source (`TiledMap`)
 * asset bindings when loading a Tiled map.
 * @advanced
 */
export interface TiledLoadOptions {
  /**
   * Explicit format hint for ambiguous file extensions.
   * `.tmj` paths need no hint; required for `.json` paths that contain Tiled
   * map data (`loader.load(TileMap, 'world.json', { format: 'tiled' })`).
   * A mismatched hint (e.g. `format: 'ldtk'` for a `.tmj` file) is an error.
   */
  readonly format?: 'tiled';
  /**
   * When `true` (the default), validation errors in the Tiled map are fatal.
   * Set to `false` to tolerate minor spec deviations at the cost of potentially
   * incorrect map data; affects cache identity (a strict and a non-strict load
   * of the same URL are treated as distinct assets).
   */
  readonly strict?: boolean;
}

/** Applies defaults and returns a normalized options object. */
export function resolveTiledOptions(options: TiledLoadOptions | undefined): { format: 'tiled'; strict: boolean } {
  return {
    format: options?.format ?? 'tiled',
    strict: options?.strict ?? true,
  };
}
