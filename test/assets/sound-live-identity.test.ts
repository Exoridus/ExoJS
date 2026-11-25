import { MemoryCacheStore } from '#assets/cache/MemoryCacheStore';
import { Loader } from '#assets/Loader';
import { soundType } from '#assets/types/media';
import { Sound } from '#audio/Sound';
import { materializeAssetTypes } from '#extensions/materialize';

const { decode } = vi.hoisted(() => ({
  decode: vi.fn(async (): Promise<AudioBuffer> => ({ duration: 3 }) as AudioBuffer),
}));

vi.mock('#audio/audioContext', () => ({ decodeAudioData: decode }));

const createLoader = (): { loader: Loader; fetchBytes: ReturnType<typeof vi.fn> } => {
  const loader = new Loader({ basePath: '/', cache: new MemoryCacheStore() });
  const fetchBytes = vi.fn(async () => new Response(new ArrayBuffer(4)));
  vi.stubGlobal('fetch', fetchBytes);
  materializeAssetTypes(loader, [soundType]);

  return { loader, fetchBytes };
};

afterEach(() => {
  decode.mockClear();
  vi.unstubAllGlobals();
});

describe('path-backed sound sprite identity', () => {
  test('different sprite tables reuse cached bytes while equivalent options keep one resource', async () => {
    const { loader, fetchBytes } = createLoader();
    const scope = loader.createScope();
    const source = 'sample.wav';
    const aSprites = { a: { start: 0, end: 1 } };
    const bSprites = { b: { start: 1, end: 2 } };
    const a = new Sound(source, { sprites: aSprites });
    const b = new Sound(source, { sprites: bSprites });
    const aDescriptor = { type: 'sound', source, sprites: { a: { end: 1, loop: false, start: 0 } } } as const;
    const bDescriptor = { type: 'sound', source, sprites: bSprites } as const;

    try {
      const aIdentity = loader.identify(aDescriptor);
      const bIdentity = loader.identify(bDescriptor);
      const plain = { type: 'sound', source } as const;
      expect(aIdentity.sourceKey).toBe(bIdentity.sourceKey);
      expect(aIdentity.resourceKey).not.toBe(bIdentity.resourceKey);
      expect(loader.identify({ type: 'sound', source, sprites: {} })).toEqual(loader.identify(plain));

      await loader.cacheSource(plain);
      await expect(scope.load([a, b])).resolves.toEqual([a, b]);
      expect(a.hasSprite('a')).toBe(true);
      expect(a.hasSprite('b')).toBe(false);
      expect(b.hasSprite('b')).toBe(true);
      expect(b.hasSprite('a')).toBe(false);
      await expect(loader.load(aDescriptor)).resolves.toBe(a);
      expect(fetchBytes).toHaveBeenCalledOnce();
      expect(decode).toHaveBeenCalledTimes(2);
    } finally {
      scope.destroy();
      loader.destroy();
    }
  });

  test('a sibling sound with valid sprites cannot mask a bad clip for the same source', async () => {
    const { loader, fetchBytes } = createLoader();
    const scope = loader.createScope();
    const a = new Sound('sample.wav', { sprites: { valid: { start: 0, end: 1 } } });
    const b = new Sound('sample.wav', { sprites: { invalid: { start: 0, end: 100 } } });

    try {
      await loader.cacheSource({ type: 'sound', source: 'sample.wav' });
      await expect(scope.load([a, b])).rejects.toThrow(/exceeds sound duration/);
      await expect(a.loaded).resolves.toBe(a);
      await expect(b.loaded).rejects.toThrow(/exceeds sound duration/);
      expect(a.hasSprite('valid')).toBe(true);
      expect(fetchBytes).toHaveBeenCalledOnce();
    } finally {
      scope.destroy();
      loader.destroy();
    }
  });
});
