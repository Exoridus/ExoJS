import type { PlatformAdapter, PlatformSubscription } from '#platform/PlatformAdapter';
import { isDomCanvas, type RenderSurface } from '#platform/RenderSurface';

import { assert } from './dev';

/**
 * Upper bound for the auto-resolved device-pixel ratio. Caps the backing-store
 * blow-up on very high-density screens (e.g. DPR-3 phones would otherwise
 * allocate 9x the logical pixels -> fill-rate / memory pressure and frame
 * drops) while keeping rendering crisp where it matters. Bypassed by an
 * explicit `canvas.pixelRatio` option.
 */
const maxAutoPixelRatio = 2;

/**
 * The canvas an {@link Application} draws into when the caller named none.
 *
 * @internal
 */
export const createDefaultCanvas = (): HTMLCanvasElement => {
  assert(
    typeof document !== 'undefined',
    'Application has no document to create a canvas in. Outside a browser window - in a worker, say - pass the surface yourself via `canvas.element` (an OffscreenCanvas transferred from the host).',
  );

  return document.createElement('canvas');
};

/**
 * Whether `value` can be used as a {@link RenderSurface} at all.
 *
 * @internal
 */
export const isRenderSurface = (value: unknown): value is RenderSurface =>
  isDomCanvas(value as RenderSurface) || (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas);

/**
 * Clamp a host device-pixel ratio to the ceiling the auto policy allows, and
 * fall back to `1` for a host that reports nothing usable - a non-browser, SSR
 * or test realm.
 *
 * @internal
 */
export const clampAutoPixelRatio = (ratio: number | undefined): number => (typeof ratio === 'number' && ratio > 0 ? Math.min(ratio, maxAutoPixelRatio) : 1);

/**
 * The auto device-pixel ratio for the realm the application starts in.
 *
 * @internal
 */
export const resolveAutoPixelRatio = (): number => clampAutoPixelRatio((globalThis as { devicePixelRatio?: number }).devicePixelRatio);

/**
 * Report every host device-pixel-ratio change that moves the clamped auto
 * ratio, starting from `current`. `null` when the host cannot observe the ratio
 * at all, in which case the application keeps the ratio it started with.
 *
 * The clamp is applied before the comparison on purpose: a host moving between
 * two ratios that both exceed the ceiling renders identically, and re-deriving
 * the canvas geometry for it would discard the drawing buffer for nothing.
 *
 * @internal
 */
export const watchAutoPixelRatio = (platform: PlatformAdapter, current: number, onChange: (ratio: number) => void): PlatformSubscription | null =>
  platform.onPixelRatioChange?.(hostRatio => {
    const ratio = clampAutoPixelRatio(hostRatio);

    if (ratio !== current) {
      current = ratio;
      onChange(ratio);
    }
  }) ?? null;
