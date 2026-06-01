/**
 * WebGPU geometric (stencil) clipping browser tests — opt-in, capability-aware.
 *
 * The WebGPU backend supports Rectangle/bounds clipping (scissor parity with
 * WebGL2) AND geometric stencil clipping (phase 12E): a per-target
 * depth24plus-stencil8 attachment shared across the clip scope's passes, an
 * increment/decrement stencil-write pipeline, and stencil-enabled content
 * pipeline variants. These tests mirror webgl2-stencil-clip.test.ts.
 *
 * Correctness is checked two ways:
 *  - GPU validation: every scenario runs inside a pushErrorScope('validation')
 *    so a mismatched pipeline/attachment or bad setStencilReference fails.
 *  - Pixels: the presented WebGPU canvas is read back via drawImage onto a 2D
 *    canvas (a standard cross-context read) and sampled.
 *
 * All tests skip gracefully when WebGPU is unavailable.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { Rectangle } from '@/math/Rectangle';
import { ParticleSystem } from '@/particles/ParticleSystem';
import { Container } from '@/rendering/Container';
import { Geometry } from '@/rendering/geometry/Geometry';
import { MeshMaterial } from '@/rendering/material/MeshMaterial';
import { ShaderSource } from '@/rendering/material/ShaderSource';
import { SpriteMaterial } from '@/rendering/material/SpriteMaterial';
import { Mesh } from '@/rendering/mesh/Mesh';
import { Graphics } from '@/rendering/primitives/Graphics';
import type { RenderNode } from '@/rendering/RenderNode';
import { Sprite } from '@/rendering/sprite/Sprite';
import { BitmapText, type BmFontData } from '@/rendering/text/BitmapText';
import { BmFont } from '@/rendering/text/BmFont';
import { Texture } from '@/rendering/texture/Texture';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';

import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement, logicalSize = canvasSize): Application =>
  ({
    canvas,
    options: {
      canvas: { width: logicalSize, height: logicalSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const createSolidTexture = (color: string, size = 64): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

// Right triangle covering the lower-left half of a `size` box anchored at the
// origin: (0,0) -> (size,0) -> (0,size). Points with x + y < size are inside.
const createRightTriangle = (size: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, size, 0, 0, size]),
    stride: 8,
  });

const createQuadGeometry = (x: number, y: number, width: number, height: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([x, y, x + width, y, x + width, y + height, x, y, x + width, y + height, x, y + height]),
    stride: 8,
  });

// A solid `size`×`size` quad Mesh anchored at the origin, painted with `color`
// via tint over the implicit white texture (default-material mesh path).
const createQuadMesh = (size: number, color: Color): Mesh => {
  const mesh = new Mesh({
    vertices: new Float32Array([0, 0, size, 0, size, size, 0, 0, size, size, 0, size]),
  });

  mesh.tint = color;

  return mesh;
};

// A BitmapText whose single glyph 'A' fills the whole `size`×`size` atlas page,
// placed at the line origin so its quad covers (0,0)–(size,size). The atlas page
// is a solid-colour texture, so the colour-atlas shader (msdf = false) emits that
// colour over the default white fill tint — deterministic pixels with no runtime
// font rasterisation or atlas-upload timing.
const createSolidBitmapText = (color: string, size: number): { text: BitmapText; texture: Texture } => {
  const texture = createSolidTexture(color, size);
  const fontData: BmFontData = {
    pages: ['atlas_0.png'],
    chars: new Map([[65, { x: 0, y: 0, width: size, height: size, xOffset: 0, yOffset: 0, xAdvance: size, page: 0 }]]),
    kernings: new Map(),
    // base === lineHeight ⇒ yBearing 0 ⇒ the glyph top sits at the line origin.
    lineHeight: size,
    base: size,
  };

  return { text: new BitmapText('A', new BmFont(fontData, [texture])), texture };
};

// Custom MeshMaterial WGSL honouring the mesh contract: group(0) auto-bound mesh
// uniforms (projection, translation, tint). Compiled for real now that a
// custom-material Mesh is supported under a Geometry stencil clip — its fragment
// emits the premultiplied tint so the clipped/visible pixels are checkable.
const customMeshWgsl = /* wgsl */ `
struct MeshUniforms {
    projection: mat3x3<f32>,
    translation: mat3x3<f32>,
    tint: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_mesh: MeshUniforms;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let world = u_mesh.translation * vec3<f32>(input.position, 1.0);
    let clip = u_mesh.projection * world;
    var output: VertexOutput;
    output.position = vec4<f32>(clip.xy, 0.0, 1.0);
    output.color = input.color * u_mesh.tint;
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.color.rgb * input.color.a, input.color.a);
}
`;

