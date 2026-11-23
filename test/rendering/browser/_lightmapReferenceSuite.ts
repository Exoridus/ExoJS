/**
 * The lightmap's shadows against independent geometry, run by the WebGL2 and
 * WebGPU lanes alike.
 *
 * A hard shadow is a yes or no per point: a pixel is lit when the segment from
 * the light to its centre crosses no occluder edge. Pixels the geometry crosses
 * are left out, since there the answer depends on how an edge is antialiased;
 * everywhere else the renderer has to agree with the segment test. That is
 * what catches light let through a corner, a notch cut into a face, or a seam
 * where two faces or two occluders meet - none of which shows up as a step a
 * profile could find.
 */

import { type Light, LightmapLighting, LineLight, PointLight, PolygonOccluder, SpotLight } from '@codexo/exojs/lighting';
import { describe, expect, test } from 'vitest';
import { page, server } from 'vitest/browser';

import { Color } from '#core/Color';
import { View } from '#rendering/View';

import type { LightmapBackend } from '../../../packages/exojs-lighting/src/backends/LightmapBackend';
import { type ContactBackend, contactCanvasSize, type ContactHost, createContactHost } from './_lightmapContact';

type Polygon = ReadonlyArray<readonly [number, number]>;

interface ReferenceScene {
  readonly light: 'point' | 'spot';
  readonly lightX: number;
  readonly lightY: number;
  readonly polygons: readonly Polygon[];
  /** Screen angle the spot points along, in radians. */
  readonly aim?: number;
}

const cross = (cx: number, cy: number, degrees: number): Polygon => {
  // Node rotation turns counter-clockwise on screen, so the outline turns the same way.
  const r = (-degrees * Math.PI) / 180;
  const points: Array<[number, number]> = [
    [-10, -30],
    [10, -30],
    [10, -10],
    [30, -10],
    [30, 10],
    [10, 10],
    [10, 30],
    [-10, 30],
    [-10, 10],
    [-30, 10],
    [-30, -10],
    [-10, -10],
  ];

  return points.map(([x, y]) => [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)] as const);
};

const square = (left: number, top: number, right: number, bottom: number): Polygon => [
  [left, top],
  [right, top],
  [right, bottom],
  [left, bottom],
];

const blocked = (polygons: readonly Polygon[], lx: number, ly: number, px: number, py: number): boolean => {
  const dx = px - lx;
  const dy = py - ly;

  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index++) {
      const [x1, y1] = polygon[index]!;
      const [x2, y2] = polygon[(index + 1) % polygon.length]!;
      const ex = x2 - x1;
      const ey = y2 - y1;
      const den = dx * ey - dy * ex;

      if (den === 0) {
        continue;
      }

      const t = ((x1 - lx) * ey - (y1 - ly) * ex) / den;
      const u = ((x1 - lx) * dy - (y1 - ly) * dx) / den;

      if (t > 0 && t < 1 && u >= 0 && u <= 1) {
        return true;
      }
    }
  }

  return false;
};

const createLight = (scene: ReferenceScene): Light => {
  const light =
    scene.light === 'spot'
      ? new SpotLight({ radius: 2000, angle: 100, coneSoftness: 0, intensity: 1, softness: 0 })
      : new PointLight({ radius: 2000, intensity: 1, softness: 0 });

  light.setPosition(scene.lightX, scene.lightY);

  if (scene.aim !== undefined) {
    light.rotation = (-scene.aim * 180) / Math.PI;
  }

  return light;
};

const render = async (host: ContactHost, scene: ReferenceScene, occluded: boolean): Promise<Uint8Array | Uint8ClampedArray | null> => {
  const lighting = new LightmapLighting(host.app, { ambient: Color.black, lightResolution: 1 });

  lighting.add(createLight(scene));

  if (occluded) {
    for (const polygon of scene.polygons) {
      lighting.occludeFrom(new PolygonOccluder(polygon.map(([x, y]) => ({ x, y }))));
    }
  }

  try {
    return await host.render(lighting);
  } finally {
    lighting.destroy();
  }
};

/**
 * The largest disagreement with the segment test over every pixel the light
 * reaches whose corners and centre all give the same answer. `null` when the
 * device was dropped.
 */
