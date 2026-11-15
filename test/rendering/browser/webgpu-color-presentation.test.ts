/**
 * Application-level color presentation contract, on both backends.
 *
 * Every case drives a real `Application` frame through `app.update()` and
 * reads the canvas back, so the whole presentation path is under test: the
 * working target, `framePasses`, `Scene.ui`, the output transform and the
 * canvas encode. Expectations are analytic: a linear value `v` lands on the
 * canvas as `round(srgbEncode(v) * 255)`, so a missing or doubled encode
 * moves sRGB mid-gray (128) to 56 or 188 rather than by a rounding step.
 *
 * Runs in the WebGPU lane because it is the only browser project with both
 * backends available:  pnpm test:browser:webgpu
 */

import type { Application as ApplicationType } from '#core/Application';
import { Application } from '#core/Application';
import type { ApplicationOptions } from '#core/application/ApplicationOptions';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { CrossFadeSceneTransition } from '#core/scene/transitions/CrossFadeSceneTransition';
import { seconds } from '#core/units';
import { Container } from '#rendering/Container';
import { FilterPass } from '#rendering/FilterPass';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { webGpuAvailable } from './_backendSetup';
import { expectPixelNear, type RgbaTuple } from './_pixels';

const size = 32;

type BackendChoice = 'webgl2' | 'webgpu';

const backends: readonly BackendChoice[] = ['webgl2', 'webgpu'];

const srgbEncode = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);
const srgbDecode = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const encodedByte = (linear: number): number => Math.round(srgbEncode(linear) * 255);

/** sRGB mid-gray: decodes to linear ~0.2159 and must come back as 128. */
const midGray = new Color(128, 128, 128, 1);
/** Linear 0.5 half coverage of white over black: 188 when blending is linear, 128 when it is not. */
const halfCoverage = encodedByte(0.5);

type DrawFn = (context: RenderingContext, app: ApplicationType) => void;
type UiFn = (scene: Scene) => void;

interface ProbeSetup {
  readonly draw: DrawFn;
  readonly ui?: UiFn;
  readonly configure?: (app: ApplicationType) => void;
  readonly options?: Partial<ApplicationOptions>;
}

const solid = (color: Color, x = 0, y = 0, width = size, height = size, blendMode: BlendModes = BlendModes.Normal): Graphics | Sprite => {
  if (blendMode === BlendModes.Normal) {
    const graphics = new Graphics();

    graphics.fillColor = color;
    graphics.drawRectangle(x, y, width, height);

    return graphics;
  }

  const sprite = new Sprite(Texture.white);

  sprite.setPosition(x, y).setTint(color).setBlendMode(blendMode);
  sprite.width = width;
  sprite.height = height;

  return sprite;
};

const canvasTexture = (fill: string, colorSpace?: 'srgb' | 'none'): Texture => {
  const source = document.createElement('canvas');

  source.width = 4;
  source.height = 4;

  const ctx = source.getContext('2d')!;

  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 4, 4);

  return new Texture(source, colorSpace !== undefined ? { colorSpace } : undefined);
};

/** Read the canvas the output transform wrote, top-left indexed, in the same task as the frame. */
const readCanvas = (app: ApplicationType): ((x: number, y: number) => RgbaTuple) => {
  const backend = app.backend;

  if (backend instanceof WebGl2Backend) {
    const gl = backend.context;
    const pixels = new Uint8Array(size * size * 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    return (x, y) => {
      const i = ((size - 1 - y) * size + x) * 4;

      return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!];
    };
  }

  const readback = document.createElement('canvas');

  readback.width = size;
  readback.height = size;

  const ctx = readback.getContext('2d')!;

  ctx.drawImage(app.canvas, 0, 0);

  const { data } = ctx.getImageData(0, 0, size, size);

  return (x, y) => {
    const i = (y * size + x) * 4;

    return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
  };
};

interface ProbeResult {
  readonly app: ApplicationType;
  readonly read: (x: number, y: number) => RgbaTuple;
}

const live: ApplicationType[] = [];

afterEach(async () => {
  await Promise.all(live.splice(0).map(app => app.destroy()));
});

const runFrame = async (backend: BackendChoice, setup: ProbeSetup): Promise<ProbeResult> => {
  class ProbeScene extends Scene {
    public override init(): void {
      setup.ui?.(this);
    }

    public override draw(context: RenderingContext): void {
      setup.draw(context, app);
    }
  }

  const app: ApplicationType = new Application({
    backend: { type: backend },
    clearColor: Color.black,
    hello: false,
    canvas: { width: size, height: size, pixelRatio: 1 },
    scenes: { ProbeScene },
    ...setup.options,
    rendering: {
      ...setup.options?.rendering,
      webglAttributes: { antialias: false, preserveDrawingBuffer: true, depth: false, ...setup.options?.rendering?.webglAttributes },
    },
  } as ApplicationOptions);

  live.push(app);
  await app.start(ProbeScene);
  setup.configure?.(app);
  app.update();

  return { app, read: readCanvas(app) };
};

