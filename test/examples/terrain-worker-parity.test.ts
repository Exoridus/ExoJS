// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { fbm } from '../../examples/shared/terrain-noise';
import terrainWorkerSource from '../../examples/tilemap/worker-streamed-terrain.worker.ts?worker';

/**
 * The "Worker-Streamed Terrain" example offers the same world through two
 * providers - a synchronous sampler on the main thread and a Worker - and its
 * whole point is that switching between them changes the frame time and nothing
 * else. That only holds if both evaluate the identical noise function, which is
 * exactly what stopped being obvious once the worker moved to its own file: the
 * worker's copy is produced by a build step, not by the module system.
 *
 * So the worker is exercised as the example ships it: the bundled source string,
 * evaluated as a classic script against a stand-in worker global, driven through
 * the real init + request protocol, and compared tile-for-tile against calling
 * `fbm` directly.
 *
 * Runs in the node environment because the bundler cannot run under jsdom
 * (esbuild rejects its `TextEncoder`).
 */
interface WorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown, transfer?: unknown[]): void;
}

interface ChunkReply {
  requestId: number;
  values?: Float64Array;
  error?: string;
}

/** Evaluates the bundled worker source against a stand-in `self` and returns it. */
function startWorker(): { scope: WorkerScope; replies: ChunkReply[] } {
  const replies: ChunkReply[] = [];
  const scope: WorkerScope = {
    onmessage: null,
    postMessage(message: unknown) {
      replies.push(message as ChunkReply);
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the bundled source is the artifact under test; a classic Worker evaluates it exactly like this
  new Function('self', terrainWorkerSource).call(undefined, scope);

  return { scope, replies };
}

const send = (scope: WorkerScope, data: unknown): void => {
  expect(scope.onmessage, 'worker never installed an onmessage handler').not.toBeNull();
  scope.onmessage!({ data });
};

const SEED = 1337;
const FEATURE_SIZE = 28;
const CHUNK = 4;

describe('worker-streamed-terrain worker ↔ synchronous sampler', () => {
  it('produces the same values as calling fbm directly, for the same seed', () => {
    const { scope, replies } = startWorker();

    send(scope, { type: 'terrain-init', seed: SEED, featureSize: FEATURE_SIZE, extraCost: 0 });
    send(scope, { requestId: 1, cx: 2, cy: -3, chunkWidth: CHUNK, chunkHeight: CHUNK });

    expect(replies).toHaveLength(1);
    expect(replies[0]!.requestId).toBe(1);
    expect(replies[0]!.error).toBeUndefined();

    const values = replies[0]!.values!;
    expect(values).toHaveLength(CHUNK * CHUNK);

    for (let localTy = 0; localTy < CHUNK; localTy++) {
      for (let localTx = 0; localTx < CHUNK; localTx++) {
        const tx = 2 * CHUNK + localTx;
        const ty = -3 * CHUNK + localTy;

        expect(values[localTy * CHUNK + localTx]).toBe(fbm(SEED, tx / FEATURE_SIZE, ty / FEATURE_SIZE));
      }
    }
  });

  it('answers exactly once per request', () => {
    const { scope, replies } = startWorker();

    send(scope, { type: 'terrain-init', seed: SEED, featureSize: FEATURE_SIZE, extraCost: 0 });
    send(scope, { requestId: 7, cx: 0, cy: 0, chunkWidth: CHUNK, chunkHeight: CHUNK });
    send(scope, { requestId: 8, cx: 1, cy: 0, chunkWidth: CHUNK, chunkHeight: CHUNK });

    // An unanswered request leaves its chunk permanently in flight - ChunkStreamer
    // has no timeout and never retries.
    expect(replies.map(reply => reply.requestId)).toEqual([7, 8]);
  });

  it('repeats the sample under extraCost instead of accumulating it', () => {
    const { scope, replies } = startWorker();

    send(scope, { type: 'terrain-init', seed: SEED, featureSize: FEATURE_SIZE, extraCost: 5 });
    send(scope, { requestId: 1, cx: 0, cy: 0, chunkWidth: 1, chunkHeight: 1 });

    // The cost loop is a CPU burner, not part of the terrain definition: raising
    // it must not move a single tile.
    expect(replies[0]!.values![0]).toBe(fbm(SEED, 0, 0));
  });

  it('takes seed and feature size from the init message rather than a baked-in constant', () => {
    const { scope, replies } = startWorker();

    send(scope, { type: 'terrain-init', seed: 4242, featureSize: 9, extraCost: 0 });
    send(scope, { requestId: 1, cx: 0, cy: 0, chunkWidth: 1, chunkHeight: 1 });

    expect(replies[0]!.values![0]).toBe(fbm(4242, 0, 0));
    expect(replies[0]!.values![0]).not.toBe(fbm(SEED, 0, 0));
  });
});
