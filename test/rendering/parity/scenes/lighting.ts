/**
 * Lit-sprite scenes.
 *
 * The `forward` renderer shades inside the sprite fragment stage against a
 * packed `rgba32f` light texture, which makes `lit-sprite.frag` / `.wgsl` the
 * only custom sprite-material pair in the repository - a shader the core sprite
 * path never exercises, and the one place a backend could disagree about how a
 * normal is rotated into world space or how a cone falls off.
 *
 * The `lightmap` renderer is deliberately absent. It works on the frame the
 * application drew, through `app.framePasses`, and the runner renders a
 * container rather than a frame - there is no frame slot for its composite to
 * live in. What it does instead is covered by dedicated readback tests on both
 * backends in `webgl2-lightmap.test.ts` and `webgpu-lightmap.test.ts`.
 *
 * Every light here sits off both centre lines. Four stage-1 bugs in this
 * package survived a test suite that placed its lights on the vertical centre
 * or compared left against right, and a symmetric parity scene would be blind
 * to exactly the same class of mistake.
 */

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';

// Package path rather than the alias: `@codexo/exojs-lighting` is aliased for
// the browser projects, but a parity scene is imported by the matrix entry
// point too, and the source path is what both resolve.
import { Lighting, LitMaterial, normalMap, PointLight, SpotLight } from '../../../../packages/exojs-lighting/src/index';
import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import type { Scene } from '../types';

const FIXTURE = 16;
const CANVAS = 64;

/**
 * A normal map that leans a different way in each quadrant, so a backend that
 * rotated a normal wrongly, swapped a channel or mirrored an axis produces a
 * visibly different picture rather than the same one slightly darker.
 */
const buildNormalMap = (size: number): DataTexture<TextureFormat.Rgba8> => {
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const leanX = x < half ? -0.6 : 0.6;
      const leanY = y < half ? 0.4 : -0.4;

      data[index] = Math.round((leanX * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round((leanY * 0.5 + 0.5) * 255);
      data[index + 2] = 255;
      data[index + 3] = 255;
    }
  }

  return new DataTexture({ width: size, height: size, format: TextureFormat.Rgba8, data });
};

export const lightingScenes: readonly Scene[] = [
  {
    name: 'lighting/lit-sprite',
    feature: 'Lighting',
    size: CANVAS,
    // The light term multiplies the albedo, so the channels stop spelling out
    // texel coordinates even though the geometry is still exact.
    fixture: 'colour-modified',
    nearestSampled: true,
    build: () => {
      const root = new Container();
      const lighting = new Lighting({ maxLights: 4 });
      const albedo = buildCoordinateTexture(FIXTURE);
      const material = new LitMaterial({ lighting, normals: normalMap(buildNormalMap(FIXTURE)) });
      const ground = new Sprite(albedo);

      ground.material = material;
      ground.setPosition(8, 8).setScale(3, 3);
      root.addChild(ground);

      // Off both centre lines, and of different shapes: a cone whose axis is a
      // diagonal is the one placement that fails if either the rotation or the
      // cone term is wrong.
      lighting.add(new PointLight({ radius: 40, intensity: 1.2, height: 18 })).setPosition(20, 44);
      lighting
        .add(new SpotLight({ radius: 52, angle: 40, coneSoftness: 0.35, intensity: 1.5, height: 26 }))
        .setPosition(46, 14)
        .setRotation(125);
      lighting.update();

      return root;
    },
  },
];
