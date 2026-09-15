/**
 * Shared scene for the bloom pixel specs (WebGL2 + WebGPU).
 *
 * The blur fixture's 16x16 white square at [24, 40) is the only thing above the
 * threshold, so everything the filter adds outside it is glow and nothing else.
 * The probes sit on the same row as the square's centre, at two distances from
 * its right edge, which is what makes "brighter near than far" a statement
 * about the falloff rather than about one pixel.
 *
 * {@link INTENSITY} is above one on purpose: a white pixel is only 0.2 over a
 * threshold of 0.8, and a glow of at most 51/255 would leave the falloff inside
 * the tolerance the pixel helpers allow.
 */

import { BloomFilter, type BloomFilterOptions } from '#rendering/filters/BloomFilter';

export const THRESHOLD = 0.8;
export const INTENSITY = 3;

/** Four pixels past the square's right edge, on its centre row. */
export const NEAR_GLOW: readonly [number, number] = [43, 32];

/** Twelve pixels past the same edge - still inside the reach, further down the falloff. */
export const FAR_GLOW: readonly [number, number] = [51, 32];

/** Deep inside the square, where the source is already white. */
export const INSIDE: readonly [number, number] = [32, 32];

/** A corner of the frame, far outside anything the glow reaches. */
export const DARK: readonly [number, number] = [3, 3];

export const bloom = (options: BloomFilterOptions = {}): BloomFilter =>
  new BloomFilter({ threshold: THRESHOLD, intensity: INTENSITY, strength: 4, levels: 2, ...options });
