/**
 * What a surface gives back under the transport walk, on WebGL2.
 *
 * Read off the composite over a white floor, so a reading is the light term
 * itself. Each case builds its own host: a frame is a frame, and a scene that
 * inherits another one's history is not the case anyone wrote.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { makeTestApp, makeTestCanvas, readWebGl2Pixel } from './_backendSetup';
import { ABOVE, BELOW, BOUNCE_SIZE, type BounceHost, type BounceOptions, createBounceHost, createBounceScene, UNDER_MOVED } from './_bounceScene';
import { wireCoreRenderers } from './_coreRenderers';

const host = async (): Promise<BounceHost> => {
  const app = makeTestApp(makeTestCanvas(BOUNCE_SIZE), BOUNCE_SIZE);
  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return createBounceHost(backend, app);
};

const pixel = (live: BounceHost, at: readonly [number, number]): readonly [number, number, number] => {
  const read = readWebGl2Pixel(live.backend as WebGl2Backend, at[0], at[1]);

  return [read[0]!, read[1]!, read[2]!];
};

/** Build a scene of its own, run `frames` of it, and read the points named. */
const measure = async (
  options: BounceOptions,
  frames: number,
  points: ReadonlyArray<readonly [number, number]>,
): Promise<ReadonlyArray<readonly [number, number, number]>> => {
  const live = await host();
  const scene = createBounceScene(live, options);

  try {
    for (let index = 0; index < frames; index++) {
      live.frame(scene.lighting);
    }

    return points.map(at => pixel(live, at));
  } finally {
    scene.destroy();
    live.destroy();
  }
};

const white = (bounce: number): BounceOptions => ({ bounce, colour: Color.white });

