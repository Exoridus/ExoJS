// Off-thread terrain sampler for the "Worker-Streamed Terrain" example.
//
// Authored as a real module and bundled into one self-contained string by the
// `?worker` plugin (see @codexo/exojs-config/worker-plugin), which is how it
// can import the shared noise implementation: the string is Blob-URL'd into a
// classic Worker by createWorkerSampledChunkSource, and a classic worker has
// no module loader. Nothing is resolved at runtime.
//
// It typechecks against the Worker global scope only (tsconfig.workers.json) -
// there is no `window` or `document` here.

import { fbm } from '../shared/terrain-noise';

/** Configuration posted once, before any chunk request (see `initMessage`). */
interface TerrainInitMessage {
    type: 'terrain-init';
    seed: number;
    featureSize: number;
    /** Extra fbm evaluations per tile, to simulate an expensive sampler. */
    extraCost: number;
}

/** One chunk request, as createWorkerSampledChunkSource posts it. */
interface ChunkRequestMessage {
    requestId: number;
    cx: number;
    cy: number;
    chunkWidth: number;
    chunkHeight: number;
}

type IncomingMessage = TerrainInitMessage | ChunkRequestMessage;

const isInit = (message: IncomingMessage): message is TerrainInitMessage => 'type' in message && message.type === 'terrain-init';

let seed = 0;
let featureSize = 1;
let extraCost = 0;

self.onmessage = (event: MessageEvent<IncomingMessage>): void => {
    const message = event.data;

    if (isInit(message)) {
        seed = message.seed;
        featureSize = message.featureSize;
        extraCost = message.extraCost;
        return;
    }

    const { requestId, cx, cy, chunkWidth, chunkHeight } = message;

    try {
        const values = new Float64Array(chunkWidth * chunkHeight);
        for (let localTy = 0; localTy < chunkHeight; localTy++) {
            for (let localTx = 0; localTx < chunkWidth; localTx++) {
                const tx = cx * chunkWidth + localTx;
                const ty = cy * chunkHeight + localTy;
                let value = fbm(seed, tx / featureSize, ty / featureSize);
                // Burns deterministic CPU to simulate an expensive sampler -
                // the recomputed value is discarded except for the last pass.
                for (let i = 0; i < extraCost; i++) {
                    value = fbm(seed, tx / featureSize, ty / featureSize);
                }
                values[localTy * chunkWidth + localTx] = value;
            }
        }
        // Exactly one reply per request, transferring the buffer for a
        // zero-copy handoff back to the main thread.
        self.postMessage({ requestId, values }, [values.buffer]);
    } catch (error) {
        // Still exactly one reply - the error branch must also answer, or
        // ChunkStreamer treats this chunk as forever in flight (no timeout).
        self.postMessage({ requestId, error: String(error) });
    }
};