/** A FilterPass with no filters is a blit - the identity frame pass. */
const identityPass = (app: ApplicationType): FilterPass => new FilterPass(app.frameTexture);

const describeBackend = (backend: BackendChoice): void => {
  describe(backend, () => {
    beforeEach(async ctx => {
      if (backend === 'webgpu' && !(await webGpuAvailable())) {
        ctx.skip('no WebGPU adapter');
      }
    });

    test('CS01/CS06 no frame passes: sRGB mid-gray survives the SDR round trip', async () => {
      const node = solid(midGray);
      const { read } = await runFrame(backend, { draw: context => context.render(node) });

      expectPixelNear(read(16, 16), [128, 128, 128, 255], 1);
      node.destroy();
    });

    test('CS06 the SDR working target stores encoded bytes, so a dark tone keeps its precision', async () => {
      // Linear eight-bit storage would round sRGB 8 (linear ~0.0024) to one
      // linear step, which encodes back to 13 - a precision loss, not a
      // conversion error, and exactly what encoded storage exists to avoid.
      const node = solid(new Color(8, 8, 8, 1));
      const { read } = await runFrame(backend, { draw: context => context.render(node) });

      expectPixelNear(read(16, 16), [8, 8, 8, 255], 1);
      node.destroy();
    });

    test('CS01 half coverage blends in linear light', async () => {
      const node = solid(new Color(255, 255, 255, 0.5));
      const { read } = await runFrame(backend, { draw: context => context.render(node) });

      expectPixelNear(read(16, 16), [halfCoverage, halfCoverage, halfCoverage, 255], 1);
      node.destroy();
    });

    test('CS02/CS18 an identity frame pass matches the direct path byte for byte', async () => {
      const nodeA = solid(midGray, 0, 0, 16, size);
      const nodeB = solid(new Color(255, 0, 0, 0.5), 16, 0, 16, size);

      const draw: DrawFn = context => {
        context.render(nodeA);
        context.render(nodeB);
      };

      const direct = await runFrame(backend, { draw });
      const passed = await runFrame(backend, { draw, configure: app => app.framePasses.addPass(identityPass(app)) });

      for (const [x, y] of [
        [4, 4],
        [24, 24],
      ] as const) {
        expectPixelNear(passed.read(x, y), direct.read(x, y), 0);
      }

      expectPixelNear(direct.read(24, 24), [halfCoverage, 0, 0, 255], 1);
      nodeA.destroy();
      nodeB.destroy();
    });

    test('CS03 chained frame passes through an intermediate working-format target stay encoded once', async () => {
      const node = solid(midGray);
      let intermediate: RenderTexture | null = null;
      const { read } = await runFrame(backend, {
        draw: context => context.render(node),
        configure: app => {
          intermediate = new RenderTexture(size, size, { format: app.frameTexture.format });
          app.framePasses.addPass(new FilterPass(app.frameTexture, [], { target: intermediate })).addPass(new FilterPass(intermediate));
        },
      });

      expectPixelNear(read(16, 16), [128, 128, 128, 255], 1);
      node.destroy();
      (intermediate as RenderTexture | null)?.destroy();
    });

    test('CS04 a nested RenderPipeline behaves like the flat chain', async () => {
      const node = solid(midGray);
      const { read } = await runFrame(backend, {
        draw: context => context.render(node),
        configure: app => {
          app.framePasses.addPass(new RenderPipeline({ label: 'nested' }).addPass(identityPass(app)));
        },
      });

      expectPixelNear(read(16, 16), [128, 128, 128, 255], 1);
      node.destroy();
    });

    test('CS05 Scene.ui composes in linear light with and without frame passes', async () => {
      const ui: UiFn = scene => {
        scene.ui.addChild(solid(new Color(255, 255, 255, 0.5), 0, 0, 16, size));
      };

      const draw: DrawFn = () => {
        /* the frame clears to black; only the UI draws */
      };

      const plain = await runFrame(backend, { draw, ui });
      const passed = await runFrame(backend, { draw, ui, configure: app => app.framePasses.addPass(identityPass(app)) });

      expectPixelNear(plain.read(4, 4), [halfCoverage, halfCoverage, halfCoverage, 255], 1);
      expectPixelNear(passed.read(4, 4), plain.read(4, 4), 0);
      expectPixelNear(passed.read(24, 4), [0, 0, 0, 255], 0);
    });

    test('CS07 an HDR working target carries linear 2.0 into the reinhard tone map exactly once', async ctx => {
      const nodes = [solid(Color.white, 0, 0, size, size, BlendModes.Additive), solid(Color.white, 0, 0, size, size, BlendModes.Additive)];
      const result = await runFrame(backend, {
        draw: context => nodes.forEach(node => context.render(node)),
        options: { rendering: { color: { workingFormat: 'hdr', toneMapping: 'reinhard' } } },
      }).catch((error: unknown) => {
        if (error instanceof Error && error.message.includes('Rgba16F')) {
          // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
          ctx.skip('no Rgba16F render-target support');
        }

        throw error;
      });

      expectPixelNear(result.read(16, 16), [encodedByte(2 / 3), encodedByte(2 / 3), encodedByte(2 / 3), 255], 1);

      const withPass = await runFrame(backend, {
        draw: context => nodes.forEach(node => context.render(node)),
        options: { rendering: { color: { workingFormat: 'hdr', toneMapping: 'reinhard' } } },
        configure: app => app.framePasses.addPass(identityPass(app)),
      });

      expectPixelNear(withPass.read(16, 16), result.read(16, 16), 0);
      nodes.forEach(node => node.destroy());
    });

    test('CS07 exposure scales linear light before the encode', async () => {
      const node = solid(midGray);
      const { read } = await runFrame(backend, {
        draw: context => context.render(node),
        options: { rendering: { color: { exposure: 1 } } },
      });
      const expected = encodedByte(Math.min(1, srgbDecode(128 / 255) * 2));

      expectPixelNear(read(16, 16), [expected, expected, expected, 255], 1);
      node.destroy();
    });

    test('CS08 additive light sums in linear light', async () => {
      const quarter = new Color(encodedByte(0.25), encodedByte(0.25), encodedByte(0.25), 1);
      const nodes = [solid(quarter, 0, 0, size, size, BlendModes.Additive), solid(quarter, 0, 0, size, size, BlendModes.Additive)];
      const { read } = await runFrame(backend, { draw: context => nodes.forEach(node => context.render(node)) });

      expectPixelNear(read(16, 16), [halfCoverage, halfCoverage, halfCoverage, 255], 2);
      nodes.forEach(node => node.destroy());
    });

    test('CS09 a transparent canvas keeps premultiplied coverage and encodes the unassociated color', async () => {
      const node = solid(new Color(255, 255, 255, 0.5));
      const { app } = await runFrame(backend, {
        draw: context => context.render(node),
        options: { clearColor: Color.transparentBlack, rendering: { alphaMode: 'premultiplied' } },
        configure: application => application.framePasses.addPass(identityPass(application)),
      });

      const frame = await app.rendering.readImageData(app.frameTexture);

      const i = (16 * size + 16) * 4;

      // Straight-alpha ImageData: white at half coverage. Half coverage is 127.5
      // in eight bits, which adapters round either way.
      expectPixelNear([frame.data[i]!, frame.data[i + 1]!, frame.data[i + 2]!, frame.data[i + 3]!], [255, 255, 255, 128], 1);
      node.destroy();
    });

    test('CS10/CS11 renderTo into a caller-owned sRGB target and drawing it back is lossless', async () => {
      const content = solid(midGray);
      const offscreen = new RenderTexture(size, size, { format: TextureFormat.Rgba8Srgb });
      const sprite = new Sprite(offscreen);
      const { read } = await runFrame(backend, {
        draw: context => {
          context.renderTo(content, { target: offscreen, clear: Color.transparentBlack });
          context.render(sprite);
        },
      });

      expectPixelNear(read(16, 16), [128, 128, 128, 255], 1);
      content.destroy();
      sprite.destroy();
      offscreen.destroy();
    });

    test('CS12 readImageData of the frame texture matches the canvas', async () => {
      const node = solid(midGray, 0, 0, 16, size);
      const half = solid(new Color(0, 0, 255, 0.5), 16, 0, 16, size);
      const { app, read } = await runFrame(backend, {
        draw: context => {
          context.render(node);
          context.render(half);
        },
        configure: application => application.framePasses.addPass(identityPass(application)),
      });
      const image = await app.rendering.readImageData(app.frameTexture, { background: Color.black });

      for (const [x, y] of [
        [4, 4],
        [24, 4],
      ] as const) {
        const i = (y * size + x) * 4;

        expectPixelNear([image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, image.data[i + 3]!], read(x, y), 0);
      }

      node.destroy();
      half.destroy();
    });

    test('CS13 a multisampled working frame resolves to the same interior color', async () => {
      const node = solid(midGray);
      const { read } = await runFrame(backend, {
        draw: context => context.render(node),
        options: { rendering: { webglAttributes: { antialias: true } } },
      });

      expectPixelNear(read(16, 16), [128, 128, 128, 255], 1);
      node.destroy();
    });

    test('CS14 a resize keeps the encode on the reallocated working targets', async () => {
      const node = solid(midGray, 0, 0, 64, 64);
      const { app } = await runFrame(backend, {
        draw: context => context.render(node),
        configure: application => application.framePasses.addPass(identityPass(application)),
      });

      app.resize(size / 2, size / 2);
      app.resize(size, size);
      app.update();

      expectPixelNear(readCanvas(app)(16, 16), [128, 128, 128, 255], 1);
      node.destroy();
    });

    test('CS16 several render calls in one frame composite in call order', async () => {
      const back = solid(Color.white);
      const front = solid(new Color(0, 0, 0, 0.5));
      const { read } = await runFrame(backend, {
        draw: context => {
          context.render(back);
          context.render(front);
        },
      });

      expectPixelNear(read(16, 16), [halfCoverage, halfCoverage, halfCoverage, 255], 1);
      back.destroy();
      front.destroy();
    });

    // A transition captures the outgoing and the current scene into textures and
    // draws them back; those captures are working storage like the frame target
    // itself, so the frame must look the same with a transition running.
    const runTransition = async (fill: DrawFn, options: Partial<ApplicationOptions>): Promise<readonly [RgbaTuple, RgbaTuple]> => {
      class FromScene extends Scene {
        public override draw(context: RenderingContext): void {
          fill(context, app);
        }
      }

      class ToScene extends FromScene {}

      const app: ApplicationType = new Application({
        backend: { type: backend },
        clearColor: Color.black,
        hello: false,
        canvas: { width: size, height: size, pixelRatio: 1 },
        scenes: { FromScene, ToScene },
        ...options,
        rendering: { ...options.rendering, webglAttributes: { antialias: false, preserveDrawingBuffer: true, depth: false } },
      } as ApplicationOptions);

      live.push(app);
      await app.start(FromScene);
      app.update();

      const before = readCanvas(app)(16, 16);
      const navigation = app.scenes.change(ToScene, { transition: new CrossFadeSceneTransition({ duration: seconds(60) }) });

      // Let the incoming scene load and the session commit, then hold mid-fade.
      for (let frame = 0; frame < 20 && app.scenes.currentScene instanceof ToScene === false; frame++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      app.update();

      const during = readCanvas(app)(16, 16);

      void navigation.catch(() => undefined);

      return [before, during];
    };

    test('CS19 an HDR frame keeps its tone-mapped color while a transition captures it', async ctx => {
      if (backend === 'webgl2' && !document.createElement('canvas').getContext('webgl2')?.getExtension('EXT_color_buffer_float')) {
        // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
        ctx.skip('no Rgba16F render-target support');
      }

      const nodes = [0, 1, 2, 3].map(() => solid(Color.white, 0, 0, size, size, BlendModes.Additive));
      const [before, during] = await runTransition(context => nodes.forEach(node => context.render(node)), {
        rendering: { color: { workingFormat: 'hdr', toneMapping: 'reinhard' } },
      });
      const expected = encodedByte(4 / 5);

      expectPixelNear(before, [expected, expected, expected, 255], 1);
      expectPixelNear(during, before, 1);
      nodes.forEach(node => node.destroy());
    });

    test('CS20 an SDR dark tone keeps its precision while a transition captures it', async () => {
      const node = solid(new Color(8, 8, 8, 1));
      const [before, during] = await runTransition(context => context.render(node), {});

      expectPixelNear(before, [8, 8, 8, 255], 1);
      expectPixelNear(during, before, 1);
      node.destroy();
    });

    test('CS17 an sRGB texture is decoded and a data texture is not', async () => {
      const srgb = canvasTexture('#808080');
      const data = canvasTexture('#808080', 'none');
      const root = new Container();
      const left = new Sprite(srgb);
      const right = new Sprite(data);

      left.width = 16;
      left.height = size;
      right.width = 16;
      right.height = size;
      right.setPosition(16, 0);
      root.addChild(left, right);

      const { read } = await runFrame(backend, { draw: context => context.render(root) });

      expectPixelNear(read(4, 16), [128, 128, 128, 255], 1);
      // Data bytes are taken as linear values: 128/255 linear encodes to ~188.
      expectPixelNear(read(24, 16), [encodedByte(128 / 255), encodedByte(128 / 255), encodedByte(128 / 255), 255], 1);
      root.destroy();
      srgb.destroy();
      data.destroy();
    });
  });
};

describe('Application color presentation', () => {
  for (const backend of backends) {
    describeBackend(backend);
  }
});
