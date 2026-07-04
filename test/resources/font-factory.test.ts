import type { FontFactoryOptions } from '#resources/factories/FontFactory';
import { FontFactory } from '#resources/factories/FontFactory';

// ---------------------------------------------------------------------------
// FontFace / document.fonts polyfill
// ---------------------------------------------------------------------------
//
// jsdom implements neither the `FontFace` constructor nor `document.fonts`
// (the FontFaceSet). FontFactory only calls `new FontFace(...).load()` and
// `document.fonts.add`/`.delete` inside its methods, so a minimal stand-in
// installed for the duration of this file is sufficient.

let shouldFailToLoad = false;

class MockFontFace {
  public family: string;

  public constructor(
    family: string,
    public readonly source: BufferSource,
    public readonly descriptors?: FontFaceDescriptors,
  ) {
    this.family = family;
  }

  public load(): Promise<FontFace> {
    if (shouldFailToLoad) {
      return Promise.reject(new Error('mock: unparsable font data'));
    }

    return Promise.resolve(this as unknown as FontFace);
  }
}

const fontsAdd = vi.fn();
const fontsDelete = vi.fn();

const originalFontFace = (globalThis as { FontFace?: unknown }).FontFace;
const originalDocumentFonts = (document as { fonts?: unknown }).fonts;

beforeAll(() => {
  (globalThis as { FontFace?: unknown }).FontFace = MockFontFace;
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { add: fontsAdd, delete: fontsDelete },
  });
});

afterAll(() => {
  (globalThis as { FontFace?: unknown }).FontFace = originalFontFace;
  if (originalDocumentFonts === undefined) {
    Reflect.deleteProperty(document, 'fonts');
  } else {
    Object.defineProperty(document, 'fonts', { configurable: true, value: originalDocumentFonts });
  }
});

beforeEach(() => {
  shouldFailToLoad = false;
  fontsAdd.mockClear();
  fontsDelete.mockClear();
});

describe('FontFactory', () => {
  test('storageName is "font"', () => {
    const factory = new FontFactory();
    expect(factory.storageName).toBe('font');
  });

  test('process() reads the response body as an ArrayBuffer', async () => {
    const factory = new FontFactory();
    const buffer = new ArrayBuffer(8);
    const response = { arrayBuffer: async () => buffer } as unknown as Response;

    const result = await factory.process(response);

    expect(result).toBe(buffer);
  });

  test('rejects clearly when font data is too short', async () => {
    const factory = new FontFactory();

    await expect(
      factory.create(new ArrayBuffer(3), {
        family: 'TestFont',
      }),
    ).rejects.toThrow('expected at least 4 bytes');
  });

  test('rejects clearly when no options are supplied', async () => {
    const factory = new FontFactory();

    await expect(factory.create(new ArrayBuffer(8))).rejects.toThrow('requires options with a "family" property');
  });

  test('rejects clearly when family is missing from options', async () => {
    const factory = new FontFactory();

    await expect(factory.create(new ArrayBuffer(8), {} as unknown as FontFactoryOptions)).rejects.toThrow('requires options with a "family" property');
  });

  test('create() resolves with a FontFace and registers it with document.fonts by default', async () => {
    const factory = new FontFactory();

    const fontFace = await factory.create(new ArrayBuffer(8), { family: 'TestFont' });

    expect(fontFace).toBeInstanceOf(MockFontFace);
    expect(fontsAdd).toHaveBeenCalledWith(fontFace);
  });

  test('create() skips document.fonts registration when addToDocument is false', async () => {
    const factory = new FontFactory();

    await factory.create(new ArrayBuffer(8), { family: 'TestFont', addToDocument: false });

    expect(fontsAdd).not.toHaveBeenCalled();
  });

  test('create() forwards descriptors to the FontFace constructor', async () => {
    const factory = new FontFactory();

    const fontFace = (await factory.create(new ArrayBuffer(8), {
      family: 'TestFont',
      descriptors: { weight: '700' },
    })) as unknown as MockFontFace;

    expect(fontFace.descriptors).toEqual({ weight: '700' });
  });

  test('rejects with a clear message when the underlying FontFace fails to load', async () => {
    shouldFailToLoad = true;
    const factory = new FontFactory();

    await expect(factory.create(new ArrayBuffer(8), { family: 'TestFont' })).rejects.toThrow('Invalid font data in ArrayBuffer');
  });

  test('destroy() removes every registered font face from document.fonts', async () => {
    const factory = new FontFactory();

    const first = await factory.create(new ArrayBuffer(8), { family: 'First' });
    const second = await factory.create(new ArrayBuffer(8), { family: 'Second' });

    factory.destroy();

    expect(fontsDelete).toHaveBeenCalledWith(first);
    expect(fontsDelete).toHaveBeenCalledWith(second);
    expect(fontsDelete).toHaveBeenCalledTimes(2);
  });

  test('destroy() does not remove fonts that were created with addToDocument: false', async () => {
    const factory = new FontFactory();

    await factory.create(new ArrayBuffer(8), { family: 'Untracked', addToDocument: false });
    factory.destroy();

    expect(fontsDelete).not.toHaveBeenCalled();
  });
});
