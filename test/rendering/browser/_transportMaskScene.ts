/**
 * The transport walk over what a real frame produced.
 *
 * The probe cases name mask texels and build their own tables; this one names
 * none of it. A drawable and an outline are handed to the lighting as
 * occluders, the renderer rasterises the one it can only rasterise, turns the
 * other into geometry, reduces the block level, and the walk is pointed at all
 * of it through the view the mask was drawn with. What it covers is everything
 * between those steps: which way a render target's rows run, where a world
 * position lands in it, that a drawable offered through `addDrawable` reaches
 * the mask at all, and that an outline reaches the tables instead of the mask.
 */

import { AlphaOccluder, Lighting, PolygonOccluder, radiance } from '@codexo/exojs-lighting';
import { expect } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';

import type { LightmapBackend } from '../../../packages/exojs-lighting/src/backends/LightmapBackend';

/**
 * Where the occluding sprite stands, in world units.
 *
 * Off the middle row of the canvas on purpose: the field is centred on the
 * camera, so a stretch along the row mirrored about that centre passes the
 * drawable unless the mask is read upside down, and then it runs into it.
 */
const OCCLUDER = new Rectangle(52, 20, 24, 24);

/** Where the outline stands - a bare wall, which the tables carry and the mask does not. */
const WALL = 100;

/** One traced stretch and what the walk has to make of it. */
export interface MaskTrace {
  readonly name: string;
  readonly stretch: readonly [number, number, number, number];
  /** Where along the stretch the RASTERISED occluders stop it, as a fraction, or 1 where they do not. */
  readonly fraction: number;
  /** Whether anything at all stops it, rasterised or not. */
  readonly blocked: boolean;
}

/** Everything the probe binds to walk what this frame built. */
export interface MaskBindings {
  readonly cells: readonly [number, number];
  readonly blocks: readonly [number, number];
  readonly basis: readonly [number, number, number, number];
  readonly offset: readonly [number, number];
  readonly gridOrigin: readonly [number, number];
  readonly gridCells: readonly [number, number];
  readonly cellSize: number;
}

export interface MaskScene {
  readonly lighting: Lighting;
  readonly backend: LightmapBackend;
  readonly traces: readonly MaskTrace[];
  /** The textures this frame filled, valid once a frame has run. */
  textures(): Readonly<Record<string, RenderTexture | Texture>>;
  bindings(): MaskBindings;
  destroy(): void;
}

/**
 * A lit scene with one drawable occluder and one outline, sized to the canvas
 * the host was built with, walked by the geometry path.
 *
 * `radiance` is the renderer because it is the one that rasterises occluders;
 * under any other the field takes outlines only and the mask stays empty.
 */
export const createMaskScene = (app: Application, size: number): MaskScene => {
  const lighting = new Lighting({ quality: radiance({ probeSpacing: 4 }), app, ambient: Color.black, lightResolution: 1 });
  const sprite = new Sprite(Texture.fromColor(Color.white, 1));
  const backend = lighting.backend as LightmapBackend;

  sprite.width = OCCLUDER.width;
  sprite.height = OCCLUDER.height;
  sprite.position.set(OCCLUDER.x, OCCLUDER.y);

  // No light in the scene, deliberately: this fixture is about what blocks,
  // and what emits reaches this walk through the tables rather than the mask.
  backend.lightWalk = 'transport';
  lighting.occludeFrom(new AlphaOccluder(sprite));
  lighting.occludeFrom(
    new PolygonOccluder(
      [
        { x: WALL, y: 0 },
        { x: WALL, y: size },
      ],
      { closed: false },
    ),
  );

  const middle = OCCLUDER.y + OCCLUDER.height / 2;
  const region = new Rectangle();
  const built = (): { readonly transport: NonNullable<LightmapBackend['transport']>; readonly blocks: NonNullable<LightmapBackend['maskBlocks']> } => {
    const transport = backend.transport;
    const blocks = backend.maskBlocks;

    if (transport === null || blocks === null) throw new Error('The renderer built no transport tables.');

    return { transport, blocks };
  };

  return {
    lighting,
    backend,
    traces: [
      { name: 'across the drawable', stretch: [0, middle, size, middle], fraction: OCCLUDER.x / size, blocked: true },
      // The row mirrored about the field's centre: clear of the drawable
      // unless the mask is read upside down, and stopped by the outline, which
      // the mask does not hold at all.
      { name: 'across the outline alone', stretch: [0, size - middle, size, size - middle], fraction: 1, blocked: true },
      { name: 'clear of both', stretch: [0, size - middle, WALL - 8, size - middle], fraction: 1, blocked: false },
      { name: 'out of the drawable', stretch: [OCCLUDER.x + OCCLUDER.width / 2, middle, size, middle], fraction: 0, blocked: true },
    ],
    textures: () => {
      const { transport, blocks } = built();

      return {
        uSegments: transport.segments,
        uEmitters: transport.emitters,
        uCells: transport.cells,
        uIndices: transport.indices,
        uMask: backend.maskTexture,
        uMaskCoarse: blocks.texture,
      };
    },
    bindings: () => {
      const { transport, blocks } = built();

      backend.collectRegion(region);

      // The region the renderer collected occluders for is the region it drew
      // the mask through, so a view over it carries the same transform - which
      // is the one the chunk expects, taken from the engine rather than
      // rebuilt by hand.
      const view = new View(region.x + region.width / 2, region.y + region.height / 2, region.width, region.height);
      const toMask = view.getTransform();
      const grid = transport.grid;

      return {
        cells: [backend.maskTexture.width, backend.maskTexture.height],
        blocks: [blocks.texture.width, blocks.texture.height],
        basis: [toMask.a, toMask.b, toMask.c, toMask.d],
        offset: [toMask.x, toMask.y],
        gridOrigin: [grid.originX, grid.originY],
        gridCells: [grid.width, grid.height],
        cellSize: grid.cellSize,
      };
    },
    destroy: (): void => {
      lighting.destroy();
      sprite.destroy();
    },
  };
};

/**
 * What the readings of one trace have to satisfy: where the rasterised half
 * stopped it, whether anything stopped it at all, and the same answer with and
 * without the block level.
 *
 * The tolerance is a thirtieth of the stretch's own length, several mask texels
 * at these sizes: the point is which side of the drawable the walk stopped on,
 * not a subtexel reading the rasteriser does not promise.
 */
export const checkMaskTrace = (trace: MaskTrace, hit: readonly number[], through: readonly number[], flat: readonly number[]): void => {
  expect(Math.abs(hit[0]! - Math.round(trace.fraction * 255)), `${trace.name}: where the mask stopped it`).toBeLessThanOrEqual(8);
  expect(through[0]!, `${trace.name}: what got through`).toBe(trace.blocked ? 0 : 255);
  expect(Math.abs(hit[0]! - flat[0]!), `${trace.name}: with and without the block level`).toBeLessThanOrEqual(1);
};
