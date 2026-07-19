import { PixelSnapMode } from '@codexo/exojs/renderer-sdk';

/**
 * Throw a deterministic error when `mode` is not a valid {@link PixelSnapMode}.
 *
 * Mirrors the core `Drawable` setter's guard so the tilemap node passthroughs
 * (`TileMapView` / `TileMapNode` / `TileLayerNode`) reject JavaScript-invalid
 * values atomically — even for an empty layer that has no chunk drawable to
 * delegate the validation to. Kept local because the core guard is not part of
 * the public API surface.
 * @internal
 */
export function assertPixelSnapMode(mode: PixelSnapMode): void {
  // Widen first: the parameter type would otherwise narrow the third
  // comparison to a statically-false branch, but JavaScript callers can pass
  // anything.
  const value: unknown = mode;

  if (value !== PixelSnapMode.None && value !== PixelSnapMode.Position && value !== PixelSnapMode.Geometry) {
    throw new Error(`pixelSnapMode must be a PixelSnapMode enum value (got ${String(mode)}).`);
  }
}
