import { Texture } from '#rendering/texture/Texture';
import { TextureFactory } from '#resources/factories/TextureFactory';

// PNG magic bytes — enough for determineMimeType()'s pattern match without a
// real, fully-formed PNG payload.
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;

// ---------------------------------------------------------------------------
// Image element capture helper — see svg-factory.test.ts for rationale.
// ---------------------------------------------------------------------------

const RealImage = globalThis.Image;
let capturedImages: HTMLImageElement[];

class CapturingImage extends RealImage {
  public constructor(...args: ConstructorParameters<typeof RealImage>) {
    super(...args);
    capturedImages.push(this);
  }
}

const lastImage = (): HTMLImageElement => {
  const image = capturedImages.at(-1);
  if (!image) throw new Error('No Image instance was created by the factory under test.');
  return image;
};

describe('TextureFactory', () => {
  let revokeObjectUrlSpy: MockInstance;

  beforeEach(() => {
    capturedImages = [];
    // Spy (rather than replace) so the real jsdom Blob-URL behavior still runs —
    // only the call history is inspected.
    vi.spyOn(URL, 'createObjectURL');
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('storageName is "texture"', () => {
    const factory = new TextureFactory();
    expect(factory.storageName).toBe('texture');
  });

  test('process() reads the response body as an ArrayBuffer', async () => {
    const factory = new TextureFactory();
    const response = { arrayBuffer: async () => PNG_HEADER } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe(PNG_HEADER);
  });

  describe('createImageBitmap path', () => {
    test('create() resolves with a Texture wrapping the decoded bitmap', async () => {
      const fakeBitmap = { width: 8, height: 8 };
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => fakeBitmap),
      );

      const factory = new TextureFactory();
      const texture = await factory.create(PNG_HEADER);

      expect(texture).toBeInstanceOf(Texture);
      expect(texture.width).toBe(8);
      expect(texture.height).toBe(8);
    });

    test('create() forwards samplerOptions to the constructed Texture', async () => {
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => ({ width: 2, height: 2 })),
      );

      const factory = new TextureFactory();
      const texture = await factory.create(PNG_HEADER, { samplerOptions: { flipY: true } });

      expect(texture.flipY).toBe(true);
    });
  });

  describe('HTMLImageElement fallback path (no createImageBitmap)', () => {
    beforeEach(() => {
      vi.stubGlobal('createImageBitmap', undefined);
      vi.stubGlobal('Image', CapturingImage);
    });

    test('create() resolves with a Texture wrapping the HTMLImageElement once "load" fires', async () => {
      const factory = new TextureFactory();

      const promise = factory.create(PNG_HEADER);
      lastImage().dispatchEvent(new Event('load'));

      const texture = await promise;

      expect(texture).toBeInstanceOf(Texture);
      expect(texture.source).toBe(lastImage());
    });

    test('create() rejects with a clear message on "error"', async () => {
      const factory = new TextureFactory();

      const promise = factory.create(PNG_HEADER);
      lastImage().dispatchEvent(new Event('error'));

      await expect(promise).rejects.toThrow(
        'Failed to decode image source — the bytes may be corrupted, an unsupported format, or (if loaded with the wrong Asset.kind) not an image at all.',
      );
    });

    test('create() rejects with a clear message on "abort"', async () => {
      const factory = new TextureFactory();

      const promise = factory.create(PNG_HEADER);
      lastImage().dispatchEvent(new Event('abort'));

      await expect(promise).rejects.toThrow('Image loading was canceled.');
    });

    test('create() revokes the object URL once loading settles', async () => {
      const factory = new TextureFactory();

      const promise = factory.create(PNG_HEADER);
      lastImage().dispatchEvent(new Event('load'));
      await promise;

      expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    });
  });
});