describe('what a surface gives back (WebGL2)', () => {
  test('with the bounce off, a run of frames reads as the direct walk does', async () => {
    const [first] = await measure(white(0), 1, [ABOVE]);
    const [third] = await measure(white(0), 3, [ABOVE]);

    expect(first![0], 'the direct walk lights the floor above the bar').toBeGreaterThan(20);
    // Nothing accumulates: the same scene reads the same on any frame.
    expect(third).toEqual(first);
  });

  test('a first frame has no history to give back', async () => {
    const [direct] = await measure(white(0), 1, [ABOVE]);
    const [bouncing] = await measure(white(0.5), 1, [ABOVE]);

    expect(bouncing).toEqual(direct);
  });

  test('a second frame gives back what fell on the surface', async () => {
    const [direct] = await measure(white(0), 2, [ABOVE]);
    const [bouncing] = await measure(white(0.5), 2, [ABOVE]);

    expect(bouncing![0], 'over the lit face of the bar').toBeGreaterThan(direct![0] + 4);
  });

  test('a red surface gives back red and not the rest', async () => {
    const [direct] = await measure(white(0), 2, [ABOVE]);
    const [tinted] = await measure({ bounce: 0.5, colour: new Color(255, 0, 0) }, 2, [ABOVE]);

    // Against the direct reading rather than against a bright pixel: what the
    // bounce added has to be red, whatever the direct light already was.
    expect(tinted![0] - direct![0], 'red added').toBeGreaterThan(4);
    expect(tinted![1] - direct![1], 'green added').toBeLessThanOrEqual(2);
    expect(tinted![2] - direct![2], 'blue added').toBeLessThanOrEqual(2);
  });

  test('the underside of the bar gets nothing back', async () => {
    const [under] = await measure(white(0.5), 2, [BELOW]);

    expect(under![0], 'under the bar').toBeLessThanOrEqual(2);
  });

  test('an outline blocks and gives nothing back, having no material to give', async () => {
    const [litSide, darkSide] = await measure({ bounce: 0.5, colour: Color.white, outline: true }, 2, [ABOVE, BELOW]);
    const [direct] = await measure({ bounce: 0, colour: Color.white, outline: true }, 2, [ABOVE]);

    expect(darkSide![0], 'under the outline').toBeLessThanOrEqual(2);
    expect(Math.abs(litSide![0] - direct![0]), 'the lit side, with and without a bounce factor').toBeLessThanOrEqual(2);
  });

  test('the side, the colour and the strength of the bounce hold at other field resolutions', async () => {
    const added: number[] = [];

    for (const resolution of [0.5, 1, 2]) {
      const [direct, under] = await measure({ bounce: 0, colour: new Color(255, 0, 0), resolution }, 2, [ABOVE, BELOW]);
      const [bounced, underBounced] = await measure({ bounce: 0.5, colour: new Color(255, 0, 0), resolution }, 2, [ABOVE, BELOW]);

      // The step back from a hit is measured in field texels, so a coarser or
      // finer field moves where the bounce reads its light. What may not move
      // is which side of the bar it reads, or what colour comes back.
      expect(bounced![0] - direct![0], `red added at resolution ${resolution}`).toBeGreaterThan(4);
      expect(bounced![1] - direct![1], `green added at resolution ${resolution}`).toBeLessThanOrEqual(2);
      expect(under![0], `under the bar at resolution ${resolution}`).toBeLessThanOrEqual(2);
      expect(underBounced![0], `under the bar with a bounce at resolution ${resolution}`).toBeLessThanOrEqual(2);
      added.push(bounced![0] - direct![0]);
    }

    // And it may not jump: the three readings stay within a factor of each
    // other rather than switching on and off with the resolution.
    expect(Math.max(...added) / Math.max(1, Math.min(...added)), 'the spread over the three resolutions').toBeLessThanOrEqual(3);
  });

  test('a wall that arrives over a receiver takes the light with it', async () => {
    const [before] = await measure(white(0.5), 2, [UNDER_MOVED]);

    expect(before![0], 'where the bar is about to stand').toBeGreaterThan(20);

    const [after] = await measure({ bounce: 0.5, colour: Color.white, offsetY: -28 }, 2, [UNDER_MOVED]);

    expect(after![0], 'under the bar where it now stands').toBeLessThanOrEqual(2);
  });

  test('a camera that moves reads the world point it moved to, not the pixel it left', async () => {
    const live = await host();
    const scene = createBounceScene(live, white(0.5));

    try {
      live.frame(scene.lighting);
      live.frame(scene.lighting);

      const settled = pixel(live, ABOVE)[0];

      // Along the axis the scene varies on: the bar is the same everywhere
      // across, so a step sideways would prove nothing about where the history
      // is read.
      live.context.view = new View(BOUNCE_SIZE / 2, BOUNCE_SIZE / 2 - 12, BOUNCE_SIZE, BOUNCE_SIZE);
      live.frame(scene.lighting);

      // The bound separates the two: measured 9 of 255 with the reprojection
      // and 19 without it. What is left with it is the light field itself
      // moving - the probe grid and the field bounds follow the camera - and
      // not where last frame's light was read.
      expect(Math.abs(pixel(live, [ABOVE[0], ABOVE[1] + 12])[0] - settled), 'the same world point after the step').toBeLessThanOrEqual(12);
    } finally {
      scene.destroy();
      live.destroy();
    }
  });

  test('a view of another size starts the history again', async () => {
    const live = await host();
    const scene = createBounceScene(live, white(0.5));

    try {
      live.frame(scene.lighting);
      live.frame(scene.lighting);

      const settled = pixel(live, ABOVE)[0];

      live.context.view = new View(BOUNCE_SIZE / 2, BOUNCE_SIZE / 2, BOUNCE_SIZE * 0.75, BOUNCE_SIZE * 0.75);
      live.frame(scene.lighting);
      live.context.view = new View(BOUNCE_SIZE / 2, BOUNCE_SIZE / 2, BOUNCE_SIZE, BOUNCE_SIZE);
      live.frame(scene.lighting);
      // The frame after the size change has no history to read; the one after
      // it has gathered a new one.
      live.frame(scene.lighting);

      expect(Math.abs(pixel(live, ABOVE)[0] - settled), 'once the history has been gathered again').toBeLessThanOrEqual(8);
    } finally {
      scene.destroy();
      live.destroy();
    }
  });

  test('a renderer built, rendered, destroyed and built again lights the scene both times', async () => {
    const live = await host();

    try {
      const first = createBounceScene(live, white(0.5));

      live.frame(first.lighting);
      live.frame(first.lighting);

      const before = pixel(live, ABOVE)[0];

      first.destroy();

      // A frame with no renderer at all: the pipeline has to survive it.
      live.backend.clear(Color.black);
      live.app.framePasses.execute(live.context);
      live.backend.flush();

      const second = createBounceScene(live, white(0.5));

      try {
        live.frame(second.lighting);
        live.frame(second.lighting);

        expect(Math.abs(pixel(live, ABOVE)[0] - before), 'the second renderer').toBeLessThanOrEqual(8);
      } finally {
        second.destroy();
      }
    } finally {
      live.destroy();
    }
  });
});
