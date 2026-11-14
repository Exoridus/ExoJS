/**
 * Contact-shadow probes for the lightmap renderer, shared by the WebGL2 and
 * WebGPU lanes.
 *
 * A scene is one light shining along world +x onto a wall square-on to it. The
 * probes walk that ray through the rendered picture and divide by the same
 * scene without the wall, so falloff, cone and cookie cancel and what is left
 * is the shadow term alone, measured in output pixels from the wall.
 */

import { type Light, LightmapLighting, LineLight, PointLight, PolygonOccluder, SpotLight, SunLight } from '@codexo/exojs/lighting';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import type { LightmapBackend } from '../../../packages/exojs-lighting/src/backends/LightmapBackend';
import { readWebGl2Frame, readWebGpuFrame } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';

export type ContactBackend = 'webgl2' | 'webgpu';
export type ContactLight = 'point' | 'spot' | 'line' | 'sun';

export interface ContactScene {
  readonly light: ContactLight;
  /** Output pixels per world unit. */
  readonly pixelsPerUnit: number;
  /** World units from the light to the wall. */
  readonly distance: number;
  /** Falloff radius of point, spot and line lights. */
  readonly radius: number;
  /** World-space thickness of the wall; `0` is an open segment. */
  readonly thickness?: number;
  readonly softness?: number;
  readonly intensity?: number;
  readonly rotation?: number;
  readonly lightResolution?: number;
  readonly shadowResolution?: number;
  readonly filler?: 'cpu' | 'gpu';
  /** Where the wall sits within its pixel: `0` on a pixel edge, `0.5` through pixel centres. */
  readonly offset?: number;
}

export interface ContactProfile {
  /** Where the lit/shadow transition crosses one half, in output pixels behind the wall's lit face. */
  readonly edge: number;
  /** Least shadow term between six and two pixels in front of the lit face. */
  readonly front: number;
  /** Shadow term four pixels behind the wall's far face. */
  readonly behind: number;
  /** Shadow term half a pixel in front of the lit face. */
  readonly near: number;
  /** Shadow term one and a half pixels behind the wall's far face. */
  readonly contact: number;
  /** Which filler actually drew the rows. */
  readonly filler: 'cpu' | 'gpu';
}

export const contactCanvasSize = 256;

interface ContactHost {
  readonly app: Application;
  readonly context: RenderingContext;
  render(lighting: LightmapLighting): Promise<Uint8Array | Uint8ClampedArray | null>;
  destroy(): void;
}

const createHost = async (kind: ContactBackend): Promise<ContactHost> => {
  const size = contactCanvasSize;
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const options = {
    clearColor: Color.black,
    canvas: { width: size, height: size, pixelRatio: 1 },
    rendering: {
      debug: false,
      webglAttributes: { antialias: false, preserveDrawingBuffer: true, stencil: false, depth: false },
      spriteRendererBatchSize: 1024,
    },
  };
  const frameTexture = new RenderTexture(size, size);
  const onResize = new Signal<[number, number, Application]>();
  const framePasses = new RenderPipeline();
  const app = { canvas, options, framePasses, frameTexture, onResize, width: size, height: size } as unknown as Application;
  const backend = kind === 'webgl2' ? new WebGl2Backend(app) : new WebGpuBackend(app);

  await backend.initialize();
  wireCoreRenderers(backend, options.rendering);

  const context = new RenderingContext(backend);

  (app as unknown as { rendering: RenderingContext }).rendering = context;

  const white = new Sprite(Texture.fromColor(Color.white, 1));

  white.width = size;
  white.height = size;

  return {
    app,
    context,
    render: async (lighting: LightmapLighting): Promise<Uint8Array | Uint8ClampedArray | null> => {
      // The frame is drawn in screen space, whatever the camera is doing.
      const view = context.view;

      context.view = new View(size / 2, size / 2, size, size);
      context.renderTo(white, { target: frameTexture, clear: Color.black });
      context.view = view;

      if (backend instanceof WebGpuBackend) {
        backend.device.pushErrorScope('validation');
      }

      try {
        lighting.update();
        backend.clear(Color.black);
        framePasses.execute(context);
        backend.flush();
      } catch (error) {
        if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
          return null;
        }

        throw error;
      }

      if (backend instanceof WebGpuBackend) {
        const validation = await backend.device.popErrorScope();

        if (validation !== null) {
          throw new Error(`WebGPU validation: ${validation.message}`);
        }

        await backend.device.queue.onSubmittedWorkDone();

        return readWebGpuFrame(backend, size);
      }

      return readWebGl2Frame(backend as WebGl2Backend, size);
    },
    destroy: (): void => {
      white.destroy();
      framePasses.destroy();
      frameTexture.destroy();
      onResize.destroy();
      context.destroy();
      backend.destroy();
    },
  };
};

