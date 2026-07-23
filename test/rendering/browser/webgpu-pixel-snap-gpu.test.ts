/**
 * WebGPU GPU-side position pixel-snapping browser tests (spec D3-D5).
 *
 * Task 5 moved position snapping out of the CPU upload seam and into the WGSL
 * vertex stages: the transform row now carries the RAW world transform plus a
 * snap-mode flag (`slot.m1.z`), and the sprite shader snaps the device-pixel
 * origin itself using the projection UBO's staged `viewport` rect. Mirror of
 * `webgl2-pixel-snap-gpu.test.ts` case-for-case.
 *
 * Discriminator note: the WebGL2 twin uses MSAA so a fractional edge shows as
 * a partially-covered boundary column. The WebGPU backend has no multisample
 * path, and without AA a solid quad's coverage under the pixel-centre rule is
 * identical for snapped and unsnapped origins (rounding the origin never moves
 * an edge across a pixel centre). These specs discriminate through LINEAR
 * texture filtering instead: with a half-red/half-blue texture, a snapped quad
 * places every pixel centre exactly on a texel centre (pure colours on both
 * sides of the colour boundary), while an unsnapped fractional quad samples
 * between texels and blends the boundary column. Same intent, single-sample.
 *
 * Case 2 needs no such trick — it is a parity assert between the retained and
 * immediate render paths under a fractional camera pan, proving the shader
 * snaps the COMPOSED (group · local) device origin, not the group-local one.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { PixelSnapMode } from '#rendering/pixelSnap';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

/**
 * A `size`×`size` quadrant texture: top-left red, top-right blue, bottom-left
 * blue, bottom-right red. Both internal colour boundaries sit at texel
 * `size / 2`, so a snapped quad shows them as hard single-texel transitions
 * while a fractionally-placed unsnapped quad blends them (linear filtering).
 */
const createQuadrantTexture = (size: number): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;
  const half = size / 2;

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, half, half);
  ctx.fillRect(half, half, half, half);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(half, 0, half, half);
  ctx.fillRect(0, half, half, half);

  return new Texture(src);
};

/** A `size`×`size` solid-colour texture. */
const createSolidTexture = (color: string, size: number): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

// On the software (swiftshader) adapter the WebGPU device can be dropped
// mid-test. Treat that as an unavailable-adapter skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a scene inside a validation error scope.
// Returns false when the device dropped mid-test (caller should bail).
const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

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

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

// Read the presented WebGPU canvas back through a 2D canvas.
const snapshotCanvas = (backend: WebGpuBackend): CanvasRenderingContext2D => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d')!;

  ctx.drawImage(source, 0, 0);

  return ctx;
};

const readPixelFrom = (ctx: CanvasRenderingContext2D, x: number, y: number): RgbaTuple => {
  const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

  return [data[0], data[1], data[2], data[3]];
};

// ---------------------------------------------------------------------------
// Case 1: Position snap lands the origin on an integer device pixel — every
// pixel centre samples exactly a texel centre, so the texture's internal
// colour boundaries are hard single-pixel transitions even at a fractional
// position.
// ---------------------------------------------------------------------------

