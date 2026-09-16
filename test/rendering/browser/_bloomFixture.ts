/**
 * Shared scenes for the bloom pixel specs (WebGL2 + WebGPU).
 *
 * Three shapes, each isolating one thing the filter promises:
 *
 * - {@link bloom} over the blur fixture's 16x16 white square, where everything
 *   outside the square is glow and nothing else. The probes sit on the square's
 *   centre row at two distances from its right edge, which is what makes
 *   "brighter near than far" a statement about the falloff rather than about
 *   one pixel.
 * - {@link plateauScene}, a wide region of ONE colour whose middle is further
 *   from any edge than the glow can reach. A constant survives a halving, a
 *   blur and a doubling unchanged, so its centre must read the same at every
 *   `levels` - which it does not if the upsample accumulates the unblurred
 *   levels it passes.
 * - {@link backdropScene}, a half-transparent red square over an opaque blue
 *   field. The glow is red and the backdrop is blue, so the blue channel says
 *   whether the halo was added as light or composited as coverage.
 *
 * {@link INTENSITY} is above one on purpose: a white pixel is only 0.2 over a
 * threshold of 0.8, and a glow of at most 51/255 would leave the falloff inside
 * the tolerance the pixel helpers allow.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { BloomFilter, type BloomFilterOptions } from '#rendering/filters/BloomFilter';
import type { Filter } from '#rendering/filters/Filter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { BLUR_SCENE_SIZE } from './_blurFilterFixture';

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

/** A `size x size` texture of one flat, opaque colour. */
const flatTexture = (color: Color, size: number): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (context === null) throw new Error('A 2D context is required to build bloom fixtures.');

  context.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

// ---------------------------------------------------------------------------
// The plateau: one colour, wide enough that its middle sees no edge
// ---------------------------------------------------------------------------

/** Bright enough to bloom, dim enough that the glow on top of it does not clip. */
export const PLATEAU_COLOR = new Color(153, 153, 153, 1);
export const PLATEAU_THRESHOLD = 0.3;

/** 48 of the 64 pixels on each axis, so the centre is 24 from the nearest edge. */
const PLATEAU_ORIGIN = 8;
const PLATEAU_EXTENT = 48;

/** The middle of the plateau - further from an edge than any `levels` can reach. */
export const PLATEAU: readonly [number, number] = [32, 32];

export const plateauScene = (levels: number): { root: Container; texture: Texture; filter: Filter } => {
  const texture = flatTexture(PLATEAU_COLOR, PLATEAU_EXTENT);
  const root = new Container();
  const filtered = new Container();
  const sprite = new Sprite(texture);
  // A short strength on purpose: the reach has to stay well inside the 24
  // pixels between the probe and the plateau's edge at every `levels` under
  // test, or the comparison would be measuring the edge instead of the middle.
  const filter = new BloomFilter({ threshold: PLATEAU_THRESHOLD, intensity: 1, strength: 2, levels });

  sprite.setPosition(PLATEAU_ORIGIN, PLATEAU_ORIGIN);
  filtered.addFilter(filter);
  filtered.addChild(sprite);
  root.addChild(filtered);

  return { root, texture, filter };
};

// ---------------------------------------------------------------------------
// The backdrop: a coloured glow over a field of another colour
// ---------------------------------------------------------------------------

/** Opaque, and in a channel the red glow contributes nothing to. */
export const BACKDROP_COLOR = new Color(0, 0, 200, 1);
export const SUBJECT_COLOR = new Color(255, 0, 0, 1);
export const SUBJECT_ALPHA = 0.5;

/** Inside the half-transparent square, where the backdrop must still show through. */
export const OVER_SUBJECT: readonly [number, number] = [32, 32];

/** Outside it, in the halo, where the backdrop must be brightened and never dimmed. */
export const OVER_BACKDROP: readonly [number, number] = [44, 32];

/** Far enough out that no glow reaches it - the untouched backdrop, for comparison. */
export const UNTOUCHED_BACKDROP: readonly [number, number] = [2, 2];

export const backdropScene = (): { root: Container; textures: readonly Texture[]; filter: Filter } => {
  const backdropTexture = flatTexture(BACKDROP_COLOR, BLUR_SCENE_SIZE);
  const subjectTexture = flatTexture(SUBJECT_COLOR, 16);
  const root = new Container();
  const backdrop = new Sprite(backdropTexture);
  const filtered = new Container();
  const subject = new Sprite(subjectTexture);
  // A low threshold: the extraction reads the PREMULTIPLIED luma, and a red at
  // half alpha carries barely a tenth of the range.
  const filter = new BloomFilter({ threshold: 0.05, intensity: 3, strength: 4, levels: 2 });

  subject.setPosition(24, 24);
  // Transparency is the TINT's alpha here - there is no separate node opacity.
  subject.setTint(new Color(255, 255, 255, SUBJECT_ALPHA));
  filtered.addFilter(filter);
  filtered.addChild(subject);

  // The backdrop is a SIBLING, not a child: inside the filtered subtree it
  // would be part of the captured input and would bloom along with the subject.
  root.addChild(backdrop);
  root.addChild(filtered);

  return { root, textures: [backdropTexture, subjectTexture], filter };
};
