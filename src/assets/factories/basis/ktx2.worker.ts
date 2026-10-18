import createBasis from './basis_transcoder.mjs';

interface Request {
  readonly kind: 'init' | 'transcode' | 'cancel';
  readonly id: number;
  readonly buffer: ArrayBuffer;
  readonly target: number;
  readonly width: number;
  readonly height: number;
  readonly levelCount: number;
  readonly hasAlpha: boolean;
  readonly mode: 'etc1s' | 'uastc';
}

const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
};
let initPromise: ReturnType<typeof createBasis> | undefined;
const active = new Map<number, { cancelled: boolean }>();
const turns = new MessageChannel();
const resumeTurns: Array<() => void> = [];
turns.port1.onmessage = () => resumeTurns.shift()?.();
const yieldToMessages = (): Promise<void> =>
  new Promise(resolve => {
    resumeTurns.push(resolve);
    turns.port2.postMessage(undefined);
  });

type BasisFile = InstanceType<Awaited<ReturnType<typeof createBasis>>['KTX2File']>;
const matchesDescriptor = (file: BasisFile, request: Request): boolean =>
  file.isValid() &&
  (request.mode === 'etc1s' ? file.isETC1S() : file.isUASTC()) &&
  file.getWidth() === request.width &&
  file.getHeight() === request.height &&
  file.getLevels() === request.levelCount &&
  file.getHasAlpha() === request.hasAlpha;

const initialize = (): ReturnType<typeof createBasis> => {
  initPromise ??= (async () => {
    const response = await fetch(new URL('basis_transcoder.wasm', import.meta.url));

    if (!response.ok) {
      throw new Error(`Basis WASM fetch failed (${response.status}).`);
    }

    const module = await createBasis({ wasmBinary: new Uint8Array(await response.arrayBuffer()) });
    module.initializeBasis();

    return module;
  })();

  return initPromise;
};

const transcode = async (request: Request): Promise<void> => {
  const state = { cancelled: false };
  active.set(request.id, state);
  let file: InstanceType<Awaited<ReturnType<typeof createBasis>>['KTX2File']> | undefined;

  try {
    const module = await initialize();

    if (state.cancelled) {
      return;
    }

    const input = request.buffer;
    file = new module.KTX2File(new Uint8Array(input));

    if (!matchesDescriptor(file, request)) {
      throw new Error('Basis payload is malformed or contradicts its validated descriptor.');
    }

    if (!file.startTranscoding()) {
      throw new Error('Basis could not decode the universal payload.');
    }

    const levels: Array<Uint8Array<ArrayBuffer>> = [];
    let totalBytes = 0;

    for (let level = 0; level < request.levelCount; level++) {
      if (state.cancelled) {
        return;
      }

      const length = file.getImageTranscodedSizeInBytes(level, 0, 0, request.target);
      totalBytes += length;

      if (length === 0 || totalBytes > 256 * 1024 * 1024) {
        throw new Error('Basis output exceeds its decoding budget or has an empty level.');
      }

      const destination = new Uint8Array(length);

      if (!file.transcodeImage(destination, level, 0, 0, request.target, 0, -1, -1)) {
        throw new Error(`Basis failed to transcode level ${level}.`);
      }

      levels.push(destination);
      // Yield between mips so cancellation can be observed without terminating unrelated requests.
      await yieldToMessages();
    }

    if (!state.cancelled) {
      worker.postMessage(
        { kind: 'result', id: request.id, levels },
        levels.map(level => level.buffer),
      );
    }
  } catch (error) {
    if (!state.cancelled) {
      worker.postMessage({ kind: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
    }
  } finally {
    file?.close();
    file?.delete();
    active.delete(request.id);
  }
};

worker.onmessage = ({ data }) => {
  if (data.kind === 'cancel') {
    const state = active.get(data.id);

    if (state !== undefined) {
      state.cancelled = true;
    }
  } else if (data.kind === 'init') {
    void initialize().then(
      () => worker.postMessage({ kind: 'ready' }),
      error => worker.postMessage({ kind: 'fatal', message: error instanceof Error ? error.message : String(error) }),
    );
  } else {
    void transcode(data);
  }
};
