import type { PixelSnapMode } from '@codexo/exojs/renderer-sdk';

const validPixelSnapModes: ReadonlySet<string> = new Set<string>(['none', 'position', 'geometry']);

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
  if (typeof mode !== 'string' || !validPixelSnapModes.has(mode)) {
    throw new Error(`pixelSnapMode must be 'none', 'position', or 'geometry' (got ${String(mode)}).`);
  }
}
