import { AssetDecodeError } from '#assets/AssetDecodeError';
import type { AssetDependencyScope, AssetFactoryContext } from '#assets/AssetFactory';
import type { SoundAssetOptions } from '#assets/factories/SoundFactory';
import { SoundFactory } from '#assets/factories/SoundFactory';
import { Sound } from '#audio/Sound';

import { factoryContext } from './factory-context';

// SoundFactory.create() decodes bytes via the shared OfflineAudioContext
// (`decodeAudioData` from '#audio/audio-context'). jsdom has no real audio
// decoder, so the module is mocked wholesale - mirroring the `{ duration }`
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

  test('create() decodes the buffer and resolves with a Sound', async () => {
    const factory = new SoundFactory();
    const buffer = new ArrayBuffer(8);

    const sound = await factory.create(buffer, factoryContext());

    expect(sound).toBeInstanceOf(Sound);
    expect(decodeAudioDataMock).toHaveBeenCalledWith(buffer);
    expect(sound.duration).toBe(2);
  });

  test('create() forwards playbackOptions to the Sound', async () => {
    const factory = new SoundFactory();

    const sound = await factory.create(
      new ArrayBuffer(8),
      factoryContext({
        playbackOptions: { volume: 0.6, loop: true },
      }),
    );

    expect(sound.volume).toBe(0.6);
    expect(sound.loop).toBe(true);
  });

  test('create() forwards a custom poolSize', async () => {
    const factory = new SoundFactory();

    const sound = await factory.create(new ArrayBuffer(8), factoryContext({ poolSize: 3 }));

    expect(sound.poolSize).toBe(3);
  });

  test('create() forwards sprite definitions', async () => {
    const factory = new SoundFactory();

    const sound = await factory.create(
      new ArrayBuffer(8),
      factoryContext({
        sprites: { hit: { start: 0, end: 1 } },
      }),
    );

    // Sprites don't expose a public getter - exercised indirectly by asserting
    // construction with a valid sprite definition does not throw, and that an
    // out-of-range sprite (end exceeds the decoded 2s buffer) does.
    expect(sound).toBeInstanceOf(Sound);
  });

  test('create() rejects when a sprite definition exceeds the decoded buffer duration', async () => {
    const factory = new SoundFactory();

    await expect(
      factory.create(
        new ArrayBuffer(8),
        factoryContext({
          sprites: { tooLong: { start: 0, end: 999 } },
        }),
      ),
    ).rejects.toThrow();
  });

  test('create() wraps decode errors with a kind-mismatch hint, preserving the original as .cause', async () => {
    const decodeError = new Error('corrupt audio data');
    decodeAudioDataMock.mockRejectedValueOnce(decodeError);
    const factory = new SoundFactory();

    const promise = factory.create(new ArrayBuffer(8), factoryContext());

    await expect(promise).rejects.toThrow(
      'Failed to decode audio data: corrupt audio data (if loaded as the wrong asset type, this file may not be an audio format at all).',
    );
    await expect(promise).rejects.toMatchObject({ cause: decodeError });
    await expect(promise).rejects.toBeInstanceOf(AssetDecodeError);
    await expect(promise).rejects.toMatchObject({ assetType: 'sound' });
  });
});

describe('SoundFactory - sprite sidecar', () => {
  afterEach(() => {
    decodeAudioDataMock.mockClear();
  });

  /** A dependency scope that answers one `json` load with `payload`. */
  const sidecarContext = (sidecar: string, payload: unknown): AssetFactoryContext<SoundAssetOptions> => {
    const load = vi.fn(async () => payload);

    return factoryContext<SoundAssetOptions>(
      { sprites: sidecar },
      {
        dependencies: { load, get: vi.fn(), createScope: vi.fn() } as unknown as AssetDependencyScope,
      },
    );
  };

  test('a string sprites option is loaded through the sound own dependency scope', async () => {
    const context = sidecarContext('sfx.sprites.json', { impact: { start: 0.5, end: 0.8 }, hum: { start: 1, end: 1.5, loop: true } });

    const sound = await new SoundFactory().create(new ArrayBuffer(8), context);

    expect(sound.hasSprite('impact')).toBe(true);
    expect(sound.sprite('hum').loop).toBe(true);
    expect(context.dependencies.load).toHaveBeenCalledTimes(1);
  });

  test('a sidecar that is not an object mapping names to clips is a decode failure', async () => {
    await expect(new SoundFactory().create(new ArrayBuffer(8), sidecarContext('sfx.json', [1, 2, 3]))).rejects.toBeInstanceOf(AssetDecodeError);
    await expect(new SoundFactory().create(new ArrayBuffer(8), sidecarContext('sfx.json', { impact: 3 }))).rejects.toThrow(/is not a clip object/);
    await expect(new SoundFactory().create(new ArrayBuffer(8), sidecarContext('sfx.json', { impact: { start: 0, end: 'x' } }))).rejects.toThrow(
      /finite "start" and "end" times/,
    );
  });

  test('a clip only the buffer duration can reject is reported against the sidecar, not the caller', async () => {
    const promise = new SoundFactory().create(new ArrayBuffer(8), sidecarContext('sfx.json', { tail: { start: 0, end: 99 } }));

    await expect(promise).rejects.toBeInstanceOf(AssetDecodeError);
    await expect(promise).rejects.toThrow(/Invalid sound sprite sheet "sfx\.json"/);
  });

  test('an inline sprite map still reaches the Sound unchanged', async () => {
    const sound = await new SoundFactory().create(new ArrayBuffer(8), factoryContext<SoundAssetOptions>({ sprites: { hit: { start: 0, end: 1 } } }));

    expect(sound.hasSprite('hit')).toBe(true);
  });
});
