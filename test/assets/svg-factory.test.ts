import type { MockInstance } from 'vitest';

import { Asset } from '#assets/Asset';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { SvgFactory } from '#assets/factories/SvgFactory';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

import { factoryContext } from './factory-context';

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
  // Spy (rather than replace) so the real jsdom Blob-URL behavior still runs -
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

  if (!image) {
    throw new Error('No Image instance was created by the factory under test.');
  }

  return image;
};

describe('SvgFactory', () => {
  test('reacquiring a sized SVG after a cancelled preview retains the requested raster size', async () => {
    const loader = new Loader();
    materializeAssetTypes(loader, coreAssetTypes);
    const descriptor = Asset.type('svg', 'icon-play.svg', { width: 150, height: 150 });
    const markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 3v18l15-9z"/></svg>';
    const fetchSpy = vi.fn<typeof fetch>().mockImplementation(async () => new Response(markup));
    vi.stubGlobal('fetch', fetchSpy);

    try {
      const first = loader.createScope();
      const initialLoad = first.load(descriptor);
      await vi.waitFor(() => expect(capturedImages).toHaveLength(1));
      lastImage().dispatchEvent(new Event('load'));
      await initialLoad;
      first.destroy();

      fetchSpy.mockImplementationOnce(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
          }),
      );
      const cancelled = loader.createScope();
      const cancelledLoad = cancelled.load(descriptor);
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
      cancelled.destroy();
      await expect(cancelledLoad).rejects.toMatchObject({ name: 'AbortError' });

      const current = loader.createScope();
      const reloaded = current.load(descriptor);
      await vi.waitFor(() => expect(capturedImages).toHaveLength(2));
      lastImage().dispatchEvent(new Event('load'));
      await reloaded;

      const blob = createObjectUrlSpy.mock.calls.at(-1)?.[0] as Blob;
      const rasterized = await blob.text();

      expect(rasterized).toContain('width="150"');
      expect(rasterized).toContain('height="150"');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    } finally {
      loader.destroy();
    }
  });

  test('create() resolves with an HTMLImageElement once "load" fires', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg width="10" height="10"></svg>', factoryContext());
    lastImage().dispatchEvent(new Event('load'));

    const image = await promise;

    expect(image).toBeInstanceOf(HTMLImageElement);
    expect(image).toBe(lastImage());
  });

  test('create() rejects with a clear message on "error"', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg></svg>', factoryContext());
    lastImage().dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow(
      'Failed to decode SVG source - the markup may be malformed, or (if loaded as the wrong asset type) not SVG at all.',
    );
  });

  test('create() rejects with a clear message on "abort"', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg></svg>', factoryContext());
    lastImage().dispatchEvent(new Event('abort'));

    await expect(promise).rejects.toThrow('Image loading was canceled.');
  });

  test('create() injects width/height attributes when provided', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg viewBox="0 0 10 10"></svg>', factoryContext({ width: 64, height: 32 }));
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

    const promise = factory.create('<svg width="5" height="5" viewBox="0 0 10 10"></svg>', factoryContext({ width: 100, height: 200 }));
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toContain('width="100"');
    expect(text).toContain('height="200"');
    expect(text).not.toContain('width="5"');
    expect(text).not.toContain('height="5"');
  });

  test('create() keeps a ">" inside a root attribute value and a self-closing root intact', async () => {
    const factory = new SvgFactory();

    const first = factory.create('<svg data-note="a>b" width="5"><rect/></svg>', factoryContext({ width: 100 }));
    lastImage().dispatchEvent(new Event('load'));
    await first;

    const second = factory.create('<svg width="5" viewBox="0 0 1 1"/>', factoryContext({ width: 100 }));
    lastImage().dispatchEvent(new Event('load'));
    await second;

    const markupOf = async (call: number): Promise<string> => (createObjectUrlSpy.mock.calls[call]?.[0] as Blob).text();

    expect(await markupOf(0)).toBe('<svg data-note="a>b" width="100"><rect/></svg>');
    expect(await markupOf(1)).toBe('<svg viewBox="0 0 1 1" width="100"/>');
  });

  test('create() leaves the markup untouched when width/height are not provided', async () => {
    const factory = new SvgFactory();
    const source = '<svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>';

    const promise = factory.create(source, factoryContext());
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toBe(source);
  });

  test('create() applies only width when height is omitted', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg viewBox="0 0 10 10"></svg>', factoryContext({ width: 42 }));
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toContain('width="42"');
    expect(text).not.toContain('height=');
  });

  test('create() applies only height when width is omitted', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg viewBox="0 0 10 10"></svg>', factoryContext({ height: 24 }));
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

    const promise = factory.create(source, factoryContext({ width: 10, height: 10 }));
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    const blob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const text = await blob.text();

    expect(text).toBe(source);
  });

  test('create() revokes the object URL once loading settles', async () => {
    const factory = new SvgFactory();

    const promise = factory.create('<svg></svg>', factoryContext());
    lastImage().dispatchEvent(new Event('load'));
    await promise;

    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
  });
});
