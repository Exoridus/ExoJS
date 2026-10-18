import type { BasisTarget } from './basisTargets';
import type { Ktx2Descriptor } from './ktx2Descriptor';

interface PendingRequest {
  readonly resolve: (levels: readonly Uint8Array[]) => void;
  readonly reject: (error: Error) => void;
  readonly cleanup: () => void;
}

const ignoreRejection = (): void => undefined;

/** Loader-owned, lazy Basis worker. Input buffers remain owned by the source cache. */
export class BasisKtx2Runtime {
  private _worker: Worker | undefined;
  private _initPromise: Promise<void> | undefined;
  private _rejectInit: ((error: Error) => void) | undefined;
  private _failure: Error | undefined;
  private _nextId = 1;
  private readonly _pending = new Map<number, PendingRequest>();

  public transcode(
    buffer: ArrayBuffer,
    descriptor: Pick<Ktx2Descriptor, 'pixelWidth' | 'pixelHeight' | 'levelCount' | 'dfd' | 'universal'>,
    target: BasisTarget,
    signal?: AbortSignal,
  ): Promise<readonly Uint8Array[]> {
    if (signal?.aborted === true) {
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    }

    if (this._failure !== undefined) {
      return Promise.reject(this._failure);
    }

    try {
      this._initialize();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    const id = this._nextId++;

    return new Promise((resolve, reject) => {
      const abort = (): void => {
        this._settle(id, new DOMException('The operation was aborted.', 'AbortError'));
        this._worker?.postMessage({ kind: 'cancel', id });
      };

      this._pending.set(id, { resolve, reject, cleanup: () => signal?.removeEventListener('abort', abort) });
      signal?.addEventListener('abort', abort, { once: true });
      void this._initPromise?.then(
        () => {
          if (!this._pending.has(id)) {
            return;
          }

          try {
            // The codec/cache may share these bytes with another resource; detaching the source would corrupt its owner.
            const transferable = buffer.slice(0);
            this._worker?.postMessage(
              {
                kind: 'transcode',
                id,
                buffer: transferable,
                target: target.id,
                width: descriptor.pixelWidth,
                height: descriptor.pixelHeight,
                levelCount: descriptor.levelCount,
                hasAlpha: descriptor.dfd.hasAlpha === true,
                mode: descriptor.universal,
              },
              [transferable],
            );
          } catch (error) {
            this._settle(id, error instanceof Error ? error : new Error(String(error)));
          }
        },
        (error: unknown) => this._settle(id, error instanceof Error ? error : new Error(String(error))),
      );

      if (signal?.aborted === true) {
        abort();
      }
    });
  }

  public destroy(): void {
    this._fail(new Error('Basis worker runtime was destroyed.'));
  }

  private _initialize(): void {
    if (this._initPromise !== undefined) {
      return;
    }

    const worker = new Worker(new URL('basis/ktx2.worker.ts', import.meta.url), { type: 'module', name: 'ExoJS Basis KTX2' });
    this._worker = worker;
    this._initPromise = new Promise<void>((resolve, reject) => {
      this._rejectInit = reject;

      worker.onmessage = ({ data }: MessageEvent<{ kind: string; id: number; message: string; levels: Uint8Array[] }>) => {
        if (data.kind === 'ready') {
          resolve();
        } else if (data.kind === 'fatal') {
          const error = new Error(data.message);
          reject(error);
          this._fail(error);
        } else if (data.kind === 'result') {
          this._settle(data.id, undefined, data.levels);
        } else if (data.kind === 'error') {
          this._settle(data.id, new Error(data.message));
        }
      };

      const fail = (message: string): void => {
        const error = new Error(message);
        reject(error);
        this._fail(error);
      };

      worker.onerror = event => {
        event.preventDefault();
        fail(event.message || 'Basis worker failed.');
      };

      worker.onmessageerror = () => fail('Basis worker message decoding failed.');
    });
    void this._initPromise.catch(ignoreRejection);

    try {
      worker.postMessage({ kind: 'init' });
    } catch (error) {
      this._fail(error instanceof Error ? error : new Error(String(error)));

      throw error;
    }
  }

  private _settle(id: number, error?: Error, levels: readonly Uint8Array[] = []): void {
    const request = this._pending.get(id);

    if (request === undefined) {
      return;
    }

    this._pending.delete(id);
    request.cleanup();

    if (error === undefined) {
      request.resolve(levels);
    } else {
      request.reject(error);
    }
  }

  private _fail(error: Error): void {
    this._failure ??= error;
    this._rejectInit?.(this._failure);
    this._rejectInit = undefined;

    for (const id of this._pending.keys()) {
      this._settle(id, this._failure);
    }

    this._worker?.terminate();
    this._worker = undefined;
  }
}
