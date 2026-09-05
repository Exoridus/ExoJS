/**
 * Shared scene for the drop-shadow pixel specs (WebGL2 + WebGPU).
 *
 * The blur fixture's 16x16 white square at [24, 40) is shadowed with a red,
 * fully opaque shadow offset by {@link SHADOW_OFFSET}, so the band
 * [40, 48) on both axes is shadow only, [24, 32) is source only and the
 * square's centre is source over shadow.
 */

import { Color } from '#core/Color';
import { DropShadowFilter, type DropShadowFilterOptions } from '#rendering/filters/DropShadowFilter';

export const SHADOW_OFFSET = 8;

/** Inside the square, outside the shifted shadow: the source alone. */
export const SOURCE_ONLY: readonly [number, number] = [26, 26];

/** Inside both: the source drawn over the shadow. */
export const OVERLAP: readonly [number, number] = [36, 36];

/** Inside the shifted shadow, outside the square: the shadow alone. */
export const SHADOW_ONLY: readonly [number, number] = [44, 44];

/** One pixel beyond the hard shadow's far corner: reached only by blur. */
export const BEYOND_SHADOW: readonly [number, number] = [49, 49];

export const SHADOW_COLOR = new Color(255, 0, 0, 1);

export const dropShadow = (options: DropShadowFilterOptions = {}): DropShadowFilter =>
  new DropShadowFilter({ offsetX: SHADOW_OFFSET, offsetY: SHADOW_OFFSET, blur: 0, color: SHADOW_COLOR, ...options });
