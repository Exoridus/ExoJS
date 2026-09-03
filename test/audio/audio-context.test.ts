import { AudioUnsupportedError } from '#audio/AudioUnsupportedError';

import { mutable } from '../support/mutable';
/**
 * Focused unit tests for `src/audio/audio-context.ts` - the lazy singleton
 * AudioContext/OfflineAudioContext, and the `onAudioContextReady` unlock
 * machinery (statechange listener + interaction-gesture fallback).
 *
 * `test/utils/audio-context.test.ts` already covers the "no eager creation on
 * import" and "lazy creation on subscribe" contracts using a fresh module per
 * test (`vi.resetModules()` + dynamic `import('#audio/audioContext')`); this
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

    const { getAudioContext } = await import('#audio/audioContext');
    expect(() => getAudioContext()).toThrow(new AudioUnsupportedError('AudioContext'));
  });

  it('getOfflineAudioContext() throws when OfflineAudioContext is unsupported', async () => {
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: undefined });

    const { getOfflineAudioContext } = await import('#audio/audioContext');
    expect(() => getOfflineAudioContext()).toThrow(new AudioUnsupportedError('OfflineAudioContext'));
  });

  it('decodeAudioData() rejects when OfflineAudioContext is unsupported', async () => {
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: undefined });

    const { decodeAudioData } = await import('#audio/audioContext');
    await expect(decodeAudioData(new ArrayBuffer(0))).rejects.toThrow(new AudioUnsupportedError('OfflineAudioContext'));
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

    const { getOfflineAudioContext } = await import('#audio/audioContext');

    const first = getOfflineAudioContext();
    const second = getOfflineAudioContext();

    expect(second).toBe(first);
    // Decoding must NOT force a live AudioContext into existence - it falls back
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

  /** A minimal AudioContext double supporting `addEventListener('statechange', ...)` and a real resume(). */
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

    /** Real browsers fire `statechange` once `resume()` settles - mirrored here. */
    public resume(): Promise<void> {
      this.state = 'running';
      for (const cb of this._listeners.get('statechange') ?? []) cb();
      return Promise.resolve();
    }
  }

  /**
   * Like {@link UnlockableAudioContext}, but also supports simulating an
   * externally-driven suspension (i.e. NOT caused by ExoJS calling
   * `resume()`) - the browser flips `state` back to `'suspended'` on its
   * own and fires `statechange`, exactly as iOS does on an audio session
   * interruption or as a bfcache restore can.
   */
  class InterruptibleAudioContext {
    public state: AudioContextState;
    public currentTime = 0;
    public sampleRate = 44100;
    public destination = {};
    public resumeCallCount = 0;
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

    public resume(): Promise<void> {
      this.resumeCallCount++;
      this.state = 'running';

      for (const cb of this._listeners.get('statechange') ?? []) cb();

      return Promise.resolve();
    }

    public simulateExternalSuspend(): void {
      this.state = 'suspended';

      for (const cb of this._listeners.get('statechange') ?? []) cb();
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

    const { getAudioContext, onAudioContextReady, isAudioContextReady } = await import('#audio/audioContext');

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

    const { getAudioContext, onAudioContextReady } = await import('#audio/audioContext');

    const readyHandler = vi.fn();
    onAudioContextReady.once(readyHandler);
    getAudioContext();

    // The first event's resume() call flips `state` to 'running' synchronously
    // (its Promise settles later), so a second interaction dispatched in the
    // same tick - before that microtask runs - takes the "already running"
    // branch of onUserInteraction() instead of calling resume() again.
    document.dispatchEvent(new MouseEvent('mousedown'));
    document.dispatchEvent(new Event('touchstart'));

    expect(readyHandler).toHaveBeenCalledTimes(1);

    // Let the first resume().then() microtask flush too - it re-invokes
    // dispatchReadyIfRunning(), which is a safe no-op the second time.
    await Promise.resolve();
    await Promise.resolve();
    expect(readyHandler).toHaveBeenCalledTimes(1);
  });

  it('addInteractionListeners()/removeInteractionListeners() no-op when `document` is unavailable', async () => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: UnlockableAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: class {} });

    const { getAudioContext, onAudioContextReady } = await import('#audio/audioContext');

    // First ensure monitoring starts with `document` available (adds the
    // interaction listeners for real), then remove `document` before the
    // successful unlock fires - exercising the second operand of
    // `removeInteractionListeners`'s `!interactionListenersAdded ||
    // !canUseDocument()` guard.
    onAudioContextReady.once(() => undefined);
    const ctx = getAudioContext();

    vi.stubGlobal('document', undefined);

    // Directly resolve readiness without going through a DOM event (document
    // is gone) - dispatch acts on the already-registered handlers.
    mutable(ctx).state = 'running';
    onAudioContextReady.dispatch(ctx);

    // No throw despite `document` being unavailable at cleanup time.
    expect(true).toBe(true);
  });

  it('re-arms interaction listeners and resumes again after a later suspension (iOS interruption / bfcache restore)', async () => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: InterruptibleAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: class {} });

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    const { getAudioContext, onAudioContextReady } = await import('#audio/audioContext');

    const readyHandler = vi.fn();

    // `add`, not `once` - the second resume below must be observable without
    // the subscription auto-detaching after the first dispatch.
    onAudioContextReady.add(readyHandler);

    const ctx = getAudioContext() as unknown as InterruptibleAudioContext;

    // First gesture: unlocks the context and fires the public ready signal.
    document.dispatchEvent(new MouseEvent('mousedown'));
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.state).toBe('running');
    expect(ctx.resumeCallCount).toBe(1);
    expect(readyHandler).toHaveBeenCalledTimes(1);

    const mousedownListenerCountAfterFirstUnlock = addEventListenerSpy.mock.calls.filter(call => call[0] === 'mousedown').length;

    // Simulated interruption: nothing in ExoJS called resume()/suspend() -
    // the AudioContext itself dropped back to 'suspended' and fired its
    // native 'statechange' event, which the module already listens to.
    ctx.simulateExternalSuspend();

    const mousedownListenerCountAfterReArm = addEventListenerSpy.mock.calls.filter(call => call[0] === 'mousedown').length;

    // Regression check: without re-arming, no new 'mousedown' listener is
    // ever installed, so a second user gesture is silently ignored forever.
    expect(mousedownListenerCountAfterReArm).toBeGreaterThan(mousedownListenerCountAfterFirstUnlock);

    // Second gesture must actually resume the (now suspended again) context.
    document.dispatchEvent(new MouseEvent('mousedown'));
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.state).toBe('running');
    expect(ctx.resumeCallCount).toBe(2);

    // The signal dispatches once per run of the context, so a subscriber that
    // survived the interruption is told the context is usable again.
    expect(readyHandler).toHaveBeenCalledTimes(2);
  });

  it('dispatches to a handler subscribed during a re-lock window (an object constructed while audio was interrupted)', async () => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: InterruptibleAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: class {} });

    const { getAudioContext, onAudioContextReady, isAudioContextReady } = await import('#audio/audioContext');

    const ctx = getAudioContext() as unknown as InterruptibleAudioContext;

    document.dispatchEvent(new MouseEvent('mousedown'));
    await Promise.resolve();
    await Promise.resolve();
    expect(isAudioContextReady()).toBe(true);

    ctx.simulateExternalSuspend();
    expect(isAudioContextReady()).toBe(false);

    // Every deferring audio object takes this branch in its constructor: not
    // ready, so subscribe and wait for the unlock.
    const lateHandler = vi.fn(() => onAudioContextReady.remove(lateHandler));
    onAudioContextReady.add(lateHandler);

    document.dispatchEvent(new MouseEvent('mousedown'));
    await Promise.resolve();
    await Promise.resolve();

    expect(isAudioContextReady()).toBe(true);
    expect(lateHandler).toHaveBeenCalledTimes(1);
  });

  it('addInteractionListeners() is a no-op on a context created with `document` already unavailable', async () => {
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: UnlockableAudioContext });
    Object.defineProperty(globalThis, 'OfflineAudioContext', { configurable: true, value: class {} });

    const { getAudioContext, onAudioContextReady } = await import('#audio/audioContext');

    vi.stubGlobal('document', undefined);

    expect(() => {
      onAudioContextReady.once(() => undefined);
      getAudioContext();
    }).not.toThrow();
  });
});
