/**
 * The transport walk over the occluder mask a real frame produced.
 *
 * The synthetic cases name mask texels directly; this one names none. A
 * drawable is handed to the lighting as an occluder, the renderer rasterises
 * it into the mask it would rasterise it into anyway, the block level is
 * reduced from that mask by the pass that will reduce it in production, and
 * the walk is pointed at both through the view the mask was drawn with. What
 * it covers is everything between those steps: which way a render target's
 * rows run, where a world position lands in it, and that a drawable offered
 * through `addDrawable` reaches the mask at all.
 */

import { AlphaOccluder, Lighting, radiance } from '@codexo/exojs-lighting';
import { expect } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';

import type { LightmapBackend } from '../../../packages/exojs-lighting/src/backends/LightmapBackend';
import { MaskBlocks } from '../../../packages/exojs-lighting/src/backends/maskBlocks';

/**
 * Where the occluding sprite stands, in world units.
 *
 * Off the middle row of the canvas on purpose: the field is centred on the
 * camera, so a stretch along the row mirrored about that centre passes nothing
 * unless the mask is read upside down, and then it passes the drawable itself.
 */
const OCCLUDER = new Rectangle(52, 20, 24, 24);

/** One traced stretch and what the walk has to make of it. */
export interface MaskTrace {
  readonly name: string;
  readonly stretch: readonly [number, number, number, number];
  /** Where along the stretch the mask must stop it, as a fraction, or 1 where it must not. */
  readonly fraction: number;
}

export interface MaskScene {
  readonly lighting: Lighting;
  readonly blocks: MaskBlocks;
  readonly traces: readonly MaskTrace[];
  /** The mask this frame drew, valid once a frame has run. */
  readonly mask: RenderTexture;
  /**
   * Follow the mask's grid with the block level's, between the update that
   * sizes the mask for this frame and the passes that fill both.
   */
  sync(): void;
  /**
   * What the transport chunk needs to read the mask: its grid, the block
   * level's grid, and the world-to-clip view both were drawn through.
   */
  bindings(): {
    readonly cells: readonly [number, number];
    readonly blocks: readonly [number, number];
    readonly basis: readonly [number, number, number, number];
    readonly offset: readonly [number, number];
  };
  destroy(): void;
}

/**
 * A lit scene whose only occluder is a drawable, sized to the canvas the host
 * was built with.
 *
 * `radiance` is the renderer because it is the one that rasterises occluders;
 * under any other the field takes outlines and the mask stays empty.
 */
export const createMaskScene = (app: Application, size: number): MaskScene => {
  const lighting = new Lighting({ quality: radiance({ probeSpacing: 4 }), app, ambient: Color.black, lightResolution: 1 });
  const sprite = new Sprite(Texture.fromColor(Color.white, 1));
  const backend = lighting.backend as LightmapBackend;

  sprite.width = OCCLUDER.width;
  sprite.height = OCCLUDER.height;
  sprite.position.set(OCCLUDER.x, OCCLUDER.y);

  // No light in the scene, deliberately: today the emitter discs are
  // rasterised into the same mask as the occluders, so a lamp would read as a
  // wall to a walk that takes its sources from the transport tables instead.
  // What this fixture is about is the occluder half of that mask.
  lighting.occludeFrom(new AlphaOccluder(sprite));

  const blocks = new MaskBlocks(backend.maskTexture);
  const middle = OCCLUDER.y + OCCLUDER.height / 2;
  const region = new Rectangle();

  app.framePasses.addPass(blocks.pass);
  blocks.pass.enabled = true;

  return {
    lighting,
    blocks,
    mask: backend.maskTexture,
    traces: [
      { name: 'across the drawable', stretch: [0, middle, size, middle], fraction: OCCLUDER.x / size },
      { name: 'along the row mirrored about the field centre', stretch: [0, size - middle, size, size - middle], fraction: 1 },
      { name: 'out of the drawable', stretch: [OCCLUDER.x + OCCLUDER.width / 2, middle, size, middle], fraction: 0 },
    ],
    sync: (): void => blocks.setSize(backend.maskTexture.width, backend.maskTexture.height),
    bindings: () => {
      backend.collectRegion(region);

      // The region the renderer collected occluders for is the region it drew
      // the mask through, so a view over it carries the same transform - which
      // is the one the chunk expects, taken from the engine rather than
      // rebuilt by hand.
      const view = new View(region.x + region.width / 2, region.y + region.height / 2, region.width, region.height);
      const toMask = view.getTransform();

      return {
        cells: [backend.maskTexture.width, backend.maskTexture.height],
        blocks: [blocks.texture.width, blocks.texture.height],
        basis: [toMask.a, toMask.b, toMask.c, toMask.d],
        offset: [toMask.x, toMask.y],
      };
    },
    destroy: (): void => {
      app.framePasses.removePass(blocks.pass);
      blocks.destroy();
      lighting.destroy();
      sprite.destroy();
    },
  };
};

/**
 * What the readings of one trace have to satisfy: the wall where the drawable
 * stands, and the same answer whether or not the block level was consulted.
 *
 * The tolerance is in eighths of the stretch's own length, which at these sizes
 * is several mask texels: the point is which side of the drawable the walk
 * stopped on, not a subtexel reading the rasteriser does not promise.
 */
export const checkMaskTrace = (trace: MaskTrace, hit: readonly number[], through: readonly number[], flat: readonly number[]): void => {
  expect(Math.abs(hit[0]! - Math.round(trace.fraction * 255)), `${trace.name}: where the mask stopped it`).toBeLessThanOrEqual(8);
  expect(through[0]!, `${trace.name}: what got through`).toBe(trace.fraction >= 1 ? 255 : 0);
  expect(Math.abs(hit[0]! - flat[0]!), `${trace.name}: with and without the block level`).toBeLessThanOrEqual(1);
};
