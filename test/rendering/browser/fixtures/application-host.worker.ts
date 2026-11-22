/**
 * An entire application, hosted in a dedicated worker on a transferred
 * `OffscreenCanvas`.
 *
 * Written as the shortest honest version of the worker-hosted startup
 * sequence: take the surface the host transferred, build the adapter for a
 * realm with no document, construct the application on both, and let the host
 * feed it the input the worker cannot observe for itself.
 */

// Must precede every engine import: ESM evaluates modules in import order, and
// the engine reads these build flags while its own modules initialise. The
// browser projects install them for the page through a setup file, which a
// worker realm never runs - and where the pre-bundler resolved an engine module
// through `package.json#imports`, Vite's `define` did not reach it either.
import './worker-dev-global';
import './application-host.progress';

import { Application, ApplicationState } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { OffscreenPlatform } from '#platform/OffscreenPlatform';
import { Container } from '#rendering/Container';
import type { RenderingContext } from '#rendering/RenderingContext';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { progress, traceWebGl2Contexts } from './application-host.progress';

export type SceneMode = 'fail-load' | 'abort-load' | 'fail-unload';

interface InitMessage {
  readonly kind: 'init';
  readonly surface: OffscreenCanvas;
  readonly size: number;
  readonly sceneMode?: SceneMode;
}

interface PointerMessage {
  readonly kind: 'pointer';
  readonly clientX: number;
  readonly clientY: number;
}

interface FramesMessage {
  readonly kind: 'frames';
  readonly count: number;
}

interface ShutdownMessage {
  readonly kind: 'shutdown';
}

type HostMessage = InitMessage | PointerMessage | FramesMessage | ShutdownMessage;

const red = (edge: number): OffscreenCanvas => {
  const canvas = new OffscreenCanvas(edge, edge);
  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('No 2D context in this worker.');
  }

  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, edge, edge);

  return canvas;
};

class WorkerScene extends Scene {
  private readonly _content = new Container();

  public override load(): void | Promise<void> {
    if (sceneMode === 'fail-load') {
      throw new Error('Worker scene load failed');
    }

    if (sceneMode === 'abort-load') {
      return new Promise<void>(resolve => {
        this.lifecycleSignal.addEventListener(
          'abort',
          () => {
            loadAborted = true;
            resolve();
          },
          { once: true },
        );
        self.postMessage({ kind: 'loading' });
      });
    }

    const sprite = new Sprite(new Texture(red(16)));

    sprite.setPosition(8, 8);
    this._content.addChild(sprite);
  }

  public override draw(context: RenderingContext): void {
    this._content.render(context.backend);
  }

  public override unload(): void {
    unloads++;
    this._content.destroy();

    if (sceneMode === 'fail-unload') {
      throw new Error('Worker scene unload failed');
    }
  }
}

/**
 * Whether this realm schedules display frames at all. A dedicated worker
 * generally does not, which is why the adapter carries a timer fallback.
 */
const realmSchedulesFrames = typeof (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame === 'function';

let app: Application | null = null;
let platform: OffscreenPlatform | null = null;
let pointerPositions: Array<{ x: number; y: number }> = [];
let sceneMode: SceneMode | undefined;
let closing = false;
let loadAborted = false;
let unloads = 0;

/** Read the frame straight out of the worker's own GL context, top-left indexed. */
const readFrame = (application: Application, size: number): Uint8Array => {
  const gl = (application.backend as WebGl2Backend).context;
  const flipped = new Uint8Array(size * size * 4);

  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, flipped);

  const out = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const source = (size - 1 - y) * size * 4;

    out.set(flipped.subarray(source, source + size * 4), y * size * 4);
  }

  return out;
};

