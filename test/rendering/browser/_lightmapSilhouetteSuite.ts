/**
 * Where the lightmap puts a shadow edge, run by the WebGL2 and WebGPU lanes
 * alike: on the silhouette that casts it, wherever that falls within an
 * angular bin of the shadow row.
 *
 * A row that keeps one distance per bin moves every silhouette to the nearest
 * bin centre. The edge then sits up to half a bin off and, as the occluder or
 * the light moves, stands still and jumps a whole bin at a time - the stepping
 * an animated scene shows. These scenes use a coarse row so that one bin is
 * many pixels wide, and walk the silhouette across one of them.
 */

import { type Light, LightmapLighting, PointLight, PolygonOccluder, SpotLight } from '@codexo/exojs/lighting';
import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';

import { type ContactBackend, contactCanvasSize, createContactHost } from './_lightmapContact';

const bins = 64;
const binWidth = (Math.PI * 2) / bins;
const lightX = 40;
const lightY = 128;
/** The arc the edge is read along, centred on the light: constant falloff, so only the shadow varies. */
const arcRadius = 150;
const steps = 8;

interface SilhouetteScene {
  /** World angle of the silhouette as seen from the light. */
  readonly angle: number;
  readonly softness: number;
  readonly light?: 'point' | 'spot';
  /** A second wall behind the arc, covering every bin the silhouette shares. */
  readonly backdrop?: boolean;
}

const createLight = (scene: SilhouetteScene): Light => {
  const light =
    scene.light === 'spot'
      ? new SpotLight({ radius: 400, angle: 120, coneSoftness: 0, intensity: 1, softness: scene.softness })
      : new PointLight({ radius: 400, intensity: 1, softness: scene.softness });

  light.setPosition(lightX, lightY);

  if (scene.light === 'spot') {
    // Off any axis, so the row is built in a frame of its own.
    light.rotation = -25;
  }

  return light;
};

/**
 * A wall square-on to the ray at `angle`, `distance` from the light, running
 * `length` towards larger angles: everything along the arc below `angle` is lit.
 */
const wallFrom = (angle: number, distance: number, length: number): PolygonOccluder => {
  const x = lightX + distance * Math.cos(angle);
  const y = lightY + distance * Math.sin(angle);

  return new PolygonOccluder(
    [
      { x, y },
      { x: x - length * Math.sin(angle), y: y + length * Math.cos(angle) },
    ],
    { closed: false },
  );
};

const sample = (frame: Uint8Array | Uint8ClampedArray, x: number, y: number): number => {
  const ix = Math.floor(x - 0.5);
  const iy = Math.floor(y - 0.5);
  const tx = x - 0.5 - ix;
  const ty = y - 0.5 - iy;
  const red = (i: number, j: number): number => frame[((iy + j) * contactCanvasSize + ix + i) * 4]!;

  return (red(0, 0) * (1 - tx) + red(1, 0) * tx) * (1 - ty) + (red(0, 1) * (1 - tx) + red(1, 1) * tx) * ty;
};

/**
 * Where along the arc the light falls to half way between lit and shadowed, as
 * an offset from the silhouette in pixels. `null` when the device was dropped.
 */
const edgeOffset = async (backend: ContactBackend, scene: SilhouetteScene): Promise<number | null> => {
  const host = await createContactHost(backend);
  const lighting = new LightmapLighting(host.app, { ambient: Color.black, lightResolution: 1, shadowResolution: bins });

  lighting.add(createLight(scene));
  lighting.occludeFrom(wallFrom(scene.angle, 60, 120));

  if (scene.backdrop === true) {
    lighting.occludeFrom(wallFrom(scene.angle - 0.6, 200, 300));
  }

  try {
    const frame = await host.render(lighting);

    if (frame === null) {
      return null;
    }

    const at = (angle: number): number => sample(frame, lightX + arcRadius * Math.cos(angle), lightY + arcRadius * Math.sin(angle));
    // Outside the widest kernel here, a third of a radian at softness 1.
    const lit = at(scene.angle - 0.5);
    const dark = at(scene.angle + 0.5);
    const half = (lit + dark) / 2;

    expect(lit - dark, 'the wall casts a shadow across the arc').toBeGreaterThan(60);

    let previous = scene.angle - 0.5;

    for (let index = 1; index <= 1000; index++) {
      const angle = scene.angle - 0.5 + index * 0.001;

      if (at(angle) < half) {
        const before = at(previous);

        return (previous + ((before - half) / (before - at(angle))) * (angle - previous) - scene.angle) * arcRadius;
      }

      previous = angle;
    }

    throw new Error('the profile never crossed half way');
  } finally {
    lighting.destroy();
    host.destroy();
  }
};

/** The silhouette walked across one bin, starting just inside it. */
const walk = async (backend: ContactBackend, scene: Omit<SilhouetteScene, 'angle'>, first: number): Promise<number[] | null> => {
  const offsets: number[] = [];

  for (let step = 0; step < steps; step++) {
    const offset = await edgeOffset(backend, { ...scene, angle: first + ((step + 0.25) / steps) * binWidth });

    if (offset === null) {
      return null;
    }

    offsets.push(offset);
  }

  return offsets;
};

/**
 * On the silhouette to within a pixel and a half wherever it falls - a bin is
 * almost fifteen pixels of arc here, so an edge snapped to bin centres is off
 * by up to seven - and moving by the step the silhouette moved rather than by
 * nothing or by a whole bin.
 */
const expectTracked = (offsets: number[]): void => {
  const shown = offsets.map(offset => offset.toFixed(2)).join(' ');

  for (const offset of offsets) {
    expect(Math.abs(offset), `${shown}`).toBeLessThan(1.5);
  }

  for (let index = 1; index < offsets.length; index++) {
    expect(Math.abs(offsets[index]! - offsets[index - 1]!), `${shown}`).toBeLessThan(1);
  }
};

export const describeLightmapSilhouettes = (backend: ContactBackend): void => {
  describe('lightmap shadow edges across a bin', () => {
    // A bin boundary: bin `bins / 2` starts at angle zero.
    const boundary = 2 * binWidth;

    test.each([{ softness: 0 }, { softness: 0.35 }, { softness: 1 }])(
      'the edge stays on the silhouette at softness $softness',
      async ({ softness }) => {
        const offsets = await walk(backend, { softness }, boundary);

        if (offsets !== null) {
          expectTracked(offsets);
        }
      },
    );

    test('a silhouette in front of a farther wall keeps its place', async () => {
      const offsets = await walk(backend, { softness: 0.35, backdrop: true }, boundary);

      if (offsets !== null) {
        expectTracked(offsets);
      }
    });

    test('a turned spot light measures the silhouette in its own frame and still keeps it', async () => {
      // The spot is turned 25 degrees, so this is a bin boundary of ITS row.
      const offsets = await walk(backend, { softness: 0.35, light: 'spot' }, (-25 * Math.PI) / 180 + boundary);

      if (offsets !== null) {
        expectTracked(offsets);
      }
    });
  });
};
