import type { MockInstance } from 'vitest';

import { ImageFactory } from '#assets/factories/ImageFactory';

import { factoryContext } from './factory-context';

// PNG magic bytes - enough for determineMimeType()'s pattern match without a
// real, fully-formed PNG payload.
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;

// ---------------------------------------------------------------------------
// Image element capture helper - see svg-factory.test.ts for rationale:
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
    // Spy (rather than replace) so the real jsdom Blob-URL behavior still runs -
    // only the call history is inspected.
    createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL');
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('createImageBitmap path', () => {
    test('create() resolves with the decoded ImageBitmap', async () => {
      const fakeBitmap = { width: 4, height: 4, close: vi.fn() };
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => fakeBitmap),
      );

      const factory = new ImageFactory();
      const result = await factory.create(PNG_HEADER, factoryContext());

      expect(result).toBe(fakeBitmap);
    });

    test('dispose() closes a bitmap this factory decoded', async () => {
      const fakeBitmap = { width: 4, height: 4, close: vi.fn() };
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => fakeBitmap),
      );

      const factory = new ImageFactory();
      const image = await factory.create(PNG_HEADER, factoryContext());

      factory.dispose(image);

      // The decoded bitmap is the only thing an image asset owns; without this
      // a release frees nothing until the garbage collector gets to it.
      expect(fakeBitmap.close).toHaveBeenCalledTimes(1);
    });

    test('dispose() leaves a bitmap this factory did not decode alone, and tolerates a second release', async () => {
      const fakeBitmap = { width: 4, height: 4, close: vi.fn() };
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => fakeBitmap),
      );

      const factory = new ImageFactory();
      const foreign = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap;

      factory.dispose(foreign);

      const image = await factory.create(PNG_HEADER, factoryContext());

      factory.dispose(image);
      factory.dispose(image);

      expect((foreign as unknown as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled();
      expect(fakeBitmap.close).toHaveBeenCalledTimes(1);
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
      await factory.create(PNG_HEADER, factoryContext());

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
      await factory.create(PNG_HEADER, factoryContext({ mimeType: 'image/custom' }));

      expect(seenBlob?.type).toBe('image/custom');
    });
  });

  describe('HTMLImageElement fallback path (no createImageBitmap)', () => {
    beforeEach(() => {
      // createImageBitmap is undefined by default in jsdom - explicitly stub it
      // as undefined so this describe block is order-independent.
      vi.stubGlobal('createImageBitmap', undefined);
      vi.stubGlobal('Image', CapturingImage);
    });

    test('create() resolves with the HTMLImageElement once "load" fires', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER, factoryContext());
      lastImage().dispatchEvent(new Event('load'));

      const image = await promise;

      expect(image).toBeInstanceOf(HTMLImageElement);
    });

    test('create() rejects with a clear message on "error"', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER, factoryContext());
      lastImage().dispatchEvent(new Event('error'));

      await expect(promise).rejects.toThrow(
        'Failed to decode image source - the bytes may be corrupted, an unsupported format, or (if loaded as the wrong asset type) not an image at all.',
      );
    });

    test('create() rejects with a clear message on "abort"', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER, factoryContext());
      lastImage().dispatchEvent(new Event('abort'));

      await expect(promise).rejects.toThrow('Image loading was canceled.');
    });

    test('create() revokes the object URL once loading settles', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER, factoryContext());
      lastImage().dispatchEvent(new Event('load'));
      await promise;

      expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    });

    test('create() sets the image src to the created object URL', async () => {
      const factory = new ImageFactory();

      const promise = factory.create(PNG_HEADER, factoryContext());
      const returnedUrl = createObjectUrlSpy.mock.results[0]?.value as string;

      expect(lastImage().src).toContain(returnedUrl);

      lastImage().dispatchEvent(new Event('load'));
      await promise;
    });
  });
});