const initialize = async (message: InitMessage): Promise<void> => {
  progress('init', 'start');
  const restoreGetContext = traceWebGl2Contexts();
  sceneMode = message.sceneMode;

  try {
    progress('application-construction', 'start');
    platform = new OffscreenPlatform(message.surface);

    const application = new Application({
      platform,
      hello: false,
      clearColor: Color.black,
      backend: { type: 'webgl2' },
      scenes: { main: WorkerScene },
      canvas: { element: message.surface, width: message.size, height: message.size, pixelRatio: 1 },
      rendering: { webglAttributes: { antialias: false, preserveDrawingBuffer: true, depth: false } },
    });
    app = application;
    application.input.onPointerDown.add((_pointer, x, y) => void pointerPositions.push({ x, y }));
    progress('application-construction', 'end');

    progress('application-start', 'start');

    try {
      await application.start(WorkerScene);
    } catch (error) {
      if (!closing) {
        throw error;
      }
    } finally {
      progress('application-start', 'end');
    }

    if (closing) {
      return;
    }

    // The first image must not depend on the worker realm supplying display frames.
    progress('render', 'start');
    application.update(0);
    application.update(16);
    progress('render', 'end');

    progress('pixel-readback', 'start');
    const frame = readFrame(application, message.size);
    progress('pixel-readback', 'end');

    self.postMessage({
      kind: 'ready',
      realm: application.capabilities.realm,
      offscreenCanvas: application.capabilities.offscreenCanvas,
      offscreenWebgl2: application.capabilities.offscreenWebgl2,
      webgl2: application.capabilities.webgl2,
      pointer: application.capabilities.pointer,
      audio: application.capabilities.audio,
      devicePixelRatio: application.capabilities.devicePixelRatio,
      realmSchedulesFrames,
      surfaceIsOffscreen: application.canvas instanceof OffscreenCanvas,
      hasElement: application.element !== null,
      frame,
    });
  } finally {
    restoreGetContext();
    progress('init', 'end');
  }
};

const shutdown = async (): Promise<void> => {
  closing = true;
  progress('teardown', 'start');

  try {
    if (app !== null) {
      await app.destroy();
      const outcome = app.destroyOutcome;

      if (app.state !== ApplicationState.Destroyed || outcome?.status !== 'completed') {
        throw new Error(`Application teardown ${outcome?.status ?? app.state}: ${outcome?.errors.map(String).join('; ') ?? ''}`);
      }
    }
  } finally {
    // The worker supplied the platform, so the application does not own it.
    platform?.destroy();
    platform = null;
    app = null;
    progress('teardown', 'end');
  }

  self.postMessage({ kind: 'closed', loadAborted, unloads });
};

self.onmessage = async (event: MessageEvent<HostMessage>): Promise<void> => {
  const message = event.data;

  try {
    if (message.kind === 'init') {
      await initialize(message);

      return;
    }

    if (message.kind === 'frames') {
      const timestamps: number[] = [];
      const target = message.count;

      await new Promise<void>(resolve => {
        const onFrame = (): void => {
          timestamps.push(app!.frameCount);

          if (timestamps.length >= target) {
            app!.onFrame.remove(onFrame);
            resolve();
          }
        };

        app!.onFrame.add(onFrame);
      });

      if (!closing) {
        self.postMessage({ kind: 'frames-result', frames: timestamps.length, realmSchedulesFrames });
      }

      return;
    }

    if (message.kind === 'pointer') {
      pointerPositions = [];

      platform!.setSurfaceFocused(true);
      platform!.emitSurfaceEvent('pointerover', {
        pointerId: 1,
        pointerType: 'mouse',
        clientX: message.clientX,
        clientY: message.clientY,
        width: 1,
        height: 1,
        tiltX: 0,
        tiltY: 0,
        twist: 0,
        pressure: 0,
        buttons: 0,
        isPrimary: true,
      });

      const suppressed = platform!.emitSurfaceEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'mouse',
        clientX: message.clientX,
        clientY: message.clientY,
        width: 1,
        height: 1,
        tiltX: 0,
        tiltY: 0,
        twist: 0,
        pressure: 0.5,
        buttons: 1,
        isPrimary: true,
      });

      app!.update(32);

      self.postMessage({ kind: 'pointer-result', suppressed, positions: pointerPositions });

      return;
    }

    await shutdown();
  } catch (error) {
    self.postMessage({
      kind: 'error',
      request: message.kind,
      message:
        error instanceof Error
          ? `${error.name}: ${error.message}
${error.stack ?? ''}`
          : String(error),
    });
  }
};

progress('module-evaluation', 'end');