const worstDisagreement = async (
  backend: ContactBackend,
  scene: ReferenceScene,
): Promise<{ worst: number; at: string; counted: number } | null> => {
  const host = await createContactHost(backend);

  try {
    const lit = await render(host, scene, true);
    const open = await render(host, scene, false);

    if (lit === null || open === null) {
      return null;
    }

    let worst = 0;
    let at = '';
    let counted = 0;

    for (let y = 0; y < contactCanvasSize; y++) {
      for (let x = 0; x < contactCanvasSize; x++) {
        const offset = (y * contactCanvasSize + x) * 4;

        // Outside the spot's cone, or too dim for an 8-bit ratio to mean much.
        if (open[offset]! < 60) {
          continue;
        }

        const samples = [
          [x + 0.5, y + 0.5],
          [x, y],
          [x + 1, y],
          [x, y + 1],
          [x + 1, y + 1],
        ].map(([px, py]) => blocked(scene.polygons, scene.lightX, scene.lightY, px!, py!));

        if (samples.some(sample => sample !== samples[0])) {
          continue;
        }

        const expected = samples[0] ? 0 : 1;
        const term = lit[offset]! / open[offset]!;
        const error = Math.abs(term - expected);

        counted++;

        if (error > worst) {
          worst = error;
          at = `(${x}, ${y}) term ${term.toFixed(3)} expected ${expected}`;
        }
      }
    }

    return { worst, at, counted };
  } finally {
    host.destroy();
  }
};

/** Penumbra width, 10 to 90 percent, down the column `x`, in pixels. `null` when the device was dropped. */
const penumbraWidth = async (host: ContactHost, lighting: LightmapLighting, x: number): Promise<number | null> => {
  const frame = await host.render(lighting);

  if (frame === null) {
    return null;
  }

  const column = Array.from({ length: contactCanvasSize }, (_, y) => frame[(y * contactCanvasSize + x) * 4]!);
  const lit = column[30]!;
  const top = column.findIndex((value, y) => y > 30 && value < lit * 0.9);
  const bottom = column.findIndex((value, y) => y > 30 && value < lit * 0.1);

  return bottom - top;
};

