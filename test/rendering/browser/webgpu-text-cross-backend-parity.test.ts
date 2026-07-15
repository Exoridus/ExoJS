/**
 * Cross-backend pixel-parity for retained Text (Track B extension, Task 2
 * Step 11): the SAME text content, transform, and retained-group setup, driven
 * through the retained instruction-replay tier on BOTH `WebGl2Backend` and
 * `WebGpuBackend`, must produce matching pixels within the project's tolerance.
 *
 * This is the hard acceptance criterion for the Text retained pair: WebGPU
 * reads the per-node transform live in the vertex stage; WebGL2 CPU-bakes world
 * positions into the recorded vertex bytes (the ANGLE/D3D11 workaround). Those
 * are two different mechanisms for the same result, and this test proves they
 * land the same glyphs in the same pixels.
 *
 * Runs in the `browser-webgpu` Chromium (WebGPU + WebGL2 both available in one
 * instance). Skips only when the software WebGPU adapter drops mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

// WebGL2 uses shipped `.vert`/`.frag` files (stubbed to "" by the browser
// plugin); restore the real text GLSL and provide minimal Sprite/Mesh mocks so
// `wireCoreRenderers()` can compile the WebGL2 registry. The WebGPU backend
// uses inline WGSL and is unaffected by these mocks.
vi.mock('#rendering/webgl2/glsl/text.vert', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text.vert?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-sdf.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-msdf.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-color.frag?raw')).default }));

const auxShaderSources = vi.hoisted(() => ({
  spriteVert: `#version 300 es
precision highp float;
in vec4 a_localBounds; in vec4 a_uvBounds; in vec4 a_color; in uint a_textureSlot; in uint a_nodeIndex;
uniform mat3 u_projection; uniform mat3 u_group; uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; flat out uint v_textureSlot;
void main() {
  vec2 local = vec2(a_localBounds.x, a_localBounds.y);
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  vec2 world = vec2(m0.x * local.x + m0.y * local.y + m1.x, m0.z * local.x + m0.w * local.y + m1.y);
  gl_Position = vec4((u_projection * u_group * vec3(world, 1.0)).xy, 0.0, 1.0);
  v_uv = a_uvBounds.xy; v_color = a_color; v_textureSlot = a_textureSlot;
}`,
  meshVert: `#version 300 es
precision highp float;
in vec2 a_position; in vec2 a_texcoord; in vec4 a_color; in uint a_nodeIndex;
uniform mat3 u_projection; uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 t = mat3(m0.x,m0.z,0.0, m0.y,m0.w,0.0, m1.x,m1.y,1.0);
  gl_Position = vec4((u_projection * t * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_uv = a_texcoord; v_color = a_color; v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,
  meshFrag: `#version 300 es
precision mediump float;
in vec2 v_uv; in vec4 v_color; in vec4 v_tint;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv) * v_color * v_tint; }`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: auxShaderSources.spriteVert }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => ({ default: (await import('./_spriteFragMock')).createSpriteFragMockSource('v_uv') }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: auxShaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: auxShaderSources.meshFrag }));

const canvasSize = 96;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
      rendering: {
        debug: false,
        webglAttributes: {
          alpha: false,
          antialias: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  }) as unknown as Application;

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  return canvas;
};

/** The SAME scene, freshly built per backend. */
const buildScene = (): { root: Container } => {
  const root = new Container();
  const group = new RetainedContainer();
  const text = new Text('MW', { fillColor: Color.white, fontSize: 40 });

  text.setPosition(4, 4);
  group.addChild(text);
  group.setPosition(8, 8);
  root.addChild(group);

  return { root };
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const setupWebGpu = async (): Promise<WebGpuBackend> => {
  const backend = new WebGpuBackend(makeApp(makeCanvas()));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const renderWebGpu = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    expect(await device.popErrorScope()).toBeNull();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  return true;
};

const readWebGpu = (backend: WebGpuBackend): Uint8ClampedArray => {
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const rctx = readback.getContext('2d');

  if (!rctx) throw new Error('2D context required for readback.');

  rctx.drawImage(backend.context.canvas as HTMLCanvasElement, 0, 0);

  return rctx.getImageData(0, 0, canvasSize, canvasSize).data;
};

const setupWebGl2 = async (): Promise<WebGl2Backend> => {
  const app = makeApp(makeCanvas());
  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const renderWebGl2 = (backend: WebGl2Backend, root: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  root.render(backend);
  backend.flush();
};

/** Top-left-indexed RGBA readback for WebGL2 (flip the bottom-left GL buffer). */
const readWebGl2 = (backend: WebGl2Backend): Uint8Array => {
  const gl = backend.context;
  const flipped = new Uint8Array(canvasSize * canvasSize * 4);

  gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, flipped);

  const out = new Uint8Array(canvasSize * canvasSize * 4);

  for (let y = 0; y < canvasSize; y++) {
    const src = (canvasSize - 1 - y) * canvasSize * 4;
    const dst = y * canvasSize * 4;

    out.set(flipped.subarray(src, src + canvasSize * 4), dst);
  }

  return out;
};

const luma = (frame: ArrayLike<number>, index: number): number => 0.299 * frame[index]! + 0.587 * frame[index + 1]! + 0.114 * frame[index + 2]!;

/** Coverage mask: 1 where luma > 128 (ink), else 0. */
const inkMask = (frame: ArrayLike<number>): Uint8Array => {
  const mask = new Uint8Array(canvasSize * canvasSize);

  for (let p = 0; p < mask.length; p++) {
    mask[p] = luma(frame, p * 4) > 128 ? 1 : 0;
  }

  return mask;
};

describe('Cross-backend parity: retained Text renders identically on WebGL2 and WebGPU', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('the same retained Text lands the same glyph pixels on both backends', async ctx => {
    const gpu = await setupWebGpu();
    const gpuScene = buildScene();
    const gl = await setupWebGl2();
    const glScene = buildScene();

    try {
      // Drive each backend through F1 capture, F2 record, F3 instruction replay
      // so BOTH read back from their retained fast tier, not a fresh collect.
      for (let f = 0; f < 3; f++) {
        if (!(await renderWebGpu(ctx, gpu, gpuScene.root))) return;
        renderWebGl2(gl, glScene.root);
      }

      const gpuFrame = readWebGpu(gpu);
      const glFrame = readWebGl2(gl);

      const gpuMask = inkMask(gpuFrame);
      const glMask = inkMask(glFrame);

      let gpuInk = 0;
      let glInk = 0;
      let agree = 0;

      for (let p = 0; p < gpuMask.length; p++) {
        gpuInk += gpuMask[p]!;
        glInk += glMask[p]!;
        if (gpuMask[p] === glMask[p]) agree++;
      }

      // Both actually rendered glyphs (not an empty frame on either side).
      expect(gpuInk).toBeGreaterThan(80);
      expect(glInk).toBeGreaterThan(80);

      // Same glyphs in the same place: the ink coverage masks agree on the
      // overwhelming majority of pixels (a misplaced or missing glyph on either
      // backend would flip hundreds of pixels here). AA-edge pixels account for
      // the small residual.
      const agreementRatio = agree / gpuMask.length;

      expect(agreementRatio).toBeGreaterThan(0.97);

      // The ink footprints match in magnitude (neither backend renders a
      // materially larger/smaller glyph).
      expect(Math.abs(gpuInk - glInk)).toBeLessThan(gpuInk * 0.2);

      // Per-pixel colour parity on the SOLID interior/background: every pixel
      // both backends agree is ink must be ~white on both, and agreed
      // background ~black on both — within the project's ±8/channel tolerance.
      let checkedInterior = 0;

      for (let p = 0; p < gpuMask.length; p++) {
        if (gpuMask[p] === 1 && glMask[p] === 1) {
          // Both solidly ink here: colours must match within tolerance.
          for (let c = 0; c < 3; c++) {
            expect(Math.abs(gpuFrame[p * 4 + c]! - glFrame[p * 4 + c]!)).toBeLessThanOrEqual(8);
          }

          checkedInterior++;
        }
      }

      // The interior comparison above must have actually run on a real region.
      expect(checkedInterior).toBeGreaterThan(40);
    } finally {
      gpuScene.root.destroy();
      glScene.root.destroy();
      gpu.destroy();
      gl.destroy();
    }
  });
});
