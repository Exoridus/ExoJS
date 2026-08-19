import { describe, expect, it } from 'vitest';

import { saturate } from './fixtures/dsp';
import workerSource from './fixtures/generator.worker.ts?worker';
import workletSource from './fixtures/saturator.worklet.ts?worklet';
import { fibonacci } from './fixtures/shared';

/**
 * The production path for both inline-source plugins, end to end: authored
 * TypeScript with an ordinary relative import, bundled to one string, handed to
 * a platform API through a Blob URL, and executed by a real engine.
 *
 * The helpers are imported here as well as by the fixtures, so a green run also
 * proves the bundle really carried the transitive dependency rather than
 * silently dropping it - a dropped import would throw a ReferenceError inside
 * the worker/worklet, where no build-time signal exists.
 */
const blobUrl = (source: string): string => URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));

describe('inlined worklet source', () => {
  it('runs in a real AudioWorkletGlobalScope', async () => {
    const sampleRate = 48_000;
    const context = new OfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate });
    const url = blobUrl(workletSource);

    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    const constant = new ConstantSourceNode(context, { offset: 0.5 });
    const node = new AudioWorkletNode(context, 'exojs-build-saturator');

    constant.connect(node).connect(context.destination);
    constant.start();

    const rendered = await context.startRendering();

    // The last frame is past any render-quantum warm-up, so it is the processor
    // in steady state rather than the first block's transient.
    expect(rendered.getChannelData(0)[255]).toBeCloseTo(saturate(0.5, 4), 5);
  });

  it('carries no import token into the emitted source', () => {
    expect(/\bimport\b|\bexport\b/.test(workletSource)).toBe(false);
  });
});

describe('inlined worker source', () => {
  it('runs in a real classic Worker', async () => {
    const url = blobUrl(workerSource);
    const worker = new Worker(url);

    try {
      const reply = await new Promise<number>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<number>) => resolve(event.data);
        worker.onerror = event => reject(new Error(event.message));
        worker.postMessage(20);
      });

      expect(reply).toBe(fibonacci(20));
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  });

  it('carries no import token into the emitted source', () => {
    // `new Worker(url)` without `{ type: 'module' }` parses a classic script,
    // where module syntax throws before the first statement runs.
    expect(/\bimport\b|\bexport\b/.test(workerSource)).toBe(false);
  });
});
