import type { Destroyable } from './types';

/** Options for {@link InlineWorker}. */
export interface InlineWorkerOptions {
  /**
   * Value for the worker's `self.name`. Surfaces in DevTools thread lists and
   * in error reports, so a descriptive name is worth setting when a page runs
   * more than one worker.
   */
  name?: string;
}

/**
 * Runs a worker from a JavaScript source string instead of a separate script
 * file, and owns the lifetime of the object URL that makes that possible.
 *
 * The intended source is the string emitted by the `?worker` import of
 * `@codexo/exojs-build`, which inlines a TypeScript worker module and its
 * imports as one classic script. Nothing about this class requires that build
 * step, though: any self-contained classic-script source works.
 *
 * ```ts
 * import workerSource from './generator.worker.ts?worker';
 *
 * const worker = new InlineWorker(workerSource, { name: 'generator' });
 *
 * worker.worker.onmessage = (event) => console.log(event.data);
 * worker.postMessage(42);
 * ```
 *
 * There is no message protocol here: {@link worker} is the real `Worker`, so
 * `onmessage`, `onerror`, `addEventListener` and structured clone behave
 * exactly as they do without this class. {@link postMessage} is a convenience
 * that additionally rejects use after {@link destroy}.
 *
 * The source runs as a **classic** script, so it cannot use `import`. Emitted
 * `?worker` sources already satisfy this.
 *
 * A page whose Content-Security-Policy omits `blob:` from `worker-src` (or
 * `child-src`/`default-src` as the fallback) blocks the construction; the
 * error thrown by the constructor names that cause.
 */
export class InlineWorker implements Destroyable {
  /**
   * The underlying worker. Attach listeners and transfer ownership of objects
   * through this. Remains valid until {@link destroy}, which terminates it.
   */
  public readonly worker: Worker;

  private readonly _name: string;
  private _destroyed = false;

  /**
   * @param source Self-contained classic-script JavaScript.
   * @throws If the environment provides no `Worker`, or if worker construction
   *   fails - most commonly a Content-Security-Policy that disallows `blob:`.
   */
  public constructor(source: string, options: InlineWorkerOptions = {}) {
    this._name = options.name ?? 'InlineWorker';

    if (typeof Worker === 'undefined') {
      throw new Error(`InlineWorker "${this._name}" cannot start: this environment provides no Worker constructor.`);
    }

    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));

    try {
      this.worker = new Worker(url, options.name !== undefined ? { name: options.name } : undefined);
    } catch (error) {
      throw new Error(
        `InlineWorker "${this._name}" could not construct its Worker. A Content-Security-Policy without "blob:" in worker-src (or its child-src/default-src fallback) is the usual cause.`,
        { cause: error },
      );
    } finally {
      // The worker's script fetch captures the blob URL entry while the Worker
      // constructor runs, so revoking here cannot cancel the pending load and
      // keeps a failed construction from leaking the entry.
      URL.revokeObjectURL(url);
    }
  }

  /** Whether {@link destroy} has already run. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Post `message` to the worker, transferring ownership of everything in
   * `transfer`.
   *
   * @throws After {@link destroy}, where the underlying `Worker.postMessage`
   *   would silently discard the message instead.
   */
  public postMessage(message: unknown, transfer?: readonly Transferable[]): void {
    if (this._destroyed) {
      throw new Error(`InlineWorker "${this._name}" was destroyed, so it cannot post messages.`);
    }

    if (transfer === undefined) {
      this.worker.postMessage(message);
    } else {
      this.worker.postMessage(message, [...transfer]);
    }
  }

  /**
   * Terminate the worker immediately, discarding queued and in-flight work.
   * Idempotent.
   */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this.worker.terminate();
  }
}
