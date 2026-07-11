/**
 * Focused unit tests for `src/audio/audio-context.ts` — the lazy singleton
 * AudioContext/OfflineAudioContext, and the `onAudioContextReady` unlock
 * machinery (statechange listener + interaction-gesture fallback).
 *
 * `test/utils/audio-context.test.ts` already covers the "no eager creation on
 * import" and "lazy creation on subscribe" contracts using a fresh module per
 * test (`vi.resetModules()` + dynamic `import('#audio/audio-context')`); this
 * file follows the same pattern to reach the remaining branches: unsupported
 * environments, the statechange listener, the interaction-gesture unlock
 * round-trip, and the public `getOfflineAudioContext()` wrapper.
 */

describe('audio/audio-context — unsupported environments', () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalOfflineAudioContext = globalThis.OfflineAudioContext;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: originalAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: originalOfflineAudioContext });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('getAudioContext() throws when AudioContext is unsupported', async () => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: undefined });

    const { getAudioContext } = await import('#audio/audio-context');
    expect(() => getAudioContext()).toThrow('This environment does not support AudioContext.');
  });

  it('getOfflineAudioContext() throws when OfflineAudioContext is unsupported', async () => {
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: undefined });

    const { getOfflineAudioContext } = await import('#audio/audio-context');
    expect(() => getOfflineAudioContext()).toThrow('This environment does not support OfflineAudioContext.');
  });

  it('decodeAudioData() rejects when OfflineAudioContext is unsupported', async () => {
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: undefined });

    const { decodeAudioData } = await import('#audio/audio-context');
    await expect(decodeAudioData(new ArrayBuffer(0))).rejects.toThrow('This environment does not support OfflineAudioContext.');
  });
});

describe('audio/audio-context — getOfflineAudioContext()', () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalOfflineAudioContext = globalThis.OfflineAudioContext;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: originalAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: originalOfflineAudioContext });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns a lazily-created singleton, reused across repeated calls, WITHOUT spawning a live context (AU2)', async () => {
    let audioContextCreations = 0;
    let offlineCreations = 0;

    class TestAudioContext {
      public state: AudioContextState = 'running';
      public currentTime = 0;
      public sampleRate = 44100;
      public destination = {};
      public constructor() {
        audioContextCreations++;
      }
    }
    class TestOfflineAudioContext {
      public constructor(
        public numberOfChannels: number,
        public length: number,
        public sampleRate: number,
      ) {
        offlineCreations++;
      }
      public decodeAudioData(): Promise<AudioBuffer> {
        return Promise.resolve({} as AudioBuffer);
      }
    }

    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: TestAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: TestOfflineAudioContext });

    const { getOfflineAudioContext } = await import('#audio/audio-context');

    const first = getOfflineAudioContext();
    const second = getOfflineAudioContext();

    expect(second).toBe(first);
    // Decoding must NOT force a live AudioContext into existence — it falls back
    // to the default 44.1 kHz sample rate before any gesture (AU2).
    expect(audioContextCreations).toBe(0);
    expect(offlineCreations).toBe(1);
    // The default sample rate is used when no live context exists yet.
    expect((first as unknown as { sampleRate: number }).sampleRate).toBe(44100);
  });
});

