// The worker an external consumer authors: real TypeScript, importing a real
// module. The `?worker` transform bundles both into one classic-script string.
import { fibonacci, GENERATOR_TAG, type GeneratorReply } from './shared';

self.onmessage = (event: MessageEvent<number>): void => {
  const reply: GeneratorReply = { tag: GENERATOR_TAG, value: fibonacci(event.data) };

  self.postMessage(reply);
};