const createLight = (scene: ContactScene): Light => {
  const softness = scene.softness ?? 0;
  const intensity = scene.intensity ?? 1;

  switch (scene.light) {
    case 'point':
      return new PointLight({ radius: scene.radius, intensity, softness });
    case 'spot':
      return new SpotLight({ radius: scene.radius, angle: 60, coneSoftness: 0, intensity, softness });
    case 'line': {
      // Across the ray, so the segment's half-length lengthens the reach the
      // shadow row is normalized by without moving the wall off its axis.
      const light = new LineLight({ radius: scene.radius, length: scene.radius / 2, intensity, softness });

      light.rotation = 90;

      return light;
    }
    case 'sun':
      return new SunLight({ intensity, softness });
  }
};

/**
 * Render `scene` with and without its wall and measure the shadow term along
 * the light's axis. `null` when the backend dropped the device.
 */
export const measureContact = async (kind: ContactBackend, scene: ContactScene): Promise<ContactProfile | null> => {
  const host = await createHost(kind);
  const size = contactCanvasSize;
  const unit = 1 / scene.pixelsPerUnit;
  const worldSize = size * unit;
  // The wall sits right of centre and the light `distance` to its left, so the
  // probe window behind the wall stays inside the view at every scale.
  const wallX = worldSize * 0.625 + (scene.offset ?? 0) * unit;
  const lightX = wallX - scene.distance;
  // Off the pixel grid across the axis, so every probe reads one pixel rather
  // than a boundary two of them share.
  const axisY = worldSize / 2 + 0.37 * unit;
  const view = new View(worldSize / 2, worldSize / 2, worldSize, worldSize);

  view.rotation = scene.rotation ?? 0;
  host.context.view = view;

  const lighting = new LightmapLighting(host.app, {
    ambient: Color.black,
    lightResolution: scene.lightResolution ?? 1,
    shadowResolution: scene.shadowResolution ?? 256,
  });
  const backend = lighting.backend as LightmapBackend;

  backend.shadowFiller = scene.filler ?? 'cpu';
  lighting.add(createLight(scene)).setPosition(lightX, axisY);

  try {
    const open = await host.render(lighting);
    const thickness = scene.thickness ?? 0;
    const top = axisY - worldSize;
    const bottom = axisY + worldSize;

    lighting.occludeFrom(
      thickness > 0
        ? new PolygonOccluder([
            { x: wallX, y: top },
            { x: wallX + thickness, y: top },
            { x: wallX + thickness, y: bottom },
            { x: wallX, y: bottom },
          ])
        : new PolygonOccluder(
            [
              { x: wallX, y: top },
              { x: wallX, y: bottom },
            ],
            { closed: false },
          ),
    );

    const walled = await host.render(lighting);

    if (open === null || walled === null) {
      return null;
    }

    /** The shadow term at a world point on the axis, from the pixel under it. */
    const term = (worldX: number): number => {
      const screen = view.worldToScreen(worldX, axisY, size, size);
      const px = Math.min(size - 1, Math.max(0, Math.floor(screen.x)));
      const py = Math.min(size - 1, Math.max(0, Math.floor(screen.y)));
      const offset = (py * size + px) * 4;
      const reference = open[offset]!;

      return reference < 24 ? Number.NaN : walled[offset]! / reference;
    };

    let edge = Number.POSITIVE_INFINITY;
    let previous = term(wallX - 6 * unit);

    for (let step = -23; step <= 96; step++) {
      const along = step / 4;
      const value = term(wallX + along * unit);

      if (value < 0.5) {
        edge = previous >= 0.5 ? along - 0.25 * ((0.5 - value) / Math.max(1e-6, previous - value)) : along;

        break;
      }

      previous = value;
    }

    let front = 1;

    for (let step = -24; step <= -8; step++) {
      front = Math.min(front, term(wallX + (step / 4) * unit));
    }

    return {
      edge,
      front,
      behind: term(wallX + thickness + 4 * unit),
      near: term(wallX - 0.5 * unit),
      contact: term(wallX + thickness + 1.5 * unit),
      filler: backend.shadowFiller,
    };
  } finally {
    lighting.destroy();
    host.destroy();
  }
};
