// A real, typed Web Worker that imports an ordinary TypeScript module. The
// `?worker` transform bundles the two into one classic-script-compatible
// string; a classic worker cannot resolve an import.
import { fibonacci } from './shared';

self.onmessage = (event: MessageEvent<number>): void => {
  self.postMessage(fibonacci(event.data));
};
