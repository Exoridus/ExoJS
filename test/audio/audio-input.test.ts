import { getAudioContext } from '#audio/audio-context';
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
  public static instances: MockMediaRecorder[] = [];

  public state: 'inactive' | 'recording' = 'inactive';
  public mimeType = 'audio/webm';
  private readonly _handlers: Record<string, Array<(event: { data: Blob }) => void>> = {};

  public constructor(public stream: MediaStream) {
    MockMediaRecorder.instances.push(this);
  }

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

  /** Test-only helper: fire the 'error' listeners without ever reaching 'stop'. */
  public triggerError(): void {
    for (const h of this._handlers['error'] ?? []) (h as unknown as () => void)();
  }

  /** Test-only helper: fire a raw 'dataavailable' event with arbitrary data. */
  public triggerDataAvailable(data: Blob): void {
    for (const h of this._handlers['dataavailable'] ?? []) h({ data });
  }
}

describe('AudioInput / InputVoice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    MockMediaRecorder.instances.length = 0;
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

  test('exposes an output node to tap for analysis', async () => {
    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input);

    // The output node is the analysis tap (e.g. new AudioAnalyser({ source: voice })).
    expect(voice.output).toBeDefined();
    expect(typeof (voice.output as unknown as { connect: unknown }).connect).toBe('function');

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

  test('routeTo() on an already-ended voice is a no-op', async () => {
    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input) as InputVoice;

    voice.stop();
    expect(voice.ended).toBe(true);

    const busBefore = voice.bus;
    expect(voice.routeTo(manager.master)).toBe(voice);
    expect(voice.bus).toBe(busBefore);
  });

  test('record() falls back to "audio/webm" when the recorder reports no mimeType', async () => {
    vi.useFakeTimers();
    class NoMimeTypeRecorder extends MockMediaRecorder {
      public override mimeType = '';
    }
    vi.stubGlobal('MediaRecorder', NoMimeTypeRecorder);

    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input);

    const promise = voice.record(10);
    await vi.advanceTimersByTimeAsync(20);
    const sound = await promise;

    expect(sound).toBeInstanceOf(Sound);

    vi.useRealTimers();
    voice.stop();
  });

  test('record() skips calling stop() again if the recorder already stopped itself', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input);

    const promise = voice.record(50);
    const recorder = MockMediaRecorder.instances[0]!;
    const stopSpy = vi.spyOn(recorder, 'stop');

    // The recorder stops itself (e.g. the track ended) before the timeout fires.
    recorder.stop();
    stopSpy.mockClear();

    await vi.advanceTimersByTimeAsync(60);
    await promise;

    // The timeout guard sees state === 'inactive' already and does not call stop() again.
    expect(stopSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
    voice.stop();
  });

  test('record() ignores empty "dataavailable" chunks', async () => {
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input);

    const promise = voice.record(1000);
    const recorder = MockMediaRecorder.instances[0]!;

    // Empty chunk: the size === 0 guard skips pushing it into the buffer.
    recorder.triggerDataAvailable(new Blob([]));
    recorder.stop();

    const sound = await promise;
    expect(sound).toBeInstanceOf(Sound);

    voice.stop();
  });

  test('record() rejects when the recorder reports an error', async () => {
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input);

    const promise = voice.record(1000);
    const recorder = MockMediaRecorder.instances[0]!;
    recorder.triggerError();

    await expect(promise).rejects.toThrow('Recording failed.');

    voice.stop();
  });

  test('record() wraps a real Error thrown while decoding and rejects with it', async () => {
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    const decodeError = new Error('decode boom');
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockRejectedValue(decodeError);

    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input);

    const promise = voice.record(1000);
    const recorder = MockMediaRecorder.instances[0]!;
    recorder.stop();

    await expect(promise).rejects.toBe(decodeError);

    voice.stop();
  });

  test('record() wraps a non-Error rejection while decoding into a new Error', async () => {
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    // Deliberately a non-Error rejection, to exercise the `error instanceof Error` false branch.
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockRejectedValue('decode boom string');

    const stream = makeStream();
    stubGetUserMedia(stream);
    const input = await AudioInput.open();
    const manager = new AudioManager();
    const voice = manager.open(input);

    const promise = voice.record(1000);
    const recorder = MockMediaRecorder.instances[0]!;
    recorder.stop();

    await expect(promise).rejects.toThrow('decode boom string');

    voice.stop();
  });

  // ---------------------------------------------------------------------------
  // AudioInput.open() — constraint forwarding and environment guard
  // ---------------------------------------------------------------------------

  test('open() throws when navigator is undefined', async () => {
    vi.stubGlobal('navigator', undefined);

    await expect(AudioInput.open()).rejects.toThrow('AudioInput.open: getUserMedia is not available in this environment.');
  });

  test('open() throws when navigator.mediaDevices.getUserMedia is unavailable', async () => {
    vi.stubGlobal('navigator', { mediaDevices: {} });

    await expect(AudioInput.open()).rejects.toThrow('AudioInput.open: getUserMedia is not available in this environment.');
  });

  test('open() forwards deviceId to the getUserMedia constraints', async () => {
    const stream = makeStream();
    const getUserMedia = stubGetUserMedia(stream);

    await AudioInput.open({ deviceId: 'mic-2' });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: 'mic-2' } });
  });

  test('open() forwards noiseSuppression to the getUserMedia constraints', async () => {
    const stream = makeStream();
    const getUserMedia = stubGetUserMedia(stream);

    await AudioInput.open({ noiseSuppression: true });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: { noiseSuppression: true } });
  });

  test('open() forwards autoGainControl to the getUserMedia constraints', async () => {
    const stream = makeStream();
    const getUserMedia = stubGetUserMedia(stream);

    await AudioInput.open({ autoGainControl: false });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: { autoGainControl: false } });
  });

  test('open() with no constraint options passes audio: true', async () => {
    const stream = makeStream();
    const getUserMedia = stubGetUserMedia(stream);

    await AudioInput.open();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  });
});
