import { SvgFactory } from '#resources/factories/SvgFactory';

// ---------------------------------------------------------------------------
// Image element capture helper
// ---------------------------------------------------------------------------
//
// jsdom's HTMLImageElement never fires 'load'/'error'/'abort' on its own (it
// does not perform real network/resource loading), so SvgFactory.create()'s
// returned promise would hang forever without help. We subclass the real
// global `Image` so `instanceof HTMLImageElement` keeps working, track every
// instance created, and dispatch the relevant event manually from the test.

const RealImage = globalThis.Image;
let capturedImages: HTMLImageElement[];

class CapturingImage extends RealImage {
  public constructor(...args: ConstructorParameters<typeof RealImage>) {
    super(...args);
    capturedImages.push(this);
  }
}

let createObjectUrlSpy: MockInstance;
let revokeObjectUrlSpy: MockInstance;

beforeEach(() => {
  capturedImages = [];
  vi.stubGlobal('Image', CapturingImage);
  // Spy (rather than replace) so the real jsdom Blob-URL behavior still runs —
  // only the call history is inspected.
  createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL');
  revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const lastImage = (): HTMLImageElement => {
  const image = capturedImages.at(-1);
  if (!image) throw new Error('No Image instance was created by the factory under test.');
  return image;
};

describe('SvgFactory', () => {
  test('storageName is "svg"', () => {
    const factory = new SvgFactory();
    expect(factory.storageName).toBe('svg');
  });

  test('process() reads the response body as text', async () => {
    const factory = new SvgFactory();
    const response = { text: async () => '<svg></svg>' } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe('<svg></svg>');
  });

  test('create() resolves with an HTMLImageElement once "load" fires', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg width="10" height="10"></svg>');
    lastImage().dispatchEvent(new Event('load'));

    const image = await promise;

    expect(image).toBeInstanceOf(HTMLImageElement);
    expect(image).toBe(lastImage());
  });

  test('create() rejects with a clear message on "error"', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg></svg>');
    lastImage().dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow('Error loading image source.');
  });

  test('create() rejects with a clear message on "abort"', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg></svg>');
    lastImage().dispatchEvent(new Event('abort'));

    await expect(promise).rejects.toThrow('Image loading was canceled.');
  });

  test('create() injects width/height attributes when provided', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg viewBox="0 0 10 10"></svg>', { width: 64, height: 32 });
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toContain('width="64"');
    expect(text).toContain('height="32"');
    expect(blob.type).toBe('image/svg+xml');
  });

  test('create() replaces pre-existing width/height attributes rather than duplicating them', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg width="5" height="5" viewBox="0 0 10 10"></svg>', { width: 100, height: 200 });
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toContain('width="100"');
    expect(text).toContain('height="200"');
    expect(text).not.toContain('width="5"');
    expect(text).not.toContain('height="5"');
  });

  test('create() leaves the markup untouched when width/height are not provided', async () => {
    const factory = new SvgFactory();
    const source = '<svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>';

    const promise = factory.create(source);
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toBe(source);
  });

  test('create() applies only width when height is omitted', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg viewBox="0 0 10 10"></svg>', { width: 42 });
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toContain('width="42"');
    expect(text).not.toContain('height=');
  });

  test('create() applies only height when width is omitted', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg viewBox="0 0 10 10"></svg>', { height: 24 });
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toContain('height="24"');
    expect(text).not.toContain('width=');
  });

  test('create() leaves the source untouched when width/height are requested but no <svg tag is present', async () => {
    const factory = new SvgFactory();
    const source = 'not an svg document';

    const promise = factory.create(source, { width: 10, height: 10 });
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toBe(source);
  });

  test('create() revokes the object URL once loading settles', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg></svg>');
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
  });
});
