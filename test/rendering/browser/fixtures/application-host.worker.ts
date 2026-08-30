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

import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { OffscreenPlatform } from '#platform/OffscreenPlatform';
import { Container } from '#rendering/Container';
import type { RenderingContext } from '#rendering/RenderingContext';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

interface InitMessage {
  readonly kind: 'init';
  readonly surface: OffscreenCanvas;
  readonly size: number;
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

  if (context === null) throw new Error('No 2D context in this worker.');

  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, edge, edge);

  return canvas;
};

class WorkerScene extends Scene {
  private readonly _content = new Container();

  public override load(): void {
    const sprite = new Sprite(new Texture(red(16)));

    sprite.setPosition(8, 8);
    this._content.addChild(sprite);
  }

  public override draw(context: RenderingContext): void {
    this._content.render(context.backend);
  }

  public override unload(): void {
    this._content.destroy();
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

/** Read the frame straight out of the worker's own GL context, top-left indexed. */
const readFrame = (size: number): Uint8Array => {
  const gl = (app!.backend as WebGl2Backend).context;
  const flipped = new Uint8Array(size * size * 4);

  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, flipped);

  const out = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const source = (size - 1 - y) * size * 4;

    out.set(flipped.subarray(source, source + size * 4), y * size * 4);
  }

  return out;
};

self.onmessage = async (event: MessageEvent<HostMessage>): Promise<void> => {
  const message = event.data;

  try {
    if (message.kind === 'init') {
      platform = new OffscreenPlatform(message.surface);

      app = new Application({
        platform,
        hello: false,
        clearColor: Color.black,
        backend: { type: 'webgl2' },
        scenes: { main: WorkerScene },
        canvas: { element: message.surface, width: message.size, height: message.size, pixelRatio: 1 },
        rendering: { webglAttributes: { antialias: false, preserveDrawingBuffer: true, depth: false } },
      });

      app.input.onPointerDown.add((_pointer, x, y) => void pointerPositions.push({ x, y }));

      await app.start(WorkerScene);

      // One frame, driven by hand: whether this realm schedules display frames
      // at all is exactly what the host is asking about, so the reply must not
      // depend on one arriving.
      app.update(0);
      app.update(16);

      self.postMessage({
        kind: 'ready',
        realm: app.capabilities.realm,
        offscreenCanvas: app.capabilities.offscreenCanvas,
        offscreenWebgl2: app.capabilities.offscreenWebgl2,
        webgl2: app.capabilities.webgl2,
        pointer: app.capabilities.pointer,
        audio: app.capabilities.audio,
        devicePixelRatio: app.capabilities.devicePixelRatio,
        realmSchedulesFrames,
        surfaceIsOffscreen: app.canvas instanceof OffscreenCanvas,
        hasElement: app.element !== null,
        frame: readFrame(message.size),
      });

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

      self.postMessage({ kind: 'frames-result', frames: timestamps.length, realmSchedulesFrames });

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

    await app?.destroy();
    app = null;
    platform = null;

    self.postMessage({ kind: 'closed' });
  } catch (error) {
    self.postMessage({
      kind: 'error',
      message:
        error instanceof Error
          ? `${error.name}: ${error.message}
${error.stack ?? ''}`
          : String(error),
    });
  }
};
