import { ImageFactory } from '#resources/factories/ImageFactory';

// PNG magic bytes — enough for determineMimeType()'s pattern match without a
// real, fully-formed PNG payload.
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;

// ---------------------------------------------------------------------------
// Image element capture helper — see svg-factory.test.ts for rationale:
// jsdom's HTMLImageElement never fires 'load'/'error'/'abort' on its own.
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

describe('ImageFactory', () => {
  let createObjectUrlSpy: MockInstance;
  let revokeObjectUrlSpy: MockInstance;

  beforeEach(() => {
    capturedImages = [];
    // Spy (rather than replace) so the real jsdom Blob-URL behavior still runs —
    // only the call history is inspected.
    createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL');
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('storageName is "image"', () => {
    const factory = new ImageFactory();
    expect(factory.storageName).toBe('image');
  });

  test('process() reads the response body as an ArrayBuffer', async () => {
    const factory = new ImageFactory();
    const response = { arrayBuffer: async () => PNG_HEADER } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe(PNG_HEADER);
  });

  describe('createImageBitmap path', () => {
    test('create() resolves with the decoded ImageBitmap', async () => {
      const fakeBitmap = { width: 4, height: 4, close: vi.fn() };
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => fakeBitmap),
      );

      const factory = new ImageFactory();
      const result = await factory.create(PNG_HEADER);

      expect(result).toBe(fakeBitmap);
    });

    test('create() forwards a Blob built with the inferred mime type', async () => {
      let seenBlob: Blob | undefined;
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async (blob: Blob) => {
          seenBlob = blob;
          return { width: 1, height: 1 };
        }),
      );

      const factory = new ImageFactory();
      await factory.create(PNG_HEADER);

      expect(seenBlob?.type).toBe('image/png');
    });

    test('create() honors an explicit mimeType option', async () => {
      let seenBlob: Blob | undefined;
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async (blob: Blob) => {
          seenBlob = blob;
          return { width: 1, height: 1 };
        }),
      );

      const factory = new ImageFactory();
      await factory.create(PNG_HEADER, { mimeType: 'image/custom' });

      expect(seenBlob?.type).toBe('image/custom');
    });
  });

  describe('HTMLImageElement fallback path (no createImageBitmap)', () => {
    beforeEach(() => {
      // createImageBitmap is undefined by default in jsdom — explicitly stub it
      // as undefined so this describe block is order-independent.
      vi.stubGlobal('createImageBitmap', undefined);
      vi.stubGlobal('Image', CapturingImage);
    });

    test('create() resolves with the HTMLImageElement once "load" fires', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER);
      lastImage().dispatchEvent(new Event('load'));

      const image = await promise;

      expect(image).toBeInstanceOf(HTMLImageElement);
    });

    test('create() rejects with a clear message on "error"', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER);
      lastImage().dispatchEvent(new Event('error'));

      await expect(promise).rejects.toThrow('Error loading image source.');
    });

    test('create() rejects with a clear message on "abort"', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER);
      lastImage().dispatchEvent(new Event('abort'));

      await expect(promise).rejects.toThrow('Image loading was canceled.');
    });

    test('create() revokes the object URL once loading settles', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER);
      lastImage().dispatchEvent(new Event('load'));
      await promise;

      expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    });

    test('create() sets the image src to the created object URL', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER);
      const returnedUrl = createObjectUrlSpy.mock.results[0]?.value as string;

      expect(lastImage().src).toContain(returnedUrl);

      lastImage().dispatchEvent(new Event('load'));
      await promise;
    });
  });
});
