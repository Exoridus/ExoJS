import { InlineWorker } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import echoWorkerSource from './fixtures/inline-worker-echo.worker.ts?worker';

const nextMessage = <T>(worker: Worker): Promise<T> => {
  return new Promise<T>(resolve => {
    worker.addEventListener('message', (event: MessageEvent<T>) => resolve(event.data), { once: true });
  });
};

describe('InlineWorker - real Worker', () => {
  it('runs a bundled source string, including its relative imports', async () => {
    const inline = new InlineWorker(echoWorkerSource);

    try {
      const reply = nextMessage<{ kind: string; value: number }>(inline.worker);

      inline.postMessage({ kind: 'double', value: 21 });

      await expect(reply).resolves.toEqual({ kind: 'double', value: 42 });
    } finally {
      inline.destroy();
    }
  });

  it('gives the worker the requested name', async () => {
    const inline = new InlineWorker(echoWorkerSource, { name: 'inline-worker-spec' });

    try {
      const reply = nextMessage<{ kind: string; value: string }>(inline.worker);

      inline.postMessage({ kind: 'name' });

      await expect(reply).resolves.toEqual({ kind: 'name', value: 'inline-worker-spec' });
    } finally {
      inline.destroy();
    }
  });

  it('transfers buffers in both directions', async () => {
    const inline = new InlineWorker(echoWorkerSource);
    const buffer = new ArrayBuffer(4);

    try {
      const reply = nextMessage<{ kind: string; buffer: ArrayBuffer }>(inline.worker);

      inline.postMessage({ kind: 'fill', buffer, value: 7 }, [buffer]);

      expect(buffer.byteLength).toBe(0);

      const { buffer: returned } = await reply;

      expect([...new Uint8Array(returned)]).toEqual([7, 7, 7, 7]);
    } finally {
      inline.destroy();
    }
  });

  it('stops delivering messages once destroyed', async () => {
    const inline = new InlineWorker(echoWorkerSource);
    const firstReply = nextMessage<{ value: number }>(inline.worker);

    inline.postMessage({ kind: 'double', value: 1 });

    // Prove the worker is live before terminating it, so a later silence can
    // only mean termination and not a worker that never started.
    await expect(firstReply).resolves.toEqual({ kind: 'double', value: 2 });

    inline.destroy();

    let delivered = false;

    inline.worker.addEventListener('message', () => {
      delivered = true;
    });
    inline.worker.postMessage({ kind: 'double', value: 2 });

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(delivered).toBe(false);
  });
});
