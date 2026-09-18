import type { ArchetypeSpec } from './EngineAdapter';

/** Whether an archetype lights its scene rather than drawing it flat. */
export const isLit = (spec: ArchetypeSpec): boolean => spec.lights !== undefined;

/** Edge of the square the lit sprite field covers, in logical pixels. */
export const LIT_FIELD_SIZE = 1_200;

/** Sprites in the lit field. Fixed at every rung: what the ladder sweeps is the light count. */
export const LIT_SPRITE_COUNT = 2_000;

/** Edge of one sprite in the field, in logical pixels. */
export const LIT_SPRITE_SIZE = 24;

/**
 * Radius of one light, in logical pixels.
 *
 * The lightmap renderer's cost per light is the fill of its own radius, so this
 * is the number the archetype is really sweeping against the light count - a
 * figure quoted without it says nothing. Sized so that a light covers about a
 * fortieth of the field: large enough to overlap its neighbours, small enough
 * that a hundred of them do not simply resolve the viewport a hundred times
 * over and turn the row into `overdraw` under another name.
 */
export const LIT_LIGHT_RADIUS = 180;

/** Occluding edges in the field, as one closed box per cluster of sprites. */
export const LIT_OCCLUDER_BOXES = 24;

/**
 * Where light `index` sits in the field, and how bright it is.
 *
 * A fixed lattice with an irrational stride rather than a grid: a grid would put
 * every light the same distance from its neighbours, so the overlap - which is
 * the whole cost of an accumulated light field - would be a step function of the
 * count rather than a smooth one. Nothing here is random, so two runs place the
 * same lights, and the first N of a longer ladder are the first N of a shorter
 * one.
 */
export const litLightAt = (index: number): { x: number; y: number; intensity: number } => {
  const golden = 0.618033988749895;
  const along = (index * golden) % 1;
  const across = (index * golden * golden) % 1;

  return {
    x: along * LIT_FIELD_SIZE,
    y: across * LIT_FIELD_SIZE,
    // A small spread, so a renderer cannot collapse the batch by noticing that
    // every instance carries identical data.
    intensity: 0.8 + ((index % 5) / 5) * 0.4,
  };
};

/** Where sprite `index` of `count` sits in the field. */
export const litSpriteAt = (index: number, count: number): { x: number; y: number } => {
  const columns = Math.max(1, Math.round(Math.sqrt(count)));
  const spacing = LIT_FIELD_SIZE / columns;

  return {
    x: (index % columns) * spacing,
    y: Math.floor(index / columns) * spacing,
  };
};

/** The corners of occluding box `index`, in the order a closed outline wants them. */
export const litOccluderBox = (index: number): ReadonlyArray<{ x: number; y: number }> => {
  const columns = Math.max(1, Math.round(Math.sqrt(LIT_OCCLUDER_BOXES)));
  const spacing = LIT_FIELD_SIZE / columns;
  const left = (index % columns) * spacing + spacing / 4;
  const top = Math.floor(index / columns) * spacing + spacing / 4;
  const size = spacing / 2;

  return [
    { x: left, y: top },
    { x: left + size, y: top },
    { x: left + size, y: top + size },
    { x: left, y: top + size },
  ];
};
