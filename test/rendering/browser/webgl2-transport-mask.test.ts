/**
 * The transport walk over a mask a real frame rasterised, on WebGL2.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { Container } from '#rendering/Container';
import { createFilterShader, ShaderFilter } from '#rendering/filters/ShaderFilter';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { makeTestApp, makeTestCanvas, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { checkMaskTrace, createMaskScene } from './_transportMaskScene';
import { PROBE_CLEAR, PROBE_EXHAUSTED, PROBE_MASK_HIT, PROBE_TRANSMITTANCE, probeFragmentSource, probeUniforms } from './_transportProbe';

const canvasSize = 128;

const probeShader = createFilterShader({ glsl: { fragment: probeFragmentSource }, uniforms: probeUniforms });

interface Host {
  readonly backend: WebGl2Backend;
  readonly context: RenderingContext;
  readonly app: Application;
  destroy(): void;
}

const createHost = async (): Promise<Host> => {
  const app = makeTestApp(makeTestCanvas(canvasSize), canvasSize);
  const frameTexture = new RenderTexture(canvasSize, canvasSize);
  const onResize = new Signal<[number, number, Application]>();
  const framePasses = new RenderPipeline();

  Object.assign(app, { framePasses, frameTexture, onResize, width: canvasSize, height: canvasSize });

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  const context = new RenderingContext(backend);

  context.view = new View(canvasSize / 2, canvasSize / 2, canvasSize, canvasSize);
  Object.assign(app, { rendering: context });

  return {
    backend,
    context,
    app,
    destroy: (): void => {
      framePasses.destroy();
      frameTexture.destroy();
      onResize.destroy();
      context.destroy();
      backend.destroy();
    },
  };
};

/** A canvas-sized white texture, so the probe filter covers the whole frame. */
const coverTexture = (): Texture => Texture.fromColor(Color.white, canvasSize);

describe('the transport walk over what a frame built (WebGL2)', () => {
  test('a drawable stops the walk where it stands and an outline stops it where it runs', async () => {
    const host = await createHost();
    const scene = createMaskScene(host.app, canvasSize);
    const texture = coverTexture();
    const root = new Container();
    const sprite = new Sprite(texture);

    root.addChild(sprite);

    let filter: ShaderFilter<typeof probeUniforms> | null = null;

    try {
      // The frame that rasterises the mask, reduces the block level and
      // uploads the tables. Read back afterwards without running the pipeline
      // again, so all of it still holds what this frame put in it. The probe
      // is built after it, because a table that grew this frame is a new
      // texture.
      scene.lighting.update();
      host.backend.clear(Color.black);
      host.app.framePasses.execute(host.context);
      host.backend.flush();

      const bindings = scene.bindings();

      expect(bindings.cells[0], 'the mask was rasterised').toBeGreaterThan(1);
      expect(bindings.blocks[0], 'the block level follows it').toBeGreaterThan(1);
      expect(bindings.superblocks[0], 'the superblock level follows it').toBeGreaterThan(1);
      expect(bindings.gridCells[0], 'the tables were built').toBeGreaterThan(1);

      filter = ShaderFilter.from(probeShader, { textures: scene.textures() });
      sprite.filters = [filter];

      filter.uniforms.uGridOrigin.set(bindings.gridOrigin[0], bindings.gridOrigin[1]);
      filter.uniforms.uGridCells.set(bindings.gridCells[0], bindings.gridCells[1]);
      filter.uniforms.uCellSize.set(bindings.cellSize);
      filter.uniforms.uTableWidth.set(256);
      filter.uniforms.uScale.set(1);
      filter.uniforms.uMaskCells.set(bindings.cells[0], bindings.cells[1]);
      filter.uniforms.uMaskBasis.set(bindings.basis[0], bindings.basis[1], bindings.basis[2], bindings.basis[3]);
      filter.uniforms.uMaskOffset.set(bindings.offset[0], bindings.offset[1]);
      filter.uniforms.uMaskSuperblocks.set(bindings.superblocks[0], bindings.superblocks[1]);

      for (const trace of scene.traces) {
        const readings: number[][] = [];

        filter.uniforms.uA.set(trace.stretch[0], trace.stretch[1]);
        filter.uniforms.uB.set(trace.stretch[2], trace.stretch[3]);

        for (const [blocks, mode] of [
          [bindings.blocks, PROBE_MASK_HIT],
          [bindings.blocks, PROBE_TRANSMITTANCE],
          [[0, 0] as const, PROBE_MASK_HIT],
          [bindings.blocks, PROBE_EXHAUSTED],
        ] as const) {
          filter.uniforms.uMaskBlocks.set(blocks[0]!, blocks[1]!);
          filter.uniforms.uMaskSuperblocks.set(blocks[0] === 0 ? 0 : bindings.superblocks[0], blocks[1] === 0 ? 0 : bindings.superblocks[1]);
          filter.uniforms.uMode.set(mode);
          renderWebGl2Once(host.backend, root, PROBE_CLEAR);
          readings.push([...readWebGl2Pixel(host.backend, canvasSize / 2, canvasSize / 2)]);
        }

        expect(readings[3]![0], `${trace.name}: the walk ran out of its budget`).toBe(0);
        checkMaskTrace(trace, readings[0]!, readings[1]!, readings[2]!);
      }
    } finally {
      root.destroy();
      filter?.destroy();
      texture.destroy();
      scene.destroy();
      host.destroy();
    }
  });
});