describe('WebGPU GPU pixel snapping — Sprite position mode', () => {
  test('Case 1: a fractional Position sprite samples texel centres exactly (hard colour boundary)', async ctx => {
    const backend = await setupBackend();
    const texture = createQuadrantTexture(10);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      // World origin (20.4, 20.6) snaps (round) to device (20, 21) top-left.
      sprite.setPosition(20.4, 20.6);
      sprite.pixelSnapMode = PixelSnapMode.Position;
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const pixels = snapshotCanvas(backend);

      // Horizontal colour boundary at world x = 20 + 5 = 25 (top half): column
      // 24 samples texel (4.5, 2.5) → pure red, column 25 samples (5.5, 2.5)
      // → pure blue. No blended column between them.
      expect(readPixelFrom(pixels, 24, 23)[0]).toBeGreaterThan(240); // pure red
      expect(readPixelFrom(pixels, 24, 23)[2]).toBeLessThan(16);
      expect(readPixelFrom(pixels, 25, 23)[2]).toBeGreaterThan(240); // pure blue
      expect(readPixelFrom(pixels, 25, 23)[0]).toBeLessThan(16);

      // Vertical colour boundary at world y = 21 + 5 = 26 (left half): row 25
      // pure red, row 26 pure blue.
      expect(readPixelFrom(pixels, 22, 25)[0]).toBeGreaterThan(240);
      expect(readPixelFrom(pixels, 22, 26)[2]).toBeGreaterThan(240);

      // Render-only: logical position untouched.
      expect(sprite.x).toBe(20.4);
      expect(sprite.y).toBe(20.6);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Case 1b: a CUSTOM SpriteMaterial snaps identically. A custom material owns
  // only the fragment stage; the engine prepends `spriteVertexWgsl`, which runs
  // the same origin snap. Before that snap block was ported into the custom
  // vertex module (and `viewport` added to its ProjectionUniforms), custom-
  // material sprites silently lost position snapping once the CPU seam was
  // deleted — this pins the regression on the WebGPU side.
  // -------------------------------------------------------------------------
  test('Case 1b: a custom-material Position sprite snaps identically to the default path', async ctx => {
    const backend = await setupBackend();
    const texture = createQuadrantTexture(10);
    // Fragment samples the base texture straight through, so the internal colour
    // boundary is the same as Case 1 — only the vertex path (custom module vs
    // built-in) differs.
    const material = new SpriteMaterial({
      shader: new ShaderSource({
        wgsl: `
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return textureSample(u_texture, u_sampler, input.texcoord);
}
`.trim(),
      }),
    });
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.material = material;
      sprite.setPosition(20.4, 20.6);
      sprite.pixelSnapMode = PixelSnapMode.Position;
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const pixels = snapshotCanvas(backend);

      // Same hard colour-boundary assertions as Case 1: origin snapped so pixel
      // centres sample texel centres exactly.
      expect(readPixelFrom(pixels, 24, 23)[0]).toBeGreaterThan(240); // pure red
      expect(readPixelFrom(pixels, 25, 23)[2]).toBeGreaterThan(240); // pure blue
      expect(readPixelFrom(pixels, 22, 25)[0]).toBeGreaterThan(240);
      expect(readPixelFrom(pixels, 22, 26)[2]).toBeGreaterThan(240);
    } finally {
      root.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Case 4: Geometry mode under a FRACTIONAL zoom — the reason geometry snap
  // exists. Position snap alone lands the ORIGIN on a device pixel but leaves
  // the far quad edge at a fractional device coordinate (device width =
  // 10 · 1.25 = 12.5 px), so under WebGPU's single-sample rasterizer (no MSAA
  // path) the quad covers only floor(12.5) = 12 whole columns — its right edge
  // sits on a pixel centre and the top-left fill rule drops that column.
  // Geometry additionally rounds each local quad corner to the device grid IN
  // THE VERTEX SHADER, so the far edge lands on a whole device pixel and the
  // quad covers exactly round(12.5) = 13 columns. The contiguous run of fully
  // covered columns therefore equals the snapped device width — one column
  // wider than position snap alone, the discriminator that flips this RED→GREEN.
  // -------------------------------------------------------------------------
  test('Case 4: a fractional Geometry sprite snaps its quad edges under fractional zoom', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 10);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      const zoom = 1.25; // non-integer scale: geometry snap must round edges to device px
      const snappedWidth = Math.round(10 * zoom); // 13 device px — the geometry-snapped quad width

      backend.view.setZoom(zoom);
      sprite.setPosition(20.4, 20.6);
      sprite.pixelSnapMode = PixelSnapMode.Geometry;
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const pixels = snapshotCanvas(backend);

      // Longest contiguous run of fully covered (red) columns along the row.
      let longestRun = 0;
      let run = 0;

      for (let x = 0; x < canvasSize; x++) {
        if (readPixelFrom(pixels, x, 26)[0] > 240) {
          run += 1;
          longestRun = Math.max(longestRun, run);
        } else {
          run = 0;
        }
      }

      // Geometry snapped both quad edges to the device grid, so the covered span
      // is exactly the snapped device width. Position snap alone would cover one
      // fewer column (fractional far edge dropped by the top-left fill rule).
      expect(longestRun).toBe(snappedWidth);

      // Render-only: logical position untouched.
      expect(sprite.x).toBe(20.4);
      expect(sprite.y).toBe(20.6);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Case 3: the control. With snapping OFF the same scene samples BETWEEN
  // texel centres, so the colour boundary column is a red/blue blend — proving
  // the snap branch is gated on the row flag (same position, opposite outcome).
  // -------------------------------------------------------------------------
  test('Case 3: PixelSnapMode.None leaves the colour boundary blended (flag-gated)', async ctx => {
    const backend = await setupBackend();
    const texture = createQuadrantTexture(10);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(20.4, 20.6);
      sprite.pixelSnapMode = PixelSnapMode.None;
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const pixels = snapshotCanvas(backend);

      // Unsnapped origin x = 20.4: column 25's centre lands at local 5.1 →
      // a 40 % red / 60 % blue mix at the boundary. Under Case 1 (snapped)
      // the very same pixel reads pure blue, so this partial value is the
      // proof the flag gates the shader's snap branch.
      const boundary = readPixelFrom(pixels, 25, 23);

      expect(boundary[0]).toBeGreaterThan(16); // red bleeds in → not pure blue
      expect(boundary[0]).toBeLessThan(240); // not pure red either
      expect(boundary[2]).toBeGreaterThan(16); // blue present → a genuine blend
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Case 5: NineSlice geometry snap under a FRACTIONAL zoom. NineSlice is the
// first renderer with INTERNAL shared edges, so the seam guarantee is load-
// bearing: the pure `snapBoundary` moves both neighbours of a shared edge
// identically, keeping the covered span contiguous (no gap/overlap). Under the
// single-sample rasterizer we discriminate through covered WIDTH, mirroring the
// sprite Case 4 pattern but position-independently: with the origin snapped to
// an integer device pixel and the 42-local panel spanning 52.5 device px, POSITION
// snap alone leaves the far edge fractional and the fill rule covers 52 columns,
// while GEOMETRY snap rounds the far edge out to a whole pixel and covers exactly
// one more (53). Without the shader boundary block geometry would behave exactly
// like position (RED: equal runs). A crack at an internal seam (were `snapBoundary`
// impure) would split the run below 53 and also break the +1 relation.
// ---------------------------------------------------------------------------

describe('WebGPU GPU pixel snapping — NineSlice geometry seams', () => {
  test('Case 5: a NineSlice geometry snap widens the covered span by one column vs position snap', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#00ff00', 24);
    const root = new Container();
    const panel = new NineSliceSprite(texture, { slices: 8, width: 42, height: 42 });

    try {
      backend.view.setZoom(1.25); // 42 · 1.25 = 52.5 device px: fractional far edge
      panel.setPosition(10.3, 10.7);
      root.addChild(panel);

      // Longest contiguous run of fully covered (green) columns over the panel's
      // mid-band — the row with the longest run is interior (no top/bottom edge).
      const longestGreenRun = (): number => {
        const pixels = snapshotCanvas(backend);
        let best = 0;

        for (let y = 0; y < canvasSize; y++) {
          let run = 0;

          for (let x = 0; x < canvasSize; x++) {
            if (readPixelFrom(pixels, x, y)[1] > 240) {
              run += 1;
              best = Math.max(best, run);
            } else {
              run = 0;
            }
          }
        }

        return best;
      };

      // Position snap: the origin lands on an integer device pixel but the far
      // panel edge stays at fractional 52.5 device x, dropped by the fill rule.
      panel.pixelSnapMode = PixelSnapMode.Position;

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const positionRun = longestGreenRun();

      // Geometry snap additionally rounds every quad edge (including the far
      // outer edge) to a whole device pixel, so the contiguous covered span is
      // exactly one column wider. Without the shader boundary block geometry
      // would match position (RED).
      panel.pixelSnapMode = PixelSnapMode.Geometry;

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const geometryRun = longestGreenRun();

      expect(positionRun).toBeGreaterThan(0); // the panel drew
      expect(geometryRun).toBe(positionRun + 1);

      // Render-only: logical geometry untouched.
      expect(panel.width).toBe(42);
      expect(panel.x).toBe(10.3);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Case 6: RepeatingSprite (shader strategy) geometry snap under a FRACTIONAL
// zoom. Repeating carries the destW-from-snapped-corners subtlety: the shader
// derives the tiling destination width from the SNAPPED corners, so the far edge
// snaps to a whole device pixel like NineSlice's outer edge. Mirroring Case 5's
// single-sample differential: with the origin snapped and the 42-local quad
// spanning 52.5 device px, POSITION snap leaves the far edge fractional (52
// covered columns) while GEOMETRY snap rounds it out to 53. Without the shader
// boundary block geometry would behave exactly like position (RED: equal runs).
// A bad destW derivation (raw instead of snapped corners) would also break the
// +1 relation by mis-sizing the tiled span.
// ---------------------------------------------------------------------------

describe('WebGPU GPU pixel snapping — RepeatingSprite geometry', () => {
  test('Case 6: a shader-strategy RepeatingSprite widens the covered span by one column vs position snap', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#0000ff', 8); // bare Texture → shader strategy
    const root = new Container();
    const tiled = new RepeatingSprite(texture, { width: 42, height: 42, modeX: 'repeat', modeY: 'repeat' });

    try {
      backend.view.setZoom(1.25); // 42 · 1.25 = 52.5 device px: fractional far edge
      tiled.setPosition(10.3, 10.7);
      root.addChild(tiled);

      // Longest contiguous run of fully covered (blue) columns over any row — the
      // row with the longest run is interior (no top/bottom edge).
      const longestBlueRun = (): number => {
        const pixels = snapshotCanvas(backend);
        let best = 0;

        for (let y = 0; y < canvasSize; y++) {
          let run = 0;

          for (let x = 0; x < canvasSize; x++) {
            if (readPixelFrom(pixels, x, y)[2] > 240) {
              run += 1;
              best = Math.max(best, run);
            } else {
              run = 0;
            }
          }
        }

        return best;
      };

      // Position snap: origin on an integer device pixel, far edge fractional 52.5.
      tiled.pixelSnapMode = PixelSnapMode.Position;

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const positionRun = longestBlueRun();

      // Geometry snap: the far edge rounds out to a whole device pixel (destW is
      // re-derived from the snapped corners), covering exactly one more column.
      tiled.pixelSnapMode = PixelSnapMode.Geometry;

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const geometryRun = longestBlueRun();

      expect(positionRun).toBeGreaterThan(0); // the tiled quad drew
      expect(geometryRun).toBe(positionRun + 1);

      // Render-only: logical geometry untouched.
      expect(tiled.width).toBe(42);
      expect(tiled.x).toBe(10.3);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Case 2: retained vs immediate parity under a fractional camera pan. The
// snapped origin of a group-relative sprite (group · local) must land on the
// same device pixel as the equivalent world-space immediate sprite — i.e. the
// shader snaps the COMPOSED device origin, not the group-local one.
// ---------------------------------------------------------------------------

describe('WebGPU GPU pixel snapping — retained/immediate parity', () => {
  test('Case 2: a retained group-relative snap matches the immediate world snap', async ctx => {
    // Retained scene: group at the FRACTIONAL (10.3,10.7), child at (10.1,9.9) →
    // world (20.4,20.6). The fractional group offset is what gives this case its
    // teeth: a shader that snapped the group-LOCAL origin (10.1,9.9) → (10,10)
    // and applied the group matrix afterwards would land the sprite at (20.3,20.7),
    // NOT the immediate scene's snapped (20,21). Only snapping the COMPOSED
    // (group · local) device origin matches. An integer group offset would mask
    // that difference (both paths would share the same fractional delta).
    const retainedBackend = await setupBackend();
    const retainedTexture = createSolidTexture('#00ff00', 10);
    const retainedRoot = new Container();
    const group = new RetainedContainer();
    const groupSprite = new Sprite(retainedTexture);

    // Immediate scene: single sprite directly at world (20.4,20.6).
    const immediateBackend = await setupBackend();
    const immediateTexture = createSolidTexture('#00ff00', 10);
    const immediateRoot = new Container();
    const immediateSprite = new Sprite(immediateTexture);

    try {
      group.setPosition(10.3, 10.7);
      groupSprite.setPosition(10.1, 9.9);
      groupSprite.pixelSnapMode = PixelSnapMode.Position;
      group.addChild(groupSprite);
      retainedRoot.addChild(group);

      immediateSprite.setPosition(20.4, 20.6);
      immediateSprite.pixelSnapMode = PixelSnapMode.Position;
      immediateRoot.addChild(immediateSprite);

      // Same fractional camera pan on both, once, before the assertion frames.
      retainedBackend.view.move(0.37, 0.61);
      immediateBackend.view.move(0.37, 0.61);

      // Drive the retained ladder to steady state (capture → record → splice →
      // steady); the immediate scene only needs to be drawn.
      for (let i = 0; i < 4; i++) {
        if (!(await renderScene(ctx, retainedBackend, retainedRoot))) {
          return;
        }
      }

      if (!(await renderScene(ctx, immediateBackend, immediateRoot))) {
        return;
      }

      const retainedPixels = Array.from(snapshotCanvas(retainedBackend).getImageData(10, 10, 40, 40).data);
      const immediatePixels = Array.from(snapshotCanvas(immediateBackend).getImageData(10, 10, 40, 40).data);

      // Sanity: something green actually drew (guards against an all-black parity).
      const anyGreen = retainedPixels.some((value, index) => index % 4 === 1 && value > 200);

      expect(anyGreen).toBe(true);
      expect(retainedPixels).toEqual(immediatePixels);
    } finally {
      retainedRoot.destroy();
      immediateRoot.destroy();
      retainedTexture.destroy();
      immediateTexture.destroy();
      retainedBackend.destroy();
      immediateBackend.destroy();
    }
  });
});
