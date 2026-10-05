/**
 * Colour is linear light and may exceed 1 when the working format is HDR, so every stage that carries it
 * declares full precision for both floats and samplers. A GLSL ES 3.00 fragment shader defaults a sampler
 * to lowp, and the precision of a lookup is the sampler's: a lowp default is only harmless while the
 * value being sampled fits 8 bits.
 *
 * This reads the sources because the desktop and software backends the browser lanes run on execute every
 * qualifier at full precision, so no pixel readback there can catch a reduced qualifier.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

const colourFragmentStages = [
  'src/rendering/webgl2/shaders/sprite.frag',
  'src/rendering/webgl2/shaders/repeating-sprite.frag',
  'src/rendering/webgl2/shaders/mesh.frag',
  'src/rendering/webgl2/shaders/mask-compose.frag',
  'src/rendering/webgl2/shaders/text-color.frag',
  'src/rendering/webgl2/shaders/backdrop-blend.frag',
  'src/rendering/webgl2/shaders/texture-normalize.frag',
  'src/rendering/shaders/output.frag',
  'src/rendering/filters/shaders/bloom-threshold.frag',
  'src/rendering/filters/shaders/blur.frag',
  'src/rendering/filters/shaders/color-matrix.frag',
  'src/rendering/filters/shaders/displacement.frag',
  'src/rendering/filters/shaders/drop-shadow.frag',
  'src/rendering/filters/shaders/lut-3d.frag',
  'src/rendering/filters/shaders/lut-rgb1d.frag',
  'packages/exojs-particles/src/renderers/shaders/particle.frag',
  'packages/exojs-particles/src/renderModes/shaders/trail.frag',
  'packages/exojs-particles/src/renderModes/shaders/ribbon.frag',
  'packages/exojs-tilemap/src/webgl2/shaders/tile-chunk.frag',
  'packages/exojs-lighting/src/shaders/lit-sprite.frag',
];

describe('colour fragment stage precision', () => {
  test.each(colourFragmentStages)('%s declares highp float and no reduced sampler default', file => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');

    expect(source).toMatch(/^precision highp float;/m);
    expect(source).not.toMatch(/^precision (?:lowp|mediump) float;/m);
    expect(source).not.toMatch(/^precision (?:lowp|mediump) sampler2D;/m);
  });

  test.each(colourFragmentStages.filter(file => !/lit-sprite|tile-chunk|backdrop|normalize|output|blur|bloom/.test(file)))(
    '%s sets the default sampler precision',
    file => {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).toMatch(/^precision highp sampler2D;/m);
    },
  );
});
