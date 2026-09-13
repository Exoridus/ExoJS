/**
 * `InlineWorker`'s object-URL lifetime and error contract, which a real Worker
 * cannot observe: jsdom provides neither `Worker` nor `URL.createObjectURL`, so
 * both are installed here and the round trip is covered by
 * `test/core/browser/inline-worker.test.ts` instead.
 */
import { InlineWorker } from '#core/InlineWorker';

interface UrlStub {
  created: Array<{ blob: Blob; url: string }>;
  revoked: string[];
}

interface WorkerStub {
  constructed: Array<{ url: string; options: WorkerOptions | undefined }>;
  posted: Array<{ message: unknown; transfer: Transferable[] | undefined }>;
  terminateCount: number;
}

let urls: UrlStub;
let workers: WorkerStub;

const installUrlStub = (): void => {
  urls = { created: [], revoked: [] };

  URL.createObjectURL = (blob: Blob): string => {
    const url = `blob:stub/${urls.created.length}`;

    urls.created.push({ blob, url });

    return url;
  };

  URL.revokeObjectURL = (url: string): void => {
    urls.revoked.push(url);
  };
};

const installWorkerStub = (construct?: () => never): void => {
  workers = { constructed: [], posted: [], terminateCount: 0 };

  class WorkerDouble {
    public constructor(url: string, options?: WorkerOptions) {
      workers.constructed.push({ url, options });
      construct?.();
    }

    public postMessage(message: unknown, transfer?: Transferable[]): void {
      workers.posted.push({ message, transfer });
    }

    public terminate(): void {
      workers.terminateCount++;
    }
  }

  vi.stubGlobal('Worker', WorkerDouble);
};

describe('InlineWorker', () => {
  beforeEach(() => {
    installUrlStub();
    installWorkerStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  test('starts the worker from a JavaScript blob of the given source', async () => {
    const inline = new InlineWorker('self.onmessage = () => {};');

    expect(urls.created).toHaveLength(1);
    expect(urls.created[0]!.blob.type).toBe('text/javascript');
    await expect(urls.created[0]!.blob.text()).resolves.toBe('self.onmessage = () => {};');
    expect(workers.constructed).toEqual([{ url: urls.created[0]!.url, options: undefined }]);

    inline.destroy();
  });

  test('revokes the object URL as soon as the worker is constructed', () => {
    const inline = new InlineWorker('');

    expect(urls.revoked).toEqual([urls.created[0]!.url]);

    inline.destroy();
  });

  test('passes a requested name to the worker and omits the options object otherwise', () => {
    new InlineWorker('', { name: 'chunk-sampler' }).destroy();

    expect(workers.constructed[0]!.options).toEqual({ name: 'chunk-sampler' });
  });

  test('revokes the object URL and names the CSP cause when construction fails', () => {
    const failure = new DOMException('blocked', 'SecurityError');

    installWorkerStub(() => {
      throw failure;
    });

    expect(() => new InlineWorker('')).toThrow(/Content-Security-Policy/);
    expect(urls.revoked).toEqual([urls.created[0]!.url]);

    try {
      new InlineWorker('');
    } catch (error) {
      expect((error as Error).cause).toBe(failure);
    }
  });

  test('reports an environment without workers before building a blob', () => {
    vi.stubGlobal('Worker', undefined);

    expect(() => new InlineWorker('', { name: 'sampler' })).toThrow(/"sampler".*no Worker constructor/);
    expect(urls.created).toHaveLength(0);
  });

  test('forwards messages and transfer lists', () => {
    const inline = new InlineWorker('');
    const buffer = new ArrayBuffer(8);

    inline.postMessage({ id: 1 });
    inline.postMessage({ id: 2 }, [buffer]);

    expect(workers.posted).toEqual([
      { message: { id: 1 }, transfer: undefined },
      { message: { id: 2 }, transfer: [buffer] },
    ]);

    inline.destroy();
  });

  test('rejects posting after destroy instead of dropping the message', () => {
    const inline = new InlineWorker('', { name: 'sampler' });

    inline.destroy();

    expect(() => inline.postMessage({})).toThrow(/"sampler" was destroyed/);
    expect(workers.posted).toHaveLength(0);
  });

  test('terminates once however often destroy is called', () => {
    const inline = new InlineWorker('');

    expect(inline.destroyed).toBe(false);

    inline.destroy();
    inline.destroy();

    expect(inline.destroyed).toBe(true);
    expect(workers.terminateCount).toBe(1);
  });
});
