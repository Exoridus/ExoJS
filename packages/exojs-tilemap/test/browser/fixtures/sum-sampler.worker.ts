// Minimal protocol-conforming sampler for the real-Worker suite: value(tx, ty)
// = tx + ty, one reply per request, buffer transferred.
//
// A real `.worker.ts` bundled through the `?worker` query rather than a
// template-string constant, so the browser lane exercises the production path
// end to end - authored TypeScript, esbuild bundle, Blob URL, classic Worker -
// and not just `createWorkerSampledChunkSource`'s half of it.

import { packSampleValue } from './sum-sampler-math';

interface ChunkRequestMessage {
    requestId: number;
    cx: number;
    cy: number;
    chunkWidth: number;
    chunkHeight: number;
}

self.onmessage = (event: MessageEvent<ChunkRequestMessage>): void => {
    const { requestId, cx, cy, chunkWidth, chunkHeight } = event.data;
    const values = new Float64Array(chunkWidth * chunkHeight);
    const startTx = cx * chunkWidth;
    const startTy = cy * chunkHeight;

    for (let ty = 0; ty < chunkHeight; ty++) {
        for (let tx = 0; tx < chunkWidth; tx++) {
            values[ty * chunkWidth + tx] = packSampleValue(startTx + tx, startTy + ty);
        }
    }

    self.postMessage({ requestId, values }, [values.buffer]);
};
