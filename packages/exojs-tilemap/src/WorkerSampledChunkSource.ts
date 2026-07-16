import type { ChunkPayload, ChunkSource } from './ChunkSource';
import type { TileLayer } from './TileLayer';
import type { ResolvedTile } from './types';
import { packTile } from './types';

/**
 * Options for {@link createWorkerSampledChunkSource}.
 * @advanced
 */
export interface WorkerSampledChunkSourceOptions {
  /**
   * Complete worker script source, written as a self-contained string (a
   * template literal in your own module — no separate file, no bundler
   * worker-import syntax needed). Blob-URL'd into a real `Worker` at
   * construction time, the same technique
   * {@link import('@codexo/exojs').WorkletEffect} uses for AudioWorklet
   * processors.
   *
   * Must implement this request/response protocol:
   * - Request (received via `self.onmessage`):
   *   `{ requestId: number; cx: number; cy: number; chunkWidth: number; chunkHeight: number }`.
   * - Response, success (send via `self.postMessage`, transferring the
   *   buffer for a zero-copy handoff — `postMessage(response, [response.values.buffer])`):
   *   `{ requestId: number; values: Float64Array }`, `values.length ===
   *   chunkWidth * chunkHeight`, row-major (`localTy * chunkWidth + localTx`),
   *   one sampled value per tile in the requested chunk. Compute each tile's
   *   absolute coordinate as `cx * chunkWidth + localTx` /
   *   `cy * chunkHeight + localTy`.
   * - Response, error (one request failed without crashing the worker):
   *   `{ requestId: number; error: string }`.
   */
  workerSource: string;
  /**
   * Convert a sampled value (and its absolute tile coordinate) into a
   * resolved tile, or `null` for an empty cell. Always runs on the main
   * thread — a `ResolvedTile` references a `TileSet`/`Texture`, neither of
   * which can cross a `postMessage` boundary. Must be pure and
   * deterministic, same requirement as
   * {@link import('./SampledChunkSource').SampledChunkSourceOptions.mapValueToTile}.
   */
  mapValueToTile(value: number, tx: number, ty: number): ResolvedTile | null;
}

interface WorkerRequestMessage {
  readonly requestId: number;
  readonly cx: number;
  readonly cy: number;
  readonly chunkWidth: number;
  readonly chunkHeight: number;
}

interface WorkerSuccessMessage {
  readonly requestId: number;
  readonly values: Float64Array;
}

interface WorkerErrorMessage {
  readonly requestId: number;
  readonly error: string;
}

type WorkerResponseMessage = WorkerSuccessMessage | WorkerErrorMessage;

function isWorkerErrorMessage(message: WorkerResponseMessage): message is WorkerErrorMessage {
  return 'error' in message;
}

interface PendingRequest {
  readonly resolve: (payload: ChunkPayload | null) => void;
  readonly reject: (error: Error) => void;
  readonly cx: number;
  readonly cy: number;
  readonly chunkWidth: number;
  readonly chunkHeight: number;
}

/**
 * Build a {@link import('./ChunkStreamer').ChunkStreamer}-ready
 * {@link ChunkSource} that samples off the main thread via a Web Worker —
 * the async counterpart to
 * {@link import('./SampledChunkSource').createSampledChunkSource}, for
 * sampling functions expensive enough to want off-thread execution.
 *
 * Unlike the synchronous provider, sampling logic cannot be passed as a
 * live function — functions cannot cross a `postMessage` boundary. Instead
 * {@link WorkerSampledChunkSourceOptions.workerSource} is a self-contained
 * worker script string; see its documentation for the protocol.
 *
 * The returned value's `destroy()` MUST be called when done with it (e.g.
 * alongside your `ChunkStreamer.destroy()` call) — the underlying `Worker`
 * is a real resource that leaks otherwise. `ChunkSource` itself has no
 * lifecycle hook, so this is not automatic.
 *
 * Implementation note: `workerSource` is Blob-URL'd into a real `Worker`
 * (`new Blob([workerSource])` → `URL.createObjectURL` → `new Worker(url)`) —
 * the same technique {@link import('@codexo/exojs').WorkletEffect} already
 * uses for AudioWorklet processors. This is bundler-agnostic (no special
 * config needed in Vite/webpack/etc.) but requires a Content-Security-Policy
 * that permits `blob:` in `worker-src` (or `script-src` as a fallback) if
 * your deployment sets one.
 * @advanced
 */
