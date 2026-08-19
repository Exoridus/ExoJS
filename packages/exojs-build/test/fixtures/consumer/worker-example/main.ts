// Main-thread half of the worker example. The import query yields the worker
// source as a string; the Blob and the `Worker` are the consumer's to build.
import workerSource from './generator.worker.ts?worker';
import { GENERATOR_TAG, type GeneratorReply } from './shared';

/** The bundled worker source, as a plain string. */
export const generatorWorkerSource: string = workerSource;

export const runGenerator = async (n: number): Promise<number> => {
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  const worker = new Worker(url);

  try {
    const reply = await new Promise<GeneratorReply>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<GeneratorReply>) => resolve(event.data);
      worker.onerror = event => reject(new Error(event.message));
      worker.postMessage(n);
    });

    if (reply.tag !== GENERATOR_TAG) throw new Error(`unexpected reply tag: ${reply.tag}`);

    return reply.value;
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
};