describe('audio/audio-context — interaction-gesture unlock lifecycle', () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalOfflineAudioContext = globalThis.OfflineAudioContext;

  /** A minimal AudioContext double supporting `addEventListener('statechange', …)` and a real resume(). */
  class UnlockableAudioContext {
    public state: AudioContextState;
    public currentTime = 0;
    public sampleRate = 44100;
    public destination = {};
    private readonly _listeners = new Map<string, Array<() => void>>();

    public constructor(initialState: AudioContextState = 'suspended') {
      this.state = initialState;
    }

    public addEventListener(type: string, cb: () => void): void {
      const arr = this._listeners.get(type) ?? [];
      arr.push(cb);
      this._listeners.set(type, arr);
    }

    public removeEventListener(type: string, cb: () => void): void {
      const arr = this._listeners.get(type);
      if (!arr) return;
      const index = arr.indexOf(cb);
      if (index !== -1) arr.splice(index, 1);
    }

    /** Real browsers fire `statechange` once `resume()` settles — mirrored here. */
    public resume(): Promise<void> {
      this.state = 'running';
      for (const cb of this._listeners.get('statechange') ?? []) cb();
      return Promise.resolve();
    }
  }

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: originalAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: originalOfflineAudioContext });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('registers a statechange listener once, adds interaction listeners while suspended, and unlocks on a user gesture', async () => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: UnlockableAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: class {} });

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    const { getAudioContext, onAudioContextReady, isAudioContextReady } = await import('#audio/audio-context');

    const readyHandler = vi.fn();
    onAudioContextReady.once(readyHandler);
    const ctx = getAudioContext();

    expect(isAudioContextReady()).toBe(false);
    // Calling getAudioContext() a second time while still suspended re-enters
    // ensureAudioContextReadyMonitoring(): the statechange listener is only
    // registered once, and addInteractionListeners() is now a no-op (already added).
    getAudioContext();

    const registeredEvents = addEventListenerSpy.mock.calls.map(call => call[0]);
    expect(registeredEvents).toContain('mousedown');
    expect(registeredEvents).toContain('touchstart');
    expect(registeredEvents).toContain('touchend');
    expect(registeredEvents).toContain('keydown');
    // Each interaction event is only registered once even though monitoring
    // was (re-)ensured twice.
    expect(registeredEvents.filter(e => e === 'mousedown').length).toBe(1);

    // Simulate the user gesture: dispatching 'mousedown' resumes the context,
    // which fires 'statechange' (registered by ensureAudioContextReadyMonitoring),
    // which re-dispatches readiness.
    document.dispatchEvent(new MouseEvent('mousedown'));
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.state).toBe('running');
    expect(isAudioContextReady()).toBe(true);
    expect(readyHandler).toHaveBeenCalledTimes(1);
    expect(readyHandler).toHaveBeenCalledWith(ctx);

    // The interaction listeners were removed once the context became ready.
    const removedEvents = removeEventListenerSpy.mock.calls.map(call => call[0]);
    expect(removedEvents).toContain('mousedown');
    expect(removedEvents).toContain('keydown');
  });

  it('a second interaction event arriving synchronously after the first sees the context already running', async () => {
    // Deliberately no addEventListener/statechange support here: unlike
    // UnlockableAudioContext, resume() must NOT synchronously cascade into
    // removing the interaction listeners, so a second event dispatched in the
    // same synchronous tick still finds them registered.
    class PlainSuspendedAudioContext {
      public state: AudioContextState = 'suspended';
      public currentTime = 0;
      public sampleRate = 44100;
      public destination = {};
      public resume(): Promise<void> {
        this.state = 'running'; // set synchronously, like a real AudioContext
        return Promise.resolve();
      }
    }
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: PlainSuspendedAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: class {} });

    const { getAudioContext, onAudioContextReady } = await import('#audio/audio-context');

    const readyHandler = vi.fn();
    onAudioContextReady.once(readyHandler);
    getAudioContext();

    // The first event's resume() call flips `state` to 'running' synchronously
    // (its Promise settles later), so a second interaction dispatched in the
    // same tick — before that microtask runs — takes the "already running"
    // branch of onUserInteraction() instead of calling resume() again.
    document.dispatchEvent(new MouseEvent('mousedown'));
    document.dispatchEvent(new Event('touchstart'));

    expect(readyHandler).toHaveBeenCalledTimes(1);

    // Let the first resume().then() microtask flush too — it re-invokes
    // dispatchReadyIfRunning(), which is a safe no-op the second time.
    await Promise.resolve();
    await Promise.resolve();
    expect(readyHandler).toHaveBeenCalledTimes(1);
  });

  it('addInteractionListeners()/removeInteractionListeners() no-op when `document` is unavailable', async () => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: UnlockableAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: class {} });

    const { getAudioContext, onAudioContextReady } = await import('#audio/audio-context');

    // First ensure monitoring starts with `document` available (adds the
    // interaction listeners for real), then remove `document` before the
    // successful unlock fires — exercising the second operand of
    // `removeInteractionListeners`'s `!interactionListenersAdded ||
    // !canUseDocument()` guard.
    onAudioContextReady.once(() => undefined);
    const ctx = getAudioContext();

    vi.stubGlobal('document', undefined);

    // Directly resolve readiness without going through a DOM event (document
    // is gone) — dispatch acts on the already-registered handlers.
    ctx.state = 'running';
    onAudioContextReady.dispatch(ctx);

    // No throw despite `document` being unavailable at cleanup time.
    expect(true).toBe(true);
  });

  it('addInteractionListeners() is a no-op on a context created with `document` already unavailable', async () => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: UnlockableAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: class {} });

    const { getAudioContext, onAudioContextReady } = await import('#audio/audio-context');

    vi.stubGlobal('document', undefined);

    expect(() => {
      onAudioContextReady.once(() => undefined);
      getAudioContext();
    }).not.toThrow();
  });
});
