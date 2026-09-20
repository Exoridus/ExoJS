/**
 * The transport walk over a mask a real frame rasterised, on WebGPU - the same
 * scene and the same expectations the WebGL2 spec runs, against the WGSL half
 * of the chunk, whose render targets store their rows the other way.
 *
 * Run via:  pnpm test:browser:webgpu
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
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { makeTestApp, makeTestCanvas, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { checkMaskTrace, createMaskScene } from './_transportMaskScene';
import { PROBE_CLEAR, PROBE_MASK_HIT, PROBE_TRANSMITTANCE, probeTables, probeUniforms, probeWgslSource } from './_transportProbe';

const canvasSize = 128;

const probeShader = createFilterShader({ wgsl: probeWgslSource, uniforms: probeUniforms });

interface Host {
  readonly backend: WebGpuBackend;
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

  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

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

describe('the transport walk over a rasterised drawable (WebGPU)', () => {
  test('a drawable occluder stops the walk where it stands', async ctx => {
    const host = await createHost();
    const scene = createMaskScene(host.app, canvasSize);
    const tables = probeTables([], []);
    const texture = coverTexture();
    const filter = ShaderFilter.from(probeShader, {
      textures: {
        uSegments: tables.segments,
        uEmitters: tables.emitters,
        uCells: tables.cells,
        uIndices: tables.indices,
        uMask: scene.mask,
        uMaskCoarse: scene.blocks.texture,
      },
    });
    const root = new Container();
    const sprite = new Sprite(texture);

    sprite.filters = [filter];
    root.addChild(sprite);

    try {
      // The frame that rasterises the mask and reduces the block level. Read
      // back afterwards without running the pipeline again, so both targets
      // still hold what this frame put in them.
      scene.lighting.update();
      scene.sync();
      host.backend.clear(Color.black);
      host.app.framePasses.execute(host.context);
      host.backend.flush();

      const bindings = scene.bindings();

      expect(bindings.cells[0], 'the mask was rasterised').toBeGreaterThan(1);
      expect(bindings.blocks[0], 'the block level follows it').toBeGreaterThan(1);

      filter.uniforms.uGridOrigin.set(tables.originX, tables.originY);
      filter.uniforms.uGridCells.set(tables.gridWidth, tables.gridHeight);
      filter.uniforms.uCellSize.set(tables.cellSize);
      filter.uniforms.uTableWidth.set(256);
      filter.uniforms.uScale.set(1);
      filter.uniforms.uMaskCells.set(bindings.cells[0], bindings.cells[1]);
      filter.uniforms.uMaskBasis.set(bindings.basis[0], bindings.basis[1], bindings.basis[2], bindings.basis[3]);
      filter.uniforms.uMaskOffset.set(bindings.offset[0], bindings.offset[1]);

      for (const trace of scene.traces) {
        const readings: number[][] = [];

        filter.uniforms.uA.set(trace.stretch[0], trace.stretch[1]);
        filter.uniforms.uB.set(trace.stretch[2], trace.stretch[3]);

        for (const [blocks, mode] of [
          [bindings.blocks, PROBE_MASK_HIT],
          [bindings.blocks, PROBE_TRANSMITTANCE],
          [[0, 0] as const, PROBE_MASK_HIT],
        ] as const) {
          filter.uniforms.uMaskBlocks.set(blocks[0]!, blocks[1]!);
          filter.uniforms.uMode.set(mode);

          if (!(await renderWebGpuOnce(ctx, host.backend, root, PROBE_CLEAR))) return;

          readings.push([...readWebGpuPixels(host.backend, canvasSize)(canvasSize / 2, canvasSize / 2)]);
        }

        checkMaskTrace(trace, readings[0]!, readings[1]!, readings[2]!);
      }
    } finally {
      root.destroy();
      filter.destroy();
      texture.destroy();
      tables.destroy();
      scene.destroy();
      host.destroy();
    }
  });
});
