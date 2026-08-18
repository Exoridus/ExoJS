import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

type RgbaTuple = [number, number, number, number];

const canvasWidth = 400;
const canvasHeight = 200;

const defaultWebGlAttributes: WebGLContextAttributes = {
  antialias: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

interface BackendRuntime {
  backend: WebGl2Backend;
}

const createBackend = async (): Promise<BackendRuntime> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasWidth, height: canvasHeight },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return { backend };
};

const createSolidTexture = (color: string, width = 32, height = 32): Texture => {
  const source = document.createElement('canvas');

  source.width = width;
  source.height = height;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, width, height);

  return new Texture(source);
};

const createFullscreenSprite = (texture: Texture): Sprite =>
  new Sprite(texture)
    .setPosition(canvasWidth / 2, canvasHeight / 2)
    .setAnchor(0.5)
    .setScale(canvasWidth / texture.width, canvasHeight / texture.height);

describe('WebGL2 split-screen viewport', () => {
  test('left and right viewports render independently via setView', async () => {
    const { backend } = await createBackend();
    const redTex = createSolidTexture('#ff0000', 16, 16);
    const greenTex = createSolidTexture('#00ff00', 16, 16);

    const leftCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0, 0.5, 1),
    });
    const rightCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0.5, 0, 0.5, 1),
    });

    const redSprite = createFullscreenSprite(redTex);
    const greenSprite = createFullscreenSprite(greenTex);

    try {
      backend.clear(Color.black);
      backend.setView(leftCam);
      redSprite.render(backend);
      backend.setView(rightCam);
      greenSprite.render(backend);
      backend.flush();

      expectPixelNear(readWebGl2Pixel(backend, 50, canvasHeight / 2), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 250, canvasHeight / 2), [0, 255, 0, 255]);
    } finally {
      redSprite.destroy();
      greenSprite.destroy();
      redTex.destroy();
      greenTex.destroy();
      backend.destroy();
    }
  });

  test('viewport update after camera switch is immediate', async () => {
    const { backend } = await createBackend();
    const blueTex = createSolidTexture('#0000ff', 16, 16);
    const yellowTex = createSolidTexture('#ffff00', 16, 16);

    const leftCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0, 0.5, 1),
    });
    const rightCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0.5, 0, 0.5, 1),
    });

    const blueSprite = createFullscreenSprite(blueTex);
    const yellowSprite = createFullscreenSprite(yellowTex);

    try {
      backend.clear(Color.black);
      backend.setView(rightCam);
      blueSprite.render(backend);
      backend.setView(leftCam);
      yellowSprite.render(backend);
      backend.flush();

      expectPixelNear(readWebGl2Pixel(backend, 250, canvasHeight / 2), [0, 0, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 50, canvasHeight / 2), [255, 255, 0, 255]);
    } finally {
      blueSprite.destroy();
      yellowSprite.destroy();
      blueTex.destroy();
      yellowTex.destroy();
      backend.destroy();
    }
  });

  test('context.render with view override applies viewport', async () => {
    const { backend } = await createBackend();
    const whiteTex = createSolidTexture('#ffffff', 16, 16);

    const leftCam = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0, 0.5, 1),
    });
    const defaultView = new View(canvasWidth / 2, canvasHeight / 2, canvasWidth, canvasHeight);

    const sprite = createFullscreenSprite(whiteTex);

    try {
      backend.clear(Color.black);

      backend.setView(leftCam);
      sprite.render(backend);

      backend.setView(defaultView);
      sprite.render(backend);
      backend.flush();

      expectPixelNear(readWebGl2Pixel(backend, 50, canvasHeight / 2), [255, 255, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 250, canvasHeight / 2), [255, 255, 255, 255]);
    } finally {
      sprite.destroy();
      whiteTex.destroy();
      backend.destroy();
    }
  });

  test('top viewport paints the TOP of the canvas (partial viewport y is not flipped to the bottom)', async () => {
    const { backend } = await createBackend();
    const redTex = createSolidTexture('#ff0000', 16, 16);
    const greenTex = createSolidTexture('#00ff00', 16, 16);

    const topView = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0, 1, 0.5),
    });
    const bottomView = View.from({
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
      size: { width: canvasWidth, height: canvasHeight },
      viewport: new Rectangle(0, 0.5, 1, 0.5),
    });

    const red = createFullscreenSprite(redTex);
    const green = createFullscreenSprite(greenTex);

    try {
      backend.clear(Color.black);
      backend.setView(topView);
      red.render(backend);
      backend.setView(bottomView);
      green.render(backend);
      backend.flush();

      // readPixel takes top-left y: the top-left viewport must paint the TOP quarter
      // red and the bottom viewport the BOTTOM quarter green (GL's bottom-left origin
      // must be flipped for partial viewports).
      expectPixelNear(readWebGl2Pixel(backend, canvasWidth / 2, canvasHeight * 0.25), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, canvasWidth / 2, canvasHeight * 0.75), [0, 255, 0, 255]);
    } finally {
      red.destroy();
      green.destroy();
      redTex.destroy();
      greenTex.destroy();
      backend.destroy();
    }
  });
});