export function createWorkerSampledChunkSource(
  layer: TileLayer,
  options: WorkerSampledChunkSourceOptions,
): ChunkSource & { destroy(): void } {
  const mapValueToTile = options.mapValueToTile.bind(options);

  const blob = new Blob([options.workerSource], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);

  let requestCounter = 0;
  const pending = new Map<number, PendingRequest>();
  let destroyed = false;

  function composePayload(values: Float64Array, request: PendingRequest): ChunkPayload | null {
    const { cx, cy, chunkWidth, chunkHeight } = request;
    const startTx = cx * chunkWidth;
    const startTy = cy * chunkHeight;

    let out: Uint32Array | null = null;
    for (let ty = startTy; ty < startTy + chunkHeight; ty++) {
      for (let tx = startTx; tx < startTx + chunkWidth; tx++) {
        // Bounded-layer edge chunks may be smaller than a full chunk — same
        // clamp createSampledChunkSource applies, computed here (not asked
        // of the worker) since only this side knows the layer's bounds.
        if (layer.width !== undefined && layer.height !== undefined && (tx >= layer.width || ty >= layer.height)) continue;

        const localIndex = (ty - startTy) * chunkWidth + (tx - startTx);
        const value = values[localIndex];
        if (value === undefined) continue; // defensive: malformed/short values array
        const resolved = mapValueToTile(value, tx, ty);
        if (!resolved) continue;

        out ??= new Uint32Array(chunkWidth * chunkHeight);
        const tilesetIndex = layer.tilesets.indexOf(resolved.tileset);
        out[localIndex] = packTile(tilesetIndex, resolved.localTileId, resolved.transform);
      }
    }

    return out === null ? null : { width: chunkWidth, height: chunkHeight, tiles: out };
  }

  worker.onmessage = (event: MessageEvent<WorkerResponseMessage>): void => {
    const message = event.data;
    const entry = pending.get(message.requestId);
    if (!entry) return; // stale/unknown requestId (e.g. arrived after destroy())
    pending.delete(message.requestId);

    if (isWorkerErrorMessage(message)) {
      entry.reject(new Error(message.error));
      return;
    }

    entry.resolve(composePayload(message.values, entry));
  };

  worker.onerror = (event: ErrorEvent): void => {
    const error = new Error(`WorkerSampledChunkSource worker error: ${event.message}`);
    for (const entry of pending.values()) {
      entry.reject(error);
    }
    pending.clear();
  };

  return {
    getChunk(cx: number, cy: number): Promise<ChunkPayload | null> {
      if (destroyed) {
        return Promise.reject(new Error('WorkerSampledChunkSource: getChunk() called after destroy().'));
      }

      const chunkWidth = layer.chunkWidth;
      const chunkHeight = layer.chunkHeight;
      const requestId = ++requestCounter;

      return new Promise<ChunkPayload | null>((resolve, reject) => {
        pending.set(requestId, { resolve, reject, cx, cy, chunkWidth, chunkHeight });
        const request: WorkerRequestMessage = { requestId, cx, cy, chunkWidth, chunkHeight };
        worker.postMessage(request);
      });
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      const error = new Error('WorkerSampledChunkSource destroyed.');
      for (const entry of pending.values()) {
        entry.reject(error);
      }
      pending.clear();
      worker.terminate();
    },
  };
}
