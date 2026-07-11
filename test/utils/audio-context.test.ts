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

  it('does NOT create the audio context when a ready subscriber is added — only registers interaction listeners, deferring creation to the first user gesture (AU2)', async () => {
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

    // A suspended live AudioContext must not be spawned before a user gesture —
    // subscribing only wires up the interaction listeners (AU2).
    expect(audioContextCreations).toBe(0);
    expect(addEventListenerSpy).toHaveBeenCalled();

    // The first gesture is what finally creates and resumes the live context.
    document.dispatchEvent(new MouseEvent('mousedown'));
    expect(audioContextCreations).toBe(1);
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
