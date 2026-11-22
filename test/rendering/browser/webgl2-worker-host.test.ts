import { expectPixelNear, pixelAt } from './_pixels';
import type { WorkerProgress } from './fixtures/application-host.progress';
import type { SceneMode } from './fixtures/application-host.worker';

const SIZE = 64;
const INIT_TIMEOUT_MS = 25_000;
const EXCHANGE_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 8_000;
const TEST_TIMEOUT_MS = 40_000;

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
  readonly loadAborted: boolean;
  readonly unloads: number;
}

interface LoadingMessage {
  readonly kind: 'loading';
}

interface ErrorMessage {
  readonly kind: 'error';
  readonly request: string;
  readonly message: string;
}

type WorkerReply = ReadyMessage | PointerResultMessage | FramesResultMessage | ClosedMessage | LoadingMessage;
type WorkerMessage = WorkerReply | ErrorMessage | WorkerProgress;

const now = (): number => performance.timeOrigin + performance.now();

const canTransferSurface = (ctx: { skip: (reason: string) => void }): boolean => {
  if (typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function') {
    return true;
  }

  ctx.skip('This browser cannot transfer canvas control to a worker.');

  return false;
};

describe('an application hosted in a worker', () => {
  let worker: Worker | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let workerCreatedAt = 0;
  let initSentAt = 0;
  let initReplyMs: number | null = null;
  let shutdownRequested = false;
  const progress: WorkerProgress[] = [];

  const timings = (): string => {
    const active = new Map<WorkerProgress['phase'], number>();
    const phases: Array<{ phase: WorkerProgress['phase']; ms: number }> = [];

    for (const { phase, edge, at } of progress) {
      if (edge === 'start') {
        active.set(phase, at);
      } else {
        const started = active.get(phase);

        if (started !== undefined) {
          phases.push({ phase, ms: Math.round(at - started) });
          active.delete(phase);
        }
      }
    }

    const first = progress[0];
    const received = progress.find(event => event.phase === 'init' && event.edge === 'start');

    return JSON.stringify({
      workerStartMs: first ? Math.round(first.at - workerCreatedAt) : null,
      initDeliveryMs: received ? Math.round(received.at - initSentAt) : null,
      initReplyMs,
      contexts: progress.at(-1)?.contexts ?? 0,
      phases,
      pending: [...active.keys()],
    });
  };

  const exchange = <T extends WorkerReply>(
    target: Worker,
    message: { kind: string; [key: string]: unknown },
    reply: T['kind'],
    timeout: number,
    transfer: Transferable[] = [],
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        target.removeEventListener('message', onMessage);
        target.removeEventListener('error', onError);
        target.removeEventListener('messageerror', onMessageError);
      };

      const fail = (reason: string): void => {
        cleanup();
        reject(new Error(`worker "${message.kind}": ${reason}; ${timings()}`));
      };

      const onMessage = ({ data }: MessageEvent<WorkerMessage>): void => {
        if (data.kind === 'progress') {
          return;
        }

        if (data.kind === 'error') {
          if (data.request === message.kind) {
            fail(data.message);
          }
        } else if (data.kind === reply) {
          cleanup();
          resolve(data as T);
        } else if (message.kind !== 'shutdown') {
          // An exchange that already timed out may still deliver a reply during cleanup.
          fail(`expected "${reply}", received "${data.kind}"`);
        }
      };

      const onError = (event: ErrorEvent): void => fail(`worker error: ${event.message}`);
      const onMessageError = (): void => fail('reply could not be deserialized');
      const timer = setTimeout(() => {
        const last = progress.at(-1);
        const gpuPhase = last?.edge === 'start' && ['webgl2-context', 'render', 'pixel-readback'].includes(last.phase);
        const phase = message.kind === 'shutdown' ? 'teardown' : 'init';
        const boundary = progress.filter(event => event.phase === phase).at(-1);
        let reason = `no "${reply}" reply`;

        if (gpuPhase) {
          reason = `GPU phase "${last.phase}" did not finish`;
        } else if (boundary?.edge === 'start') {
          reason = `${phase === 'init' ? 'initialization' : 'resource teardown'} did not finish`;
        }

        fail(`${reason} within ${timeout}ms`);
      }, timeout);

      target.addEventListener('message', onMessage);
      target.addEventListener('error', onError);
      target.addEventListener('messageerror', onMessageError);

      try {
        target.postMessage(message, transfer);
      } catch (error) {
        fail(String(error));
      }
    });

  const startWorker = async <T extends ReadyMessage | LoadingMessage>(reply: T['kind'], sceneMode?: SceneMode): Promise<T> => {
    canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    document.body.append(canvas);

    workerCreatedAt = now();
    worker = new Worker(new URL('./fixtures/application-host.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }: MessageEvent<WorkerMessage>) => {
      if (data.kind === 'progress') {
        progress.push(data);
      }
    });

    const surface = canvas.transferControlToOffscreen();
    initSentAt = now();
    const result = await exchange<T>(worker, { kind: 'init', surface, size: SIZE, sceneMode }, reply, INIT_TIMEOUT_MS, [surface]);

    if (result.kind === 'ready') {
      initReplyMs = Math.round(now() - initSentAt);
    }

    return result;
  };

  const closeWorker = (): Promise<ClosedMessage> => {
    shutdownRequested = true;

    return exchange<ClosedMessage>(worker!, { kind: 'shutdown' }, 'closed', SHUTDOWN_TIMEOUT_MS);
  };

  afterEach(async () => {
    try {
      if (worker !== null && !shutdownRequested) {
        await closeWorker();
      }
    } finally {
      if (worker !== null) {
        worker.terminate();
        console.info(`[worker-host] ${timings()}`);
      }

      canvas?.remove();
      worker = null;
      canvas = null;
      shutdownRequested = false;
      initReplyMs = null;
      progress.length = 0;
    }
  }, SHUTDOWN_TIMEOUT_MS + 2_000);

  test('starts, renders and reports a realm of its own', { timeout: TEST_TIMEOUT_MS }, async ctx => {
    if (!canTransferSurface(ctx)) {
      return;
    }

    const ready = await startWorker<ReadyMessage>('ready');

    expect(ready.surfaceIsOffscreen).toBe(true);
    expect(ready.hasElement).toBe(false);
    expect(ready.realm).toBe('worker');
    expect(ready.offscreenCanvas).toBe(true);
    expect(ready.offscreenWebgl2).toBe(true);
    expect(ready.webgl2).toBe(true);
    expect(ready.pointer).toBe(false);
    expect(ready.audio).toBe(false);
    expect(ready.devicePixelRatio).toBe(1);
    expectPixelNear(pixelAt(ready.frame, SIZE, 16, 16), [255, 0, 0, 255], 0);
    expectPixelNear(pixelAt(ready.frame, SIZE, 56, 56), [0, 0, 0, 255], 0);
  });

  test('routes host-normalised pointer input into the worker input pipeline', { timeout: TEST_TIMEOUT_MS }, async ctx => {
    if (!canTransferSurface(ctx)) {
      return;
    }

    await startWorker<ReadyMessage>('ready');
    const result = await exchange<PointerResultMessage>(
      worker!,
      { kind: 'pointer', clientX: 20, clientY: 30 },
      'pointer-result',
      EXCHANGE_TIMEOUT_MS,
    );

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toEqual({ x: 20, y: 30 });

    // The host receives suppression after its own event has already dispatched.
    expect(result.suppressed).toBe(true);
  });

  test('runs its own frame loop, on a timer where the realm schedules no frames', { timeout: TEST_TIMEOUT_MS }, async ctx => {
    if (!canTransferSurface(ctx)) {
      return;
    }

    const ready = await startWorker<ReadyMessage>('ready');
    const frames = await exchange<FramesResultMessage>(worker!, { kind: 'frames', count: 3 }, 'frames-result', EXCHANGE_TIMEOUT_MS);

    expect(frames.frames).toBe(3);
    expect(typeof frames.realmSchedulesFrames).toBe('boolean');
    expect(frames.realmSchedulesFrames).toBe(ready.realmSchedulesFrames);
  });

  test('shuts down cleanly on request', { timeout: TEST_TIMEOUT_MS }, async ctx => {
    if (!canTransferSurface(ctx)) {
      return;
    }

    await startWorker<ReadyMessage>('ready');
    const closed = await closeWorker();

    expect(closed.unloads).toBe(1);
  });

  test('shuts down after a scene load fails', { timeout: TEST_TIMEOUT_MS }, async ctx => {
    if (!canTransferSurface(ctx)) {
      return;
    }

    await expect(startWorker<ReadyMessage>('ready', 'fail-load')).rejects.toThrow('Worker scene load failed');
    await closeWorker();
  });

  test('aborts an in-flight scene load before termination', { timeout: TEST_TIMEOUT_MS }, async ctx => {
    if (!canTransferSurface(ctx)) {
      return;
    }

    await startWorker<LoadingMessage>('loading', 'abort-load');
    const closed = await closeWorker();

    expect(closed.loadAborted).toBe(true);
  });

  test('reports a failed teardown even when destroy resolves', { timeout: TEST_TIMEOUT_MS }, async ctx => {
    if (!canTransferSurface(ctx)) {
      return;
    }

    await startWorker<ReadyMessage>('ready', 'fail-unload');
    await expect(closeWorker()).rejects.toThrow(/completedWithErrors:.*Worker scene unload failed/);
  });
});