// Custom SpriteMaterial fragment WGSL (the engine prepends the canonical sprite
// vertex module exposing VertexOutput, the group(1) base texture `u_texture` /
// `u_sampler`). Compiled for real now that a custom-material Sprite is supported
// under a Geometry stencil clip — it tints the white base texture by the user
// `color` uniform so the clipped/visible pixels are checkable.
const customSpriteWgsl = `
struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let base = textureSample(u_texture, u_sampler, input.texcoord);
  return vec4<f32>(base.rgb * u_user.color.rgb, 1.0);
}
`.trim();

const setupBackend = async (ctx: { skip: (reason: string) => void }, logicalSize = canvasSize): Promise<WebGpuBackend> => {
  if (!navigator.gpu) {
    ctx.skip('WebGPU unavailable: navigator.gpu is absent');
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    ctx.skip('WebGPU unavailable: requestAdapter() returned null');
  }

  const canvas = document.createElement('canvas');

  // The physical backing store is always canvasSize. A logicalSize < canvasSize
  // models pixelRatio = canvasSize / logicalSize: the root render target stays
  // logical while the canvas / getCurrentTexture() colour attachment is physical.
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas, logicalSize));

  await backend.initialize();

  return backend;
};

// Read the presented WebGPU canvas back through a 2D canvas. drawImage accepts a
// WebGPU-configured canvas as an image source, giving CPU-side pixel access
// without touching the backend's managed GPU textures.
const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d');

  if (!ctx) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

// On the software (swiftshader) adapter used in CI the WebGPU device can be
// dropped mid-test ("Instance dropped in popErrorScope"). Treat that as an
// unavailable-adapter skip rather than a failure, matching setupBackend().
const isDeviceLoss = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderClipped = async (
  ctx: { skip: (reason: string) => void },
  backend: WebGpuBackend,
  root: RenderNode,
): Promise<void> => {
  const device = getBackendDeviceOrSkip(ctx, backend);

  if (!device) {
    return;
  }

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return;
    }

    throw error;
  }

  expect(validationError).toBeNull();
};

