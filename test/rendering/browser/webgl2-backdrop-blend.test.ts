/**
 * WebGL2 backdrop-aware blend SPIKE — proves the advanced-blend primitive
 * (`WebGl2BackdropBlendCompositor`) end-to-end in isolation, before any
 * render-plan integration. Mode = Darken (the motivating bug).
 *
 * Verifies the two things the spike exists to de-risk:
 *  1. Backdrop capture + composite math: a transparent source region shows the
 *     backdrop through (NOT black — the old fixed-function Darken bug), and a
 *     covered region equals min(backdrop, source).
 *  2. Spatial / V-flip correctness: the captured backdrop is composited at the
 *     right place (a vertically-split backdrop under an opaque white source
 *     comes back unflipped).
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application, CanvasAlphaMode } from '#core/Application';
import { Color } from '#core/Color';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import { WebGl2BackdropBlendCompositor } from '#rendering/webgl2/WebGl2BackdropBlendCompositor';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { ADVANCED_BLEND_MODES, expectedOpaqueBlend } from './_blendReference';

type RgbaTuple = [number, number, number, number];

const canvasSize = 64;

// The root canvas stays opaque (the engine's default alphaMode), which is what
// exercises the opaque-backdrop path.
const defaultWebGlAttributes: WebGLContextAttributes = {
  antialias: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (alphaMode: CanvasAlphaMode = 'opaque'): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize, pixelRatio: 1 },
      rendering: { alphaMode, debug: false, webglAttributes: defaultWebGlAttributes },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();

  return backend;
};

/** Composite a full-canvas source over the backend's current target. */
const composeBackdropBlend = (backend: WebGl2Backend, source: Texture, mode: BlendModes): void => {
  const compositor = new WebGl2BackdropBlendCompositor();

  compositor.connect(backend);

  try {
    compositor.compose(backend, source, 0, 0, canvasSize, canvasSize, mode);
  } finally {
    compositor.disconnect();
  }
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectRgbNear = (actual: RgbaTuple, expected: [number, number, number], tolerance = 4): void => {
  for (let index = 0; index < 3; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected rgb [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

/** Left half opaque `color`, right half fully transparent. */
const createLeftOpaqueTexture = (color: string): Texture => {
  const source = document.createElement('canvas');

  source.width = canvasSize;
  source.height = canvasSize;

  const ctx = source.getContext('2d');

  if (!ctx) {
    throw new Error('2D context required.');
  }

  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvasSize / 2, canvasSize);

  return new Texture(source);
};

const createSolidTexture = (color: string): Texture => {
  const source = document.createElement('canvas');

  source.width = canvasSize;
  source.height = canvasSize;

  const ctx = source.getContext('2d');

  if (!ctx) {
    throw new Error('2D context required.');
  }

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  return new Texture(source);
};

describe('WebGL2 backdrop-aware blend (Darken spike)', () => {
  test('transparent source region shows the backdrop; covered region is min(backdrop, source)', async () => {
    const backend = await createBackend();
    // Source: opaque red on the left, transparent on the right.
    const source = createLeftOpaqueTexture('#ff0000');

    try {
      backend.clear(new Color(60, 120, 200)); // backdrop
      composeBackdropBlend(backend, source, BlendModes.Darken);

      // Left (red over blue, Darken): min((60,120,200),(255,0,0)) = (60,0,0).
      expectRgbNear(readPixel(backend, 16, 32), [60, 0, 0]);
      // Right (transparent): the backdrop shows through — NOT black.
      expectRgbNear(readPixel(backend, 48, 32), [60, 120, 200]);
    } finally {
      source.destroy();
      backend.destroy();
    }
  });

  test('backdrop is captured and composited unflipped (vertical split survives)', async () => {
    const backend = await createBackend();
    const white = createSolidTexture('#ffffff');
    const gl = backend.context;

    try {
      // Backdrop: red top half, blue bottom half (scissor in bottom-left origin).
      backend.clear(new Color(200, 40, 40));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, canvasSize, canvasSize / 2); // bottom half
      gl.clearColor(40 / 255, 40 / 255, 200 / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);

      // Opaque white under Darken = min(white, backdrop) = backdrop. The result
      // must match the backdrop spatially (top red, bottom blue) — a V-flip bug
      // would swap them.
      composeBackdropBlend(backend, white, BlendModes.Darken);

      expectRgbNear(readPixel(backend, 32, 8), [200, 40, 40]); // top
      expectRgbNear(readPixel(backend, 32, 56), [40, 40, 200]); // bottom
    } finally {
      white.destroy();
      backend.destroy();
    }
  });

  test('every advanced blend mode matches the W3C reference (opaque over opaque)', async () => {
    const backend = await createBackend();
    const backdropColor: [number, number, number] = [180, 110, 60];
    const sourceColor: [number, number, number] = [90, 200, 150];

    // Oracle self-check with hand-computed values (independent of the shader), so
    // a shared formula error cannot make GPU and reference agree on a wrong number.
    expect(expectedOpaqueBlend(BlendModes.Multiply, backdropColor, sourceColor)).toEqual([64, 86, 35]);
    expect(expectedOpaqueBlend(BlendModes.Difference, backdropColor, sourceColor)).toEqual([90, 90, 90]);
    expect(expectedOpaqueBlend(BlendModes.Luminosity, backdropColor, sourceColor)).toEqual([216, 146, 96]);

    const source = createSolidTexture(`rgb(${sourceColor[0]}, ${sourceColor[1]}, ${sourceColor[2]})`);
    const compositor = new WebGl2BackdropBlendCompositor();

    compositor.connect(backend);

    try {
      for (const mode of ADVANCED_BLEND_MODES) {
        // Re-establish the opaque backdrop each iteration (the previous compose
        // overwrote it) and blend the opaque source over it.
        backend.clear(new Color(backdropColor[0], backdropColor[1], backdropColor[2]));
        compositor.compose(backend, source, 0, 0, canvasSize, canvasSize, mode);

        expectRgbNear(readPixel(backend, 32, 32), expectedOpaqueBlend(mode, backdropColor, sourceColor), 5);
      }
    } finally {
      compositor.disconnect();
      source.destroy();
      backend.destroy();
    }
  });
});

/**
 * Mirror of the WebGPU cells in `webgpu-backdrop-blend`: root coverage is a
 * function of the canvas alpha mode, not of "is this the root target". Both
 * backends must read the same numbers from the same public option.
 */
describe('WebGL2 backdrop-aware blend — root coverage follows alphaMode', () => {
  const sourceColor: [number, number, number] = [90, 200, 150];

  const composeOverEmptyRoot = async (alphaMode: CanvasAlphaMode): Promise<RgbaTuple> => {
    const backend = await createBackend(alphaMode);
    const source = createSolidTexture(`rgb(${sourceColor[0]}, ${sourceColor[1]}, ${sourceColor[2]})`);

    try {
      backend.clear(new Color(0, 0, 0, 0));
      composeBackdropBlend(backend, source, BlendModes.Multiply);

      return readPixel(backend, 32, 32);
    } finally {
      source.destroy();
      backend.destroy();
    }
  };

  test("'opaque': an empty root stays a fully covered (black) backdrop", async () => {
    expectRgbNear(await composeOverEmptyRoot('opaque'), [0, 0, 0]);
  });

  test("'premultiplied': an empty root contributes no backdrop coverage", async () => {
    expectRgbNear(await composeOverEmptyRoot('premultiplied'), sourceColor);
  });
});
