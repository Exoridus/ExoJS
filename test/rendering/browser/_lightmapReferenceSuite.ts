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

type ShadowFiller = 'cpu' | 'gpu';

interface LineScene {
  readonly lightX: number;
  readonly lightY: number;
  readonly length: number;
  /** Falloff radius. */
  readonly radius: number;
  /** Node rotation of the light, in degrees. */
  readonly rotation: number;
  readonly polygons: readonly Polygon[];
}

/** Where the lightmap traces a finite line's shadow rows, as fractions of its half-length. */
const fourSamples = [-0.75, -0.25, 0.25, 0.75];
/** Midpoints of 256 equal pieces of the segment: the continuous emitter, for any scene here. */
const denseSamples = Array.from({ length: 256 }, (_, index) => ((index + 0.5) / 256) * 2 - 1);

/**
 * The share of a line's emission reaching `(px, py)` unblocked: each emitter
 * point weighted `1 / (1 + d^2)` in falloff radii, the attenuation the
 * lightmap documents for its samples, over the points at `fractions` of the
 * half-length along `axis`.
 */
const lineVisibility = (
  scene: LineScene,
  axis: { readonly x: number; readonly y: number },
  fractions: readonly number[],
  px: number,
  py: number,
): number => {
  const half = scene.length / 2;
  let visible = 0;
  let total = 0;

  for (const fraction of fractions) {
    const sx = scene.lightX + axis.x * half * fraction;
    const sy = scene.lightY + axis.y * half * fraction;
    const distance = Math.hypot(px - sx, py - sy) / scene.radius;
    const weight = 1 / (1 + distance * distance);

    total += weight;

    if (!blocked(scene.polygons, sx, sy, px, py)) {
      visible += weight;
    }
  }

  return visible / total;
};

const nearOutline = (polygons: readonly Polygon[], px: number, py: number, reach: number): boolean =>
  polygons.some(polygon =>
    polygon.some(([x1, y1], index) => {
      const [x2, y2] = polygon[(index + 1) % polygon.length]!;
      const ex = x2 - x1;
      const ey = y2 - y1;
      const t = Math.max(0, Math.min(1, ((px - x1) * ex + (py - y1) * ey) / (ex * ex + ey * ey)));

      return Math.hypot(px - x1 - t * ex, py - y1 - t * ey) < reach;
    }),
  );

const lineScenes: ReadonlyArray<[string, LineScene]> = [
  [
    'a long line along the axis, half hidden by a post',
    { lightX: 70, lightY: 128, length: 120, radius: 300, rotation: 0, polygons: [square(150, 118, 158, 150)] },
  ],
  [
    'a long line turned 37 degrees past a turned cross',
    { lightX: 70, lightY: 90, length: 100, radius: 300, rotation: 37, polygons: [cross(160, 150, 17)] },
  ],
  [
    'a short line across the axis touching a crate',
    { lightX: 60, lightY: 128, length: 16, radius: 300, rotation: 90, polygons: [square(110, 100, 150, 140)] },
  ],
  [
    'a line longer than the gap between two boxes',
    { lightX: 128, lightY: 60, length: 200, radius: 300, rotation: 143, polygons: [square(90, 120, 110, 140), square(150, 150, 175, 165)] },
  ],
];

interface LineShadowResult {
  readonly filler: ShadowFiller;
  readonly metrics: {
    readonly counted: number;
    /** Against the exact four-sample visibility, on pixels no sample ray's edge crosses. */
    readonly sampledMae: number;
    readonly sampledP99: number;
    /** Share of those pixels off by more than a tenth: a sample's silhouette in the wrong place. */
    readonly sampledMismatch: number;
    /** Against the continuous emitter, on every lit pixel clear of the outline. */
    readonly integralMae: number;
    readonly integralP99: number;
    /** What a shadow cast from the segment's centre alone would score against the continuous emitter. */
    readonly centreMae: number;
  };
}

const quantile = (values: number[], q: number): number => {
  values.sort((a, b) => a - b);

  return values.length === 0 ? 0 : values[Math.min(values.length - 1, Math.floor(q * values.length))]!;
};

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

/** Capture the exact readback used by the reference, not the live GPU canvas. */
const captureLineSource = async (
  backend: ContactBackend,
  scene: LineScene,
  filler: ShadowFiller,
  open: Uint8Array | Uint8ClampedArray,
  walled: Uint8Array | Uint8ClampedArray,
): Promise<void> => {
  const canvas = document.createElement('canvas');

  canvas.width = contactCanvasSize;
  canvas.height = contactCanvasSize;
  document.body.appendChild(canvas);

  try {
    const context = canvas.getContext('2d')!;

    for (const [kind, pixels] of [
      [`open-${filler}`, open],
      [filler, walled],
    ] as const) {
      context.putImageData(new ImageData(new Uint8ClampedArray(pixels), contactCanvasSize), 0, 0);
      await page.screenshot({
        element: canvas,
        path: `../../../.workspace/visual-review/current/line-source-${kind}-${scene.rotation}-${backend}-${server.browser}.png`,
      });
    }
  } finally {
    canvas.remove();
  }
};

