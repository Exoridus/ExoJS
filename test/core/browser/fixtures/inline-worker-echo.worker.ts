// Authored as a real `.worker.ts` and imported through `?worker`, so the lane
// exercises the shipped path end to end - TypeScript source, esbuild bundle,
// Blob URL, classic Worker - rather than a template-string constant that would
// prove nothing about the bundled relative import.

import { double } from './inline-worker-math';

type EchoRequest = { kind: 'double'; value: number } | { kind: 'fill'; buffer: ArrayBuffer; value: number } | { kind: 'name' };

self.onmessage = (event: MessageEvent<EchoRequest>): void => {
  const request = event.data;

  if (request.kind === 'double') {
    self.postMessage({ kind: 'double', value: double(request.value) });
    return;
  }

  if (request.kind === 'name') {
    self.postMessage({ kind: 'name', value: self.name });
    return;
  }

  new Uint8Array(request.buffer).fill(request.value);
  // The options form of the transfer list, not the positional one: this file is
  // also compiled against the DOM lib by the test program, where the second
  // positional argument is `targetOrigin`.
  self.postMessage({ kind: 'fill', buffer: request.buffer }, { transfer: [request.buffer] });
};