export const describeLightmapReference = (backend: ContactBackend): void => {
  describe('lightmap hard shadows against the segment test', () => {
    test.each<[string, ReferenceScene]>([
      ['a cross, square to the axes', { light: 'point', lightX: 60, lightY: 70, polygons: [cross(150, 140, 0)] }],
      ['a turned cross', { light: 'point', lightX: 60, lightY: 70, polygons: [cross(150, 140, 17)] }],
      [
        'a cross under a turned spot',
        { light: 'spot', lightX: 60, lightY: 70, polygons: [cross(150, 140, 0)], aim: Math.atan2(140 - 70, 150 - 60) },
      ],
      [
        'a crate overlapping a pillar',
        { light: 'point', lightX: 50, lightY: 90, polygons: [square(130, 110, 180, 160), square(110, 140, 140, 175)] },
      ],
      [
        // Their silhouettes share angular bins without meeting: one straight
        // span from the near box to the far one would run behind the near box.
        'two boxes apart whose silhouettes share a bin',
        { light: 'point', lightX: 40, lightY: 128, polygons: [square(90, 120, 100, 130), square(180, 132.2, 200, 170)] },
      ],
      [
        // Its end turned almost edge-on to the light, so both faces meeting
        // there fall inside one bin.
        'the end of a thin wall seen almost edge-on',
        {
          light: 'point',
          lightX: 40,
          lightY: 128,
          polygons: [
            [
              [100, 128],
              [220, 139],
              [220, 142],
              [100, 131.5],
            ],
          ],
        },
      ],
      [
        'a wall behind the light, across the seam of its row',
        { light: 'point', lightX: 180, lightY: 128, polygons: [square(96, 90, 104, 170), square(60, 120, 80, 140)] },
      ],
    ])('%s matches it wherever no edge crosses the pixel', async (_name, scene) => {
      const result = await worstDisagreement(backend, scene);

      if (result === null) {
        return;
      }

      expect(result.counted).toBeGreaterThan(20_000);
      // A couple of counts of an 8-bit ratio, and the tail of an antialiased
      // edge into a neighbour it does not cross.
      expect(result.worst, `${result.at}`).toBeLessThan(0.1);
    });
  });

  describe('finite LineLight source visibility', () => {
    test('samples the emitting segment instead of casting all shadows from its centre', async () => {
      const host = await createContactHost(backend);

      host.context.view = new View(128, 128, contactCanvasSize, contactCanvasSize);

      const lighting = new LightmapLighting(host.app, {
        ambient: Color.black,
        lightResolution: 1,
        shadowResolution: 512,
      });
      const sourceX = 80;
      const sourceY = 128;
      const wallX = 150;
      const probeX = 200;
      const probeY = 144;
      const wallTop = 135.5;
      const wallBottom = 137.4;

      lighting.add(new LineLight({ length: 80, radius: 300, softness: 0 })).setPosition(sourceX, sourceY);

      const visualCanvas = document.createElement('canvas');

      visualCanvas.width = contactCanvasSize;
      visualCanvas.height = contactCanvasSize;
      document.body.appendChild(visualCanvas);

      const captureContext = visualCanvas.getContext('2d')!;

      try {
        // WebGPU readback can reuse a backing buffer across frames. Preserve the unoccluded reference.
        const open = (await host.render(lighting))?.slice() ?? null;

        if (open !== null) {
          captureContext.putImageData(new ImageData(new Uint8ClampedArray(open), contactCanvasSize), 0, 0);
          await page.screenshot({
            element: visualCanvas,
            path: `../../../.workspace/visual-review/current/line-source-open-${backend}-${server.browser}.png`,
          });
        }

        lighting.occludeFrom(
          new PolygonOccluder(
            [
              { x: wallX, y: wallTop },
              { x: wallX, y: wallBottom },
            ],
            { closed: false },
          ),
        );

        const walled = await host.render(lighting);

        if (open === null || walled === null) {
          return;
        }

        captureContext.putImageData(new ImageData(new Uint8ClampedArray(walled), contactCanvasSize), 0, 0);
        await page.screenshot({
          element: visualCanvas,
          path: `../../../.workspace/visual-review/current/line-source-cpu-${backend}-${server.browser}.png`,
        });

        const pixel = (probeY * contactCanvasSize + probeX) * 4;
        const baseline = open[pixel]!;

        expect(baseline).toBeGreaterThan(24);

        // An independent geometric reference: four rays from actual segment
        // points to the probe intersect x=wallX at different heights. The
        // centre-only shadow casts one all-black silhouette here, whereas
        // only a subset of the finite emitter is blocked.
        const samples = [-0.75, -0.25, 0.25, 0.75];
        let visibleWeight = 0;
        let totalWeight = 0;

        for (const fraction of samples) {
          const emitterX = sourceX + fraction * 40;
          const yAtWall = sourceY + ((probeY - sourceY) * (wallX - emitterX)) / (probeX - emitterX);
          const distance = Math.hypot(probeX - emitterX, probeY - sourceY) / 300;
          const weight = 1 / (1 + distance * distance);

          totalWeight += weight;

          if (yAtWall < wallTop || yAtWall > wallBottom) {
            visibleWeight += weight;
          }
        }

        const expected = visibleWeight / totalWeight;
        const measured = walled[pixel]! / baseline;

        expect(expected).toBeGreaterThan(0.5);
        expect(expected).toBeLessThan(0.95);
        expect(measured).toBeGreaterThan(0.35);
        expect(Math.abs(measured - expected)).toBeLessThan(0.3);

        // Force the GPU marcher independently; do not present a CPU fallback as a GPU capture.
        const frameBackend = lighting.backend as LightmapBackend;

        frameBackend.shadowFiller = 'gpu';

        if (frameBackend.shadowFiller === 'gpu') {
          const gpuWalled = await host.render(lighting);

          if (gpuWalled !== null) {
            captureContext.putImageData(new ImageData(new Uint8ClampedArray(gpuWalled), contactCanvasSize), 0, 0);
            await page.screenshot({
              element: visualCanvas,
              path: `../../../.workspace/visual-review/current/line-source-gpu-${backend}-${server.browser}.png`,
            });
            console.info('line-source GPU/CPU visibility at independent ray probe', {
              backend,
              cpu: measured,
              gpu: gpuWalled[pixel]! / baseline,
              expected,
            });
          }
        }
      } finally {
        visualCanvas.remove();
        lighting.destroy();
        host.destroy();
      }
    });
  });

  describe('lightmap penumbra width', () => {
    test('is narrow at the contact and widens with the distance behind the occluder', async () => {
      const host = await createContactHost(backend);
      const lighting = new LightmapLighting(host.app, { ambient: Color.black, lightResolution: 1 });

      lighting.add(new PointLight({ radius: 2000, intensity: 1, softness: 1 })).setPosition(40, 60);
      // Level with the light, so its shadow edge runs along the light's own row.
      lighting.occludeFrom(
        new PolygonOccluder(
          [
            { x: 100, y: 60 },
            { x: 100, y: 250 },
          ],
          { closed: false },
        ),
      );

      try {
        const near = await penumbraWidth(host, lighting, 110);
        const far = await penumbraWidth(host, lighting, 230);

        if (near === null || far === null) {
          return;
        }

        // A disc source whose radius is the softness angle seen from the wall
        // casts a two-pixel penumbra ten pixels behind it and a twenty-four
        // pixel one a hundred and thirty behind.
        expect(near, `near ${near}, far ${far}`).toBeLessThanOrEqual(4);
        expect(far, `near ${near}, far ${far}`).toBeGreaterThanOrEqual(12);
        expect(far, `near ${near}, far ${far}`).toBeLessThanOrEqual(40);
      } finally {
        lighting.destroy();
        host.destroy();
      }
    });
  });
};