/** `null` when the device was dropped. */
const lineShadowError = async (backend: ContactBackend, scene: LineScene, filler: ShadowFiller): Promise<LineShadowResult | null> => {
  const host = await createContactHost(backend);
  const size = contactCanvasSize;

  host.context.view = new View(size / 2, size / 2, size, size);

  const lighting = new LightmapLighting(host.app, { ambient: Color.black, lightResolution: 1 });
  const light = lighting.add(new LineLight({ length: scene.length, radius: scene.radius, softness: 0 }));
  const frameBackend = lighting.backend as LightmapBackend;

  light.setPosition(scene.lightX, scene.lightY);
  light.rotation = scene.rotation;
  frameBackend.shadowFiller = filler;

  try {
    // Readbacks can share a buffer between frames.
    const open = (await host.render(lighting))?.slice() ?? null;

    for (const polygon of scene.polygons) {
      lighting.occludeFrom(new PolygonOccluder(polygon.map(([x, y]) => ({ x, y }))));
    }

    const walled = await host.render(lighting);

    if (open === null || walled === null) {
      return null;
    }

    // Never label a CPU fallback as a GPU capture.
    if (frameBackend.shadowFiller === filler) {
      await captureLineSource(backend, scene, filler, open, walled);
    }

    const axis = { x: 0, y: 0 };

    light.getWorldDirection(axis);
    const sampledErrors: number[] = [];
    const integralErrors: number[] = [];
    const centreErrors: number[] = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;

        if (open[offset]! < 60) {
          continue;
        }

        const term = walled[offset]! / open[offset]!;
        const exact = lineVisibility(scene, axis, denseSamples, x + 0.5, y + 0.5);

        if (!nearOutline(scene.polygons, x + 0.5, y + 0.5, 1)) {
          integralErrors.push(Math.abs(term - exact));
          centreErrors.push(Math.abs(lineVisibility(scene, axis, [0], x + 0.5, y + 0.5) - exact));
        }

        const corners = [
          [x + 0.5, y + 0.5],
          [x, y],
          [x + 1, y],
          [x, y + 1],
          [x + 1, y + 1],
        ].map(([px, py]) =>
          fourSamples
            .map(fraction =>
              blocked(
                scene.polygons,
                scene.lightX + (axis.x * scene.length * fraction) / 2,
                scene.lightY + (axis.y * scene.length * fraction) / 2,
                px!,
                py!,
              ),
            )
            .join(),
        );

        if (corners.every(corner => corner === corners[0])) {
          sampledErrors.push(Math.abs(term - lineVisibility(scene, axis, fourSamples, x + 0.5, y + 0.5)));
        }
      }
    }

    return {
      filler: frameBackend.shadowFiller,
      metrics: {
        counted: integralErrors.length,
        sampledMae: mean(sampledErrors),
        sampledP99: quantile(sampledErrors, 0.99),
        sampledMismatch: sampledErrors.filter(error => error > 0.1).length / Math.max(1, sampledErrors.length),
        integralMae: mean(integralErrors),
        integralP99: quantile(integralErrors, 0.99),
        centreMae: mean(centreErrors),
      },
    };
  } finally {
    lighting.destroy();
    host.destroy();
  }
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

  describe('finite LineLight shadows against integration over the segment', () => {
    test.for(lineScenes.flatMap(([name, scene]) => (['cpu', 'gpu'] as const).map(filler => ({ name, scene, filler }))))(
      '$name ($filler filler)',
      async ({ name, scene, filler }, ctx) => {
        const result = await lineShadowError(backend, scene, filler);

        if (result === null) {
          return;
        }

        if (result.filler !== filler) {
          ctx.skip(`no ${filler} shadow filler on this device`);
        }

        console.info('line shadow error', { backend, filler, scene: name, ...result.metrics });

        expect(result.metrics.counted).toBeGreaterThan(5_000);

        // Wherever no sample's ray crosses an edge inside the pixel, the renderer
        // has to agree with the exact four-sample visibility it evaluates. The
        // segment walk does to a few counts of an 8-bit ratio. The marcher reads
        // silhouettes off the rasterized occluder mask, each a mask texel wider
        // than the outline, which already darkens a sliver of a point light's
        // shadow edge; a line has four such edges per outline.
        if (filler === 'cpu') {
          expect(result.metrics.sampledMae).toBeLessThan(0.005);
          expect(result.metrics.sampledP99).toBeLessThan(0.05);
        } else {
          expect(result.metrics.sampledMae).toBeLessThan(0.015);
          expect(result.metrics.sampledMismatch).toBeLessThan(0.05);
        }

        // Against the continuous emitter, four samples leave bands in the
        // penumbra but stay close on average, and closer than a shadow cast
        // from the centre of the segment alone.
        expect(result.metrics.integralMae).toBeLessThan(result.metrics.centreMae);
        expect(result.metrics.integralMae).toBeLessThan(0.05);
      },
    );
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