describe('WebGPU geometric (stencil) clipping', () => {
  test('Geometry clipShape discards fragments outside the shape', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Inside the triangle (x + y << 48): red survives.
      expectPixelNear(readPixel(6, 6), [255, 0, 0, 255]);
      // Outside the triangle (x + y >> 48): clipped to the black clear.
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('nested stencil clips render only the intersection', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const outer = new Container();
    const inner = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 64;
      sprite.height = 64;
      // Outer clip: left half (x in [0,32)). Inner clip: top half (y in [0,32)).
      outer.clip = true;
      outer.clipShape = createQuadGeometry(0, 0, 32, 64);
      inner.clip = true;
      inner.clipShape = createQuadGeometry(0, 0, 64, 32);
      inner.addChild(sprite);
      outer.addChild(inner);
      root.addChild(outer);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Intersection (top-left quadrant): visible.
      expectPixelNear(readPixel(12, 12), [255, 0, 0, 255]);
      // Only outer (bottom-left): clipped by inner.
      expectPixelNear(readPixel(12, 48), [0, 0, 0, 255]);
      // Only inner (top-right): clipped by outer.
      expectPixelNear(readPixel(48, 12), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (outer.clipShape as Geometry).destroy();
      (inner.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('stencil clip composes with a scissor rect (intersection)', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 64;
      sprite.height = 64;
      // Stencil: left half. Scissor (mask Rectangle): top half. Both restrict.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 32, 64);
      clipped.mask = new Rectangle(0, 0, 64, 32);
      clipped.addChild(sprite);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Top-left: inside both.
      expectPixelNear(readPixel(12, 12), [255, 0, 0, 255]);
      // Bottom-left: inside stencil, outside scissor.
      expectPixelNear(readPixel(12, 48), [0, 0, 0, 255]);
      // Top-right: inside scissor, outside stencil.
      expectPixelNear(readPixel(48, 12), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a clipped container clips multiple children', async ctx => {
    const backend = await setupBackend(ctx);
    const redTexture = createSolidTexture('#ff0000');
    const greenTexture = createSolidTexture('#00ff00');
    const root = new Container();
    const clipped = new Container();
    const left = new Sprite(redTexture);
    const right = new Sprite(greenTexture);

    try {
      left.setPosition(0, 0);
      left.width = 24;
      left.height = 64;
      right.setPosition(40, 0);
      right.width = 24;
      right.height = 64;
      // Clip to the top half: both children keep their top, lose their bottom.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 64, 32);
      clipped.addChild(left, right);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 12), [255, 0, 0, 255]);
      expectPixelNear(readPixel(48, 12), [0, 255, 0, 255]);
      // Both clipped away below y = 32.
      expectPixelNear(readPixel(8, 48), [0, 0, 0, 255]);
      expectPixelNear(readPixel(48, 48), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      redTexture.destroy();
      greenTexture.destroy();
      backend.destroy();
    }
  });

  test('scene without clip renders unchanged (stencil attachment inert)', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.width = 24;
      sprite.height = 24;
      root.addChild(sprite);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('balanced clips do not throw', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      await expect(renderClipped(ctx, backend, root)).resolves.toBeUndefined();
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('Rectangle clipShape still uses the scissor path (no throw)', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = new Rectangle(16, 16, 16, 16);
      clipped.addChild(sprite);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(24, 24), [255, 0, 0, 255]);
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a default-material Mesh renders inside a Geometry stencil clip', async ctx => {
    const backend = await setupBackend(ctx);
    const root = new Container();
    const clipped = new Container();
    const mesh = createQuadMesh(48, Color.red);

    try {
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(mesh);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Inside the triangle (x + y << 48): the red mesh survives.
      expectPixelNear(readPixel(6, 6), [255, 0, 0, 255]);
      // Outside the triangle (x + y >> 48): clipped to the black clear.
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      backend.destroy();
    }
  });

  test('a Graphics shape renders inside a Geometry stencil clip', async ctx => {
    const backend = await setupBackend(ctx);
    const root = new Container();
    const clipped = new Container();
    const graphics = new Graphics();

    try {
      graphics.fillColor = Color.red;
      graphics.drawRectangle(0, 0, 48, 48);
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(graphics);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Inside the triangle: the filled rectangle survives.
      expectPixelNear(readPixel(6, 6), [255, 0, 0, 255]);
      // Outside the triangle: clipped to the black clear.
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      backend.destroy();
    }
  });

  test('a Mesh stencil clip composes with a scissor rect (intersection)', async ctx => {
    const backend = await setupBackend(ctx);
    const root = new Container();
    const clipped = new Container();
    const mesh = createQuadMesh(64, Color.red);

    try {
      // Stencil: left half. Scissor (mask Rectangle): top half. Both restrict.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 32, 64);
      clipped.mask = new Rectangle(0, 0, 64, 32);
      clipped.addChild(mesh);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Top-left: inside both.
      expectPixelNear(readPixel(12, 12), [255, 0, 0, 255]);
      // Bottom-left: inside stencil, outside scissor.
      expectPixelNear(readPixel(12, 48), [0, 0, 0, 255]);
      // Top-right: inside scissor, outside stencil.
      expectPixelNear(readPixel(48, 12), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      backend.destroy();
    }
  });

  test('a custom-material Mesh renders inside a Geometry stencil clip', async ctx => {
    const backend = await setupBackend(ctx);
    const root = new Container();
    const clipped = new Container();
    const material = new MeshMaterial({ shader: new ShaderSource({ wgsl: customMeshWgsl }) });
    const mesh = new Mesh({
      vertices: new Float32Array([0, 0, 48, 0, 48, 48, 0, 0, 48, 48, 0, 48]),
      material,
    });

    try {
      mesh.tint = Color.red;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(mesh);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Inside the triangle (x + y << 48): the red custom-material mesh survives.
      expectPixelNear(readPixel(6, 6), [255, 0, 0, 255]);
      // Outside the triangle (x + y >> 48): clipped to the black clear.
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      material.destroy();
      backend.destroy();
    }
  });

  test('a custom-material Mesh stencil clip composes with a scissor rect (intersection)', async ctx => {
    const backend = await setupBackend(ctx);
    const root = new Container();
    const clipped = new Container();
    const material = new MeshMaterial({ shader: new ShaderSource({ wgsl: customMeshWgsl }) });
    const mesh = new Mesh({
      vertices: new Float32Array([0, 0, 64, 0, 64, 64, 0, 0, 64, 64, 0, 64]),
      material,
    });

    try {
      mesh.tint = Color.red;
      // Stencil: left half. Scissor (mask Rectangle): top half. Both restrict.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 32, 64);
      clipped.mask = new Rectangle(0, 0, 64, 32);
      clipped.addChild(mesh);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Top-left: inside both.
      expectPixelNear(readPixel(12, 12), [255, 0, 0, 255]);
      // Bottom-left: inside stencil, outside scissor.
      expectPixelNear(readPixel(12, 48), [0, 0, 0, 255]);
      // Top-right: inside scissor, outside stencil.
      expectPixelNear(readPixel(48, 12), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      material.destroy();
      backend.destroy();
    }
  });

  test('a custom-material Mesh renders only the intersection under nested clips', async ctx => {
    const backend = await setupBackend(ctx);
    const root = new Container();
    const outer = new Container();
    const inner = new Container();
    const material = new MeshMaterial({ shader: new ShaderSource({ wgsl: customMeshWgsl }) });
    const mesh = new Mesh({
      vertices: new Float32Array([0, 0, 64, 0, 64, 64, 0, 0, 64, 64, 0, 64]),
      material,
    });

    try {
      mesh.tint = Color.red;
      // Outer clip: left half. Inner clip: top half. Only the intersection draws.
      outer.clip = true;
      outer.clipShape = createQuadGeometry(0, 0, 32, 64);
      inner.clip = true;
      inner.clipShape = createQuadGeometry(0, 0, 64, 32);
      inner.addChild(mesh);
      outer.addChild(inner);
      root.addChild(outer);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Intersection (top-left quadrant): visible.
      expectPixelNear(readPixel(12, 12), [255, 0, 0, 255]);
      // Only outer (bottom-left): clipped by inner.
      expectPixelNear(readPixel(12, 48), [0, 0, 0, 255]);
      // Only inner (top-right): clipped by outer.
      expectPixelNear(readPixel(48, 12), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (outer.clipShape as Geometry).destroy();
      (inner.clipShape as Geometry).destroy();
      material.destroy();
      backend.destroy();
    }
  });

  test('a custom-material Sprite renders inside a Geometry stencil clip', async ctx => {
    const backend = await setupBackend(ctx);
    const root = new Container();
    const clipped = new Container();
    const material = new SpriteMaterial({
      shader: new ShaderSource({ wgsl: customSpriteWgsl }),
      uniforms: { color: [1, 0, 0, 1] },
    });
    const sprite = new Sprite(Texture.white);

    try {
      sprite.material = material;
      sprite.setPosition(0, 0);
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Inside the triangle (x + y << 48): the red custom-material sprite survives.
      expectPixelNear(readPixel(6, 6), [255, 0, 0, 255]);
      // Outside the triangle (x + y >> 48): clipped to the black clear.
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      material.destroy();
      backend.destroy();
    }
  });

  test('root Geometry clip is correct at pixelRatio > 1 (physical-sized stencil attachment)', async ctx => {
    // Logical render target 32×32, physical canvas 64×64 → pixelRatio 2. Before the
    // physical-sizing fix the root stencil attachment (logical 32) mismatched the
    // physical colour attachment (64) and the clip pass raised a validation error.
    const backend = await setupBackend(ctx, 32);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 32;
      sprite.height = 32;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(32);
      clipped.addChild(sprite);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // A physical pixel (px, py) maps to logical (px / 2). Triangle inside:
      // logical x + y < 32 ⇒ physical px + py < 64.
      expectPixelNear(readPixel(10, 10), [255, 0, 0, 255]); // logical (5, 5): inside
      expectPixelNear(readPixel(54, 54), [0, 0, 0, 255]); // logical (27, 27): outside
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a BitmapText renders inside a Geometry stencil clip', async ctx => {
    const backend = await setupBackend(ctx);
    const root = new Container();
    const clipped = new Container();
    const { text, texture } = createSolidBitmapText('#ff0000', 64);

    try {
      text.setPosition(0, 0);
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(text);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Inside the triangle (x + y << 48): the red glyph survives.
      expectPixelNear(readPixel(6, 6), [255, 0, 0, 255]);
      // Outside the triangle (x + y >> 48): clipped to the black clear.
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a ParticleSystem renders inside a Geometry stencil clip', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ffffff', 16);
    const root = new Container();
    const clipped = new Container();
    const system = new ParticleSystem(texture);
    const slot = system.spawn();

    try {
      // Deterministic single particle: a solid white texture tinted red, scaled
      // to blanket the whole 64×64 canvas (local quad ±64 around the centre) so
      // only the stencil clip — not the particle bounds — decides visibility.
      system.posX[slot] = 64;
      system.posY[slot] = 64;
      system.scaleX[slot] = 16;
      system.scaleY[slot] = 16;
      system.rotations[slot] = 0;
      system.color[slot] = Color.red.toRgba();
      system.lifetime[slot] = 1;

      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(system);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Inside the triangle (x + y << 48): the red particle survives.
      expectPixelNear(readPixel(6, 6), [255, 0, 0, 255]);
      // Outside the triangle (x + y >> 48): clipped to the black clear.
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('an alpha mask composites correctly under a Geometry stencil clip', async ctx => {
    // RenderEffectExecutor pushes the Geometry clip outermost, so the mask
    // compositor draws into the stencil-enabled pass. Without a stencil pipeline
    // variant on the compositor this raised a WebGPU validation error.
    const backend = await setupBackend(ctx);
    const contentTexture = createSolidTexture('#ff0000');
    const maskTexture = createSolidTexture('#ffffff');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(contentTexture);
    const maskSprite = new Sprite(maskTexture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 64;
      sprite.height = 64;
      // Alpha mask: opaque over the left half only (transparent elsewhere).
      maskSprite.setPosition(0, 0);
      maskSprite.width = 32;
      maskSprite.height = 64;
      // Stencil clip: top half. With the left-half mask, only the top-left
      // quadrant survives.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 64, 32);
      clipped.mask = maskSprite;
      clipped.addChild(sprite);
      root.addChild(clipped);

      await renderClipped(ctx, backend, root);

      const readPixel = readCanvas(backend);

      // Top-left: inside the clip and the mask is opaque → red survives.
      expectPixelNear(readPixel(12, 12), [255, 0, 0, 255]);
      // Top-right: inside the clip but mask alpha 0 → composited away to black.
      expectPixelNear(readPixel(48, 12), [0, 0, 0, 255]);
      // Bottom-left: outside the stencil clip → black.
      expectPixelNear(readPixel(12, 48), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      maskSprite.destroy();
      (clipped.clipShape as Geometry).destroy();
      contentTexture.destroy();
      maskTexture.destroy();
      backend.destroy();
    }
  });
});
