/**
 * A whole application hosted in a dedicated worker, drawing into a canvas whose
 * control the document handed over.
 *
 * This is the sequence a worker-hosted runtime actually has to survive:
 * `transferControlToOffscreen()` on the host, construction on the far side of a
 * `postMessage`, a real WebGL2 context acquired in a realm with no document,
 * input normalised into clonable data and fed in from the host, and a teardown
 * that leaves nothing running.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { expectPixelNear, pixelAt } from './_pixels';

const SIZE = 64;

interface ReadyMessage {
  readonly kind: 'ready';
  readonly realm: string;
  readonly offscreenCanvas: boolean;
  readonly offscreenWebgl2: boolean;
  readonly webgl2: boolean;
  readonly pointer: boolean;
  readonly audio: boolean;
  readonly devicePixelRatio: number;
  readonly realmSchedulesFrames: boolean;
  readonly surfaceIsOffscreen: boolean;
  readonly hasElement: boolean;
  readonly frame: Uint8Array;
}

interface PointerResultMessage {
  readonly kind: 'pointer-result';
  readonly suppressed: boolean;
  readonly positions: ReadonlyArray<{ x: number; y: number }>;
}

interface FramesResultMessage {
  readonly kind: 'frames-result';
  readonly frames: number;
  readonly realmSchedulesFrames: boolean;
}

interface ClosedMessage {
  readonly kind: 'closed';
}

interface ErrorMessage {
  readonly kind: 'error';
  readonly message: string;
}

type WorkerMessage = ReadyMessage | PointerResultMessage | FramesResultMessage | ClosedMessage | ErrorMessage;

/** One request, one reply - a worker that reports an error fails the test rather than hanging. */
const exchange = <T extends WorkerMessage>(worker: Worker, message: unknown, transfer: Transferable[] = []): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerMessage>): void => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);

      if (event.data.kind === 'error') {
        reject(new Error(event.data.message));

        return;
      }

      resolve(event.data as T);
    };

    const onError = (event: ErrorEvent): void => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      reject(new Error(`worker error: ${event.message}`));
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(message, transfer);
  });

/**
 * Whether this browser can hand a canvas over to a worker at all. A browser
 * that cannot is a measurement result, not a broken test.
 */
const canTransferSurface = (ctx: { skip: (reason: string) => void }): boolean => {
  if (typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function') {
    return true;
  }

  ctx.skip('This browser cannot transfer canvas control to a worker.');

  return false;
};

const createHostCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = SIZE;
  canvas.height = SIZE;
  document.body.append(canvas);

  return canvas;
};

describe('an application hosted in a worker', () => {
  let worker: Worker | null = null;
  let canvas: HTMLCanvasElement | null = null;

  afterEach(() => {
    worker?.terminate();
    worker = null;
    canvas?.remove();
    canvas = null;
  });

  test('starts, renders and reports a realm of its own', async ctx => {
    if (!canTransferSurface(ctx)) return;

    canvas = createHostCanvas();
    worker = new Worker(new URL('./fixtures/application-host.worker.ts', import.meta.url), { type: 'module' });

    const surface = canvas.transferControlToOffscreen();
    const ready = await exchange<ReadyMessage>(worker, { kind: 'init', surface, size: SIZE }, [surface]);

    // The surface really is the transferred one, and the application knows it
    // has no element to reach for.
    expect(ready.surfaceIsOffscreen).toBe(true);
    expect(ready.hasElement).toBe(false);

    // Capabilities are answered for the worker's realm, not the document's.
    expect(ready.realm).toBe('worker');
    expect(ready.offscreenCanvas).toBe(true);
    expect(ready.offscreenWebgl2).toBe(true);
    expect(ready.webgl2).toBe(true);
    expect(ready.pointer).toBe(false);
    expect(ready.audio).toBe(false);
    expect(ready.devicePixelRatio).toBe(1);

    // Pixels, read out of the worker's own context.
    expectPixelNear(pixelAt(ready.frame, SIZE, 16, 16), [255, 0, 0, 255], 0);
    expectPixelNear(pixelAt(ready.frame, SIZE, 56, 56), [0, 0, 0, 255], 0);
  });

  test('routes host-normalised pointer input into the worker input pipeline', async ctx => {
    if (!canTransferSurface(ctx)) return;

    canvas = createHostCanvas();
    worker = new Worker(new URL('./fixtures/application-host.worker.ts', import.meta.url), { type: 'module' });

    const surface = canvas.transferControlToOffscreen();

    await exchange<ReadyMessage>(worker, { kind: 'init', surface, size: SIZE }, [surface]);

    const result = await exchange<PointerResultMessage>(worker, { kind: 'pointer', clientX: 20, clientY: 30 });

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toEqual({ x: 20, y: 30 });

    // The engine consumes a pointer press. Across a worker boundary the host
    // learns that after its own event has dispatched, which is why this is
    // reported rather than acted on.
    expect(result.suppressed).toBe(true);
  });

  test('runs its own frame loop, on a timer where the realm schedules no frames', async ctx => {
    if (!canTransferSurface(ctx)) return;

    canvas = createHostCanvas();
    worker = new Worker(new URL('./fixtures/application-host.worker.ts', import.meta.url), { type: 'module' });

    const surface = canvas.transferControlToOffscreen();
    const ready = await exchange<ReadyMessage>(worker, { kind: 'init', surface, size: SIZE }, [surface]);
    const frames = await exchange<FramesResultMessage>(worker, { kind: 'frames', count: 3 });

    expect(frames.frames).toBe(3);

    // Recorded rather than pinned: whether a dedicated worker schedules display
    // frames is the browser's decision - Chromium does, others may not - and
    // the adapter carries a timer fallback for the ones that do not. The frame
    // count above is what actually has to hold either way.
    expect(typeof frames.realmSchedulesFrames).toBe('boolean');
    expect(frames.realmSchedulesFrames).toBe(ready.realmSchedulesFrames);
  });

  test('shuts down cleanly on request', async ctx => {
    if (!canTransferSurface(ctx)) return;

    canvas = createHostCanvas();
    worker = new Worker(new URL('./fixtures/application-host.worker.ts', import.meta.url), { type: 'module' });

    const surface = canvas.transferControlToOffscreen();

    await exchange<ReadyMessage>(worker, { kind: 'init', surface, size: SIZE }, [surface]);

    const closed = await exchange<ClosedMessage>(worker, { kind: 'shutdown' });

    expect(closed.kind).toBe('closed');
  });
});
