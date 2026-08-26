import type { MapBounds, MapWorld, MapWorldRuntime } from '@codexo/exojs-tilemap';

// #region guide:level-streaming
export function updateStreaming(runtime: MapWorldRuntime, world: MapWorld, cameraBounds: MapBounds): void {
  const wanted = new Set(world.getLevelsInBounds(cameraBounds).map(level => level.id));

  for (const id of wanted) {
    if (!runtime.isLoaded(id) && !runtime.isLoading(id)) void runtime.loadLevel(id);
  }

  for (const level of runtime.levels) {
    if (!wanted.has(level.id)) runtime.unloadLevel(level.id);
  }
}
// #endregion guide:level-streaming

// #region guide:cancellable-load
export function loadCancellable(runtime: MapWorldRuntime, signal: AbortSignal): Promise<unknown> {
  return runtime.loadLevel('level-forest', { signal });
}
// #endregion guide:cancellable-load
