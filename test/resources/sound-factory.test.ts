import { Sound } from '#audio/Sound';
import { SoundFactory } from '#resources/factories/SoundFactory';

// SoundFactory.create() decodes bytes via the shared OfflineAudioContext
// (`decodeAudioData` from '#audio/audio-context'). jsdom has no real audio
// decoder, so the module is mocked wholesale — mirroring the `{ duration }`
// AudioBuffer stub used by test/audio/sound.test.ts, which is all `Sound`'s
// constructor actually reads. `vi.mock` factories are hoisted above imports,
// so the mock function must be created via `vi.hoisted()` to be referenced
// safely inside the factory below.
const { decodeAudioDataMock } = vi.hoisted(() => ({
  decodeAudioDataMock: vi.fn(async (): Promise<AudioBuffer> => ({ duration: 2 }) as AudioBuffer),
}));

vi.mock('#audio/audio-context', () => ({
  decodeAudioData: decodeAudioDataMock,
}));

describe('SoundFactory', () => {
  afterEach(() => {
    decodeAudioDataMock.mockClear();
  });

  test('storageName is "sound"', () => {
    const factory = new SoundFactory();
    expect(factory.storageName).toBe('sound');
  });

  test('process() reads the response body as an ArrayBuffer', async () => {
    const factory = new SoundFactory();
    const buffer = new ArrayBuffer(8);
    const response = { arrayBuffer: async () => buffer } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe(buffer);
  });

  test('create() decodes the buffer and resolves with a Sound', async () => {
    const factory = new SoundFactory();
    const buffer = new ArrayBuffer(8);

    const sound = await factory.create(buffer);

    expect(sound).toBeInstanceOf(Sound);
    expect(decodeAudioDataMock).toHaveBeenCalledWith(buffer);
    expect(sound.duration).toBe(2);
  });

  test('create() forwards playbackOptions to the Sound', async () => {
    const factory = new SoundFactory();

    const sound = await factory.create(new ArrayBuffer(8), {
      playbackOptions: { volume: 0.6, loop: true },
    });

    expect(sound.volume).toBe(0.6);
    expect(sound.loop).toBe(true);
  });

  test('create() forwards a custom poolSize', async () => {
    const factory = new SoundFactory();

    const sound = await factory.create(new ArrayBuffer(8), { poolSize: 3 });

    expect(sound.poolSize).toBe(3);
  });

  test('create() forwards sprite definitions', async () => {
    const factory = new SoundFactory();

    const sound = await factory.create(new ArrayBuffer(8), {
      sprites: { hit: { start: 0, end: 1 } },
    });

    // Sprites don't expose a public getter — exercised indirectly by asserting
    // construction with a valid sprite definition does not throw, and that an
    // out-of-range sprite (end exceeds the decoded 2s buffer) does.
    expect(sound).toBeInstanceOf(Sound);
  });

  test('create() rejects when a sprite definition exceeds the decoded buffer duration', async () => {
    const factory = new SoundFactory();

    await expect(
      factory.create(new ArrayBuffer(8), {
        sprites: { tooLong: { start: 0, end: 999 } },
      }),
    ).rejects.toThrow();
  });

  test('create() wraps decode errors with a kind-mismatch hint, preserving the original as .cause', async () => {
    const decodeError = new Error('corrupt audio data');
    decodeAudioDataMock.mockRejectedValueOnce(decodeError);
    const factory = new SoundFactory();

    const promise = factory.create(new ArrayBuffer(8));

    await expect(promise).rejects.toThrow(
      'Failed to decode audio data: corrupt audio data (if loaded with the wrong Asset.kind, this file may not be an audio format at all).',
    );
    await expect(promise).rejects.toMatchObject({ cause: decodeError });
  });
});
