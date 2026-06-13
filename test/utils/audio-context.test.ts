describe('utils/audio-context', () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalOfflineAudioContext = globalThis.OfflineAudioContext;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: originalAudioContext,
    });

    Object.defineProperty(globalThis, 'OfflineAudioContext', {
      configurable: true,
      value: originalOfflineAudioContext,
    });

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('does not create audio contexts or register interaction listeners on import', async () => {
    let audioContextCreations = 0;
    let offlineAudioContextCreations = 0;

    class TestAudioContext {
      public state: AudioContextState = 'suspended';
      public currentTime = 0;
      public sampleRate = 44100;
      public destination = {};

      public constructor() {
        audioContextCreations++;
      }

      public resume(): Promise<void> {
        this.state = 'running';

        return Promise.resolve();
      }
    }

    class TestOfflineAudioContext {
      public constructor() {
        offlineAudioContextCreations++;
      }
    }

    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: TestAudioContext,
    });

    Object.defineProperty(globalThis, 'OfflineAudioContext', {
      configurable: true,
      value: TestOfflineAudioContext,
    });

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    await import('#audio/audio-context');

    expect(audioContextCreations).toBe(0);
    expect(offlineAudioContextCreations).toBe(0);
    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it('creates the audio context lazily when a ready subscriber is added', async () => {
    let audioContextCreations = 0;

    class TestAudioContext {
      public state: AudioContextState = 'suspended';
      public currentTime = 0;
      public sampleRate = 44100;
      public destination = {};

      public constructor() {
        audioContextCreations++;
      }

      public resume(): Promise<void> {
        this.state = 'running';

        return Promise.resolve();
      }
    }

    class TestOfflineAudioContext {}

    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: TestAudioContext,
    });

    Object.defineProperty(globalThis, 'OfflineAudioContext', {
      configurable: true,
      value: TestOfflineAudioContext,
    });

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    const { onAudioContextReady } = await import('#audio/audio-context');

    onAudioContextReady.once(() => undefined);

    expect(audioContextCreations).toBe(1);
    expect(addEventListenerSpy).toHaveBeenCalled();
  });

  it('registers keydown alongside pointer events as an unlock gesture', async () => {
    class TestAudioContext {
      public state: AudioContextState = 'suspended';
      public currentTime = 0;
      public sampleRate = 44100;
      public destination = {};

      public resume(): Promise<void> {
        this.state = 'running';

        return Promise.resolve();
      }
    }

    class TestOfflineAudioContext {}

    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: TestAudioContext,
    });

    Object.defineProperty(globalThis, 'OfflineAudioContext', {
      configurable: true,
      value: TestOfflineAudioContext,
    });

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    const { onAudioContextReady } = await import('#audio/audio-context');

    onAudioContextReady.once(() => undefined);

    const registeredEvents = addEventListenerSpy.mock.calls.map(call => call[0]);

    // keydown lets keyboard-only apps unlock audio (previously pointer-only).
    expect(registeredEvents).toContain('keydown');
    expect(registeredEvents).toContain('mousedown');
  });
});
