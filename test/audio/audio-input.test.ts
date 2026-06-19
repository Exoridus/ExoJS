import { getAudioContext } from '#audio/audio-context';
import { AudioAnalyser } from '#audio/AudioAnalyser';
import { AudioInput } from '#audio/AudioInput';
import { AudioManager } from '#audio/AudioManager';
import type { InputVoice } from '#audio/InputVoice';
import { Sound } from '#audio/Sound';

// ---------------------------------------------------------------------------
// Mocks: getUserMedia / MediaStream / MediaRecorder (jsdom has none)
// ---------------------------------------------------------------------------

const makeStream = (): MediaStream => {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return { getTracks: () => tracks } as unknown as MediaStream;
};

const stubGetUserMedia = (stream: MediaStream): MockInstance => {
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  return getUserMedia;
};

class MockMediaRecorder {
  public state: 'inactive' | 'recording' = 'inactive';
  public mimeType = 'audio/webm';
  private readonly _handlers: Record<string, Array<(event: { data: Blob }) => void>> = {};

  public constructor(public stream: MediaStream) {}

  public addEventListener(type: string, handler: (event: { data: Blob }) => void): void {
    (this._handlers[type] ??= []).push(handler);
  }

  public start(): void {
    this.state = 'recording';
  }

  public stop(): void {
    this.state = 'inactive';
    for (const h of this._handlers['dataavailable'] ?? []) h({ data: new Blob(['chunk']) });
    for (const h of this._handlers['stop'] ?? []) (h as unknown as () => void)();
  }
}

describe('AudioInput / InputVoice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('AudioInput.open requests the mic and exposes the stream', async () => {
    const stream = makeStream();
    const getUserMedia = stubGetUserMedia(stream);

    const input = await AudioInput.open({ echoCancellation: true });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true } });
    expect(input.stream).toBe(stream);
  });

  test('AudioInput.close stops every track', async () => {
    const stream = makeStream();
    stubGetUserMedia(stream);

    const input = await AudioInput.open();
    input.close();

    for (const track of stream.getTracks()) {
      expect(track.stop).toHaveBeenCalled();
    }
  });

  test('manager.open creates a MediaStreamSource and returns a live, analysis-only voice', async () => {
    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();

    const manager = new AudioManager();
    const ctx = getAudioContext();
    const sourceSpy = vi.spyOn(ctx, 'createMediaStreamSource');

    const voice = manager.open(input);

    expect(sourceSpy).toHaveBeenCalledWith(stream);
    expect(voice.ended).toBe(false);
    // Analysis-only: routing to a bus does not throw and is opt-in.
    expect(() => voice.routeTo(manager.master)).not.toThrow();

    voice.stop();
  });

  test('analyse() taps the voice into an AudioAnalyser', async () => {
    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input);

    const analyser = new AudioAnalyser();
    voice.analyse(analyser);
    expect(analyser.source).toBe(voice);

    analyser.destroy();
    voice.stop();
  });

  test('an input voice is spatializable', async () => {
    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const ctx = getAudioContext();
    const pannerSpy = vi.spyOn(ctx, 'createPanner');

    const voice = manager.open(input) as InputVoice;
    voice.position = { x: 3, y: 4 };

    expect(pannerSpy).toHaveBeenCalledTimes(1);
    expect(voice.position?.x).toBe(3);

    pannerSpy.mockRestore();
    voice.stop();
  });

  test('record() captures the stream into a playable Sound', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input);

    const promise = voice.record(50);
    await vi.advanceTimersByTimeAsync(60);
    const sound = await promise;

    expect(sound).toBeInstanceOf(Sound);

    vi.useRealTimers();
    voice.stop();
  });
});
