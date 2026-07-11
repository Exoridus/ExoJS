import { logger, LogSeverity } from '#core/logging';
import { materializeAssetBindings } from '#extensions/materialize';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader-seamless.test.ts). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

const mockFetchImage = (): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );
};

const mockFetch404 = (): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }) as Response,
  );
};

/** Collects the messages of every Warning-or-higher log entry for the duration of a test. */
function captureWarnings(): { messages: string[]; stop: () => void } {
  const messages: string[] = [];
  const remove = logger.addSink(entry => {
    if (entry.severity >= LogSeverity.Warning) messages.push(entry.message);
  });
  return { messages, stop: remove };
}

describe('Loader: silent-404 diagnostic (F7 / DX-1)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
    logger._resetOnce();
  });

  test('a typo get() that 404s warns exactly once and still returns the placeholder', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const { messages, stop } = captureWarnings();

    try {
      const handle = loader.get('typo.png'); // never preloaded — fetches the literal string

      // Placeholder behaviour is unchanged: a handle is still returned synchronously.
      expect(handle.loadState).toBe('loading');

      await expect(handle.loaded).rejects.toThrow();

      const missingWarnings = messages.filter(m => m.includes('typo.png'));
      expect(missingWarnings).toHaveLength(1);
      expect(missingWarnings[0]).toMatch(/preload|basePath|path/i);

      // Placeholder is still handed out (heal-in-place preserved).
      expect(handle.loadState).toBe('failed');
    } finally {
      stop();
    }
  });

  test('a successful get() emits no missing-source warning', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const { messages, stop } = captureWarnings();

    try {
      const handle = loader.get('ship.png');
      await handle.loaded;

      expect(messages.filter(m => m.includes('ship.png'))).toHaveLength(0);
    } finally {
      stop();
    }
  });

  test('a second get() of the same typo does not warn again', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const { messages, stop } = captureWarnings();

    try {
      const first = loader.get('typo.png');
      await expect(first.loaded).rejects.toThrow();

      // Second get() of the same failed source retries in place — must NOT re-warn.
      const second = loader.get('typo.png');
      await expect(second.loaded).rejects.toThrow();

      expect(messages.filter(m => m.includes('typo.png'))).toHaveLength(1);
    } finally {
      stop();
    }
  });

  test('a mistyped value-path get() that 404s also warns once', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const { messages, stop } = captureWarnings();

    try {
      const ref = loader.get('config.json'); // value kind → AssetRef
      await expect(ref.loaded).rejects.toThrow();

      expect(messages.filter(m => m.includes('config.json'))).toHaveLength(1);
    } finally {
      stop();
    }
  });

  test('a plain load() failure does not emit the seamless missing-source warning (caller sees the rejection)', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const { messages, stop } = captureWarnings();

    try {
      await expect(loader.load('gone.png')).rejects.toThrow();

      // load() surfaces the error to the caller, so no extra placeholder diagnostic.
      expect(messages.filter(m => m.includes('gone.png'))).toHaveLength(0);
    } finally {
      stop();
    }
  });
});

describe('Loader: silent-404 diagnostic — catalog leaves', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
    logger._resetOnce();
  });

  test('a preloaded (successful) catalog leaf emits no warning', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const { messages, stop } = captureWarnings();

    try {
      await loader.load(Assets.from({ hero: 'hero.png' }));
      expect(messages.filter(m => m.includes('hero.png'))).toHaveLength(0);
    } finally {
      stop();
    }
  });
});
