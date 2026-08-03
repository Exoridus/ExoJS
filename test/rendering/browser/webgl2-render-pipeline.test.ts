import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderNodePass } from '#rendering/RenderNodePass';
import { RenderPipeline } from '#rendering/RenderPipeline';
import type { RenderTarget } from '#rendering/RenderTarget';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// Simplified shaders mocked in place of the real .vert/.frag string imports
// (the test environment has no loader for them). Hoisted so the sync vi.mock
// factories below can reference them.
const canvasSize = 64;
const center = canvasSize / 2;
const red: [number, number, number, number] = [255, 0, 0, 255];

const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
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

  return backend;
};

type RGBATuple = [number, number, number, number];

const readPixel = (backend: WebGl2Backend, x: number, y: number): RGBATuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;
  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const readPixelFromTarget = (backend: WebGl2Backend, target: RenderTarget, x: number, y: number): RGBATuple => {
  const previousTarget = backend.renderTarget;
  backend.setRenderTarget(target);
  const pixel = new Uint8Array(4);
  const gl = backend.context;
  gl.readPixels(Math.floor(x), target.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  backend.setRenderTarget(previousTarget);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectPixelNear = (actual: RGBATuple, expected: RGBATuple, tolerance = 8): void => {
  for (let index = 0; index < 4; index++) {
    if (Math.abs(actual[index] - expected[index]) > tolerance) {
      throw new Error(`Pixel mismatch at channel ${index}: expected ${expected.toString()}, got ${actual.toString()} (tolerance ${tolerance})`);
    }
  }
};

const createSolidSprite = (color: string): { sprite: Sprite; texture: Texture } => {
  const source = document.createElement('canvas');
  source.width = canvasSize;
  source.height = canvasSize;
  const context = source.getContext('2d');
  if (!context) throw new Error('2D context is required to create test textures.');
  context.fillStyle = color;
  context.fillRect(0, 0, canvasSize, canvasSize);
  const texture = new Texture(source);
  const sprite = new Sprite(texture).setPosition(0, 0);

  return { sprite, texture };
};

describe('RenderPipeline WebGL2 browser pixels', () => {
  test('a target RenderNodePass renders the node into the off-screen texture', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const target = new RenderTexture(canvasSize, canvasSize);
    const { sprite, texture } = createSolidSprite('#ff0000');

    new RenderPipeline().addPass(new RenderNodePass(sprite, { target, clear: Color.black })).execute(context);

    expectPixelNear(readPixelFromTarget(backend, target, center, center), red);

    target.destroy();
    texture.destroy();
    backend.destroy();
  });

  test('golden parity: pipeline target render equals the imperative BackendTargetPass path', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const pipelineTarget = new RenderTexture(canvasSize, canvasSize);
    const imperativeTarget = new RenderTexture(canvasSize, canvasSize);
    const { sprite, texture } = createSolidSprite('#ff0000');

    new RenderPipeline().addPass(new RenderNodePass(sprite, { target: pipelineTarget, clear: Color.black })).execute(context);

    backend.execute(
      new BackendTargetPass(
        passBackend => {
          sprite.render(passBackend);
        },
        { target: imperativeTarget, view: imperativeTarget.view, clearColor: Color.black },
      ),
    );

    const samples: Array<[number, number]> = [
      [4, 4],
      [center, center],
      [canvasSize - 4, canvasSize - 4],
    ];

    for (const [x, y] of samples) {
      const pipelinePixel = readPixelFromTarget(backend, pipelineTarget, x, y);
      const imperativePixel = readPixelFromTarget(backend, imperativeTarget, x, y);
      expectPixelNear(pipelinePixel, imperativePixel, 2);
      expectPixelNear(pipelinePixel, red);
    }

    pipelineTarget.destroy();
    imperativeTarget.destroy();
    texture.destroy();
    backend.destroy();
  });

  test('a disabled pass is skipped — its target keeps its prior contents', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const target = new RenderTexture(canvasSize, canvasSize);
    const { sprite, texture } = createSolidSprite('#ff0000');

    backend.setRenderTarget(target);
    backend.clear(new Color(0, 0, 255));
    backend.setRenderTarget(backend.renderTarget);

    const disabled = new RenderNodePass(sprite, { target, clear: Color.black, enabled: false });
    new RenderPipeline().addPass(disabled).execute(context);

    expectPixelNear(readPixelFromTarget(backend, target, center, center), [0, 0, 255, 255]);

    target.destroy();
    texture.destroy();
    backend.destroy();
  });

  test('a non-target RenderNodePass renders into the active target (canvas)', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const { sprite, texture } = createSolidSprite('#ff0000');

    new RenderPipeline().addPass(new RenderNodePass(sprite, { clear: Color.black })).execute(context);
    backend.flush();

    expectPixelNear(readPixel(backend, center, center), red);

    texture.destroy();
    backend.destroy();
  });

  test('a nested pipeline renders its children to the active target', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const { sprite, texture } = createSolidSprite('#ff0000');

    const inner = new RenderPipeline({ label: 'inner' }).addPass(new RenderNodePass(sprite, { clear: Color.black }));
    new RenderPipeline({ label: 'frame' }).addPass(inner).execute(context);
    backend.flush();

    expectPixelNear(readPixel(backend, center, center), red);

    texture.destroy();
    backend.destroy();
  });
});
