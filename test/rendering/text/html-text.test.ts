/**
 * HTMLText unit tests.
 *
 * HTMLText rasterizes an SVG `<foreignObject>` into a canvas via a Blob URL +
 * `Image` load, none of which jsdom simulates by default:
 *  - The shared canvas 2D context stub (test/setup-env.vitest.ts) only
 *    implements `fillStyle`/`fillRect`/`drawImage` — HTMLText also needs
 *    `clearRect`, so this file installs a fuller local mock.
 *  - jsdom never fires `Image#onload`/`onerror` on its own (verified: setting
 *    `.src` is a no-op for the load pipeline). This file patches
 *    `HTMLImageElement.prototype.src`'s setter to schedule a controllable
 *    load/error event on a microtask, giving deterministic control over both
 *    outcomes.
 *  - `Blob` is replaced with a capturing fake so the exact SVG markup passed
 *    to it can be asserted without needing a working `Blob`/`FileReader`
 *    round-trip (`URL.createObjectURL`/`revokeObjectURL` are already stubbed
 *    globally to ignore their input).
 * All mocks are installed in `beforeAll` and restored in `afterAll`/`afterEach`.
 */

import { logger } from '#core/logging';
import { HTMLText } from '#rendering/text/HTMLText';
import type { Texture } from '#rendering/texture/Texture';

// ---------------------------------------------------------------------------
// Canvas 2D context mock (adds clearRect on top of the shared stub)
// ---------------------------------------------------------------------------

function makeFullContext2d(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

let getContextSpy: MockInstance;

// ---------------------------------------------------------------------------
// Image load/error control
// ---------------------------------------------------------------------------

let imageOutcome: 'load' | 'error' = 'load';
let originalImageSrcDescriptor: PropertyDescriptor | undefined;

/** Wait for all pending microtasks (image load/error dispatch) to settle. */
const flushAsync = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------
// Blob capture
// ---------------------------------------------------------------------------

interface CapturedBlob {
  readonly parts: unknown[];
  readonly options: BlobPropertyBag | undefined;
}

let capturedBlobs: CapturedBlob[] = [];
let originalBlob: typeof Blob;

// Node's real `URL.createObjectURL` (used by jsdom here, since it already
// exists natively and the fallback stub in test/setup-env.vitest.ts only
// activates when it is missing) requires a genuine `Blob` instance — so the
// capturing fake extends the real class instead of replacing its behavior.
class CapturingBlob extends Blob {
  public readonly parts: unknown[];
  public readonly options: BlobPropertyBag | undefined;

  public constructor(parts: unknown[] = [], options?: BlobPropertyBag) {
    super(parts as BlobPart[], options);
    this.parts = parts;
    this.options = options;
    capturedBlobs.push({ parts, options });
  }
}

const lastSvg = (): string => {
  const last = capturedBlobs.at(-1);

  if (last === undefined) {
    throw new Error('No Blob was constructed.');
  }

  return last.parts[0] as string;
};

beforeAll(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => makeFullContext2d());

  originalImageSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get(): string {
      return '';
    },
    set(this: HTMLImageElement): void {
      const outcome = imageOutcome;

      queueMicrotask(() => {
        this.dispatchEvent(new Event(outcome));
      });
    },
  });

  originalBlob = globalThis.Blob;
  globalThis.Blob = CapturingBlob as unknown as typeof Blob;
});

afterAll(() => {
  getContextSpy.mockRestore();

  if (originalImageSrcDescriptor) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', originalImageSrcDescriptor);
  }

  globalThis.Blob = originalBlob;
});

afterEach(() => {
  imageOutcome = 'load';
  capturedBlobs = [];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HTMLText construction', () => {
  test('an empty initial html does not schedule a render', () => {
    const label = new HTMLText('');

    expect(capturedBlobs).toHaveLength(0);
    expect(label.children).toHaveLength(1); // the mesh is always built eagerly
    expect(label.html).toBe('');

    // No render was ever scheduled — `ready` falls back to an already-resolved promise.
    expect(label.ready).toBeInstanceOf(Promise);

    label.destroy();
  });

  test('sizes the backing canvas from width/height/resolution options', () => {
    const label = new HTMLText('', { width: 100, height: 50, resolution: 2 });
    const canvas = (label as unknown as { _canvas: HTMLCanvasElement })._canvas;

    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
    expect(label.width).toBe(100);
    expect(label.height).toBe(50);
    expect(label.resolution).toBe(2);

    label.destroy();
  });

  test('defaults to a 256x128 canvas at resolution 1', () => {
    const label = new HTMLText('');

    expect(label.width).toBe(256);
    expect(label.height).toBe(128);
    expect(label.resolution).toBe(1);

    label.destroy();
  });

  test('a non-empty initial html schedules a render that resolves successfully', async () => {
    const label = new HTMLText('<b>Score</b>');

    await label.ready;

    const ctx = (label as unknown as { _ctx: CanvasRenderingContext2D })._ctx;

    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(capturedBlobs).toHaveLength(1);
    expect(lastSvg()).toContain('<b>Score</b>');

    label.destroy();
  });

  test('throws when the canvas cannot provide a 2D context', () => {
    getContextSpy.mockImplementationOnce(() => null);

    expect(() => new HTMLText('x')).toThrow('HTMLText: could not obtain 2D context.');
  });
});

describe('HTMLText SVG assembly', () => {
  test('omits the <style> tag entirely when there is no css and no registered font', async () => {
    const label = new HTMLText('');

    label.html = '<p>hi</p>'; // triggers a render since it differs from the initial ''
    await label.ready;

    expect(lastSvg()).not.toContain('<style>');

    label.destroy();
  });

  test('includes a <style> tag with the user css when set', async () => {
    const label = new HTMLText('<p>x</p>', { css: 'p { color: red; }' });

    await label.ready;

    expect(lastSvg()).toContain('<style>');
    expect(lastSvg()).toContain('p { color: red; }');

    label.destroy();
  });

  test('escapes a user-supplied closing </style> tag so it cannot break out early', async () => {
    const label = new HTMLText('<p>x</p>', { css: '</style><script>evil</script>' });

    await label.ready;

    expect(lastSvg()).not.toContain('</style><script>');
    expect(lastSvg()).toContain('<\\/style>');

    label.destroy();
  });

  test('includes a @font-face rule for each registered font, base64-encoding the bytes', async () => {
    const label = new HTMLText('');
    const bytes = new TextEncoder().encode('fake-font-bytes').buffer;

    label.addFont('Roboto', bytes, 'woff2');
    await label.ready;

    const svg = lastSvg();

    expect(svg).toContain("font-family:'Roboto'");
    expect(svg).toContain('data:font/woff2;base64,');

    label.destroy();
  });

  test('registering the same family twice replaces the previous entry rather than duplicating it', async () => {
    const label = new HTMLText('');
    const bytesA = new TextEncoder().encode('AAAA').buffer;
    const bytesB = new TextEncoder().encode('BBBB').buffer;

    label.addFont('Roboto', bytesA, 'woff2');
    label.addFont('Roboto', bytesB, 'woff');
    await label.ready;

    const fonts = (label as unknown as { _fonts: Array<{ family: string }> })._fonts;

    expect(fonts).toHaveLength(1);
    expect(lastSvg()).toContain('font/woff;base64,');

    label.destroy();
  });

  test('addFont defaults the format to woff2 when omitted', async () => {
    const label = new HTMLText('');
    const bytes = new TextEncoder().encode('x').buffer;

    label.addFont('Roboto', bytes);
    await label.ready;

    expect(lastSvg()).toContain('data:font/woff2;base64,');

    label.destroy();
  });

  test('escapes special characters in a font-family name', async () => {
    const label = new HTMLText('');
    const bytes = new TextEncoder().encode('x').buffer;

    label.addFont("weird'name\\here", bytes, 'ttf');
    await label.ready;

    expect(lastSvg()).toContain("weird\\'name\\\\here");

    label.destroy();
  });

  test('removeFont drops a registered font and re-renders', async () => {
    const label = new HTMLText('');
    const bytes = new TextEncoder().encode('x').buffer;

    label.addFont('Roboto', bytes, 'otf');
    await label.ready;
    expect(lastSvg()).toContain('font-face');

    label.removeFont('Roboto');
    await label.ready;

    expect(lastSvg()).not.toContain('font-face');

    label.destroy();
  });

  test('removeFont for an unregistered family is a no-op (no re-render)', async () => {
    const label = new HTMLText('<p>x</p>');

    await label.ready;
    const versionBefore = (label as unknown as { _renderVersion: number })._renderVersion;

    label.removeFont('DoesNotExist');

    expect((label as unknown as { _renderVersion: number })._renderVersion).toBe(versionBefore);

    label.destroy();
  });
});

describe('HTMLText property setters', () => {
  test('html setter no-ops when the value is unchanged', () => {
    const label = new HTMLText('same');
    const versionAfterConstruction = (label as unknown as { _renderVersion: number })._renderVersion;

    label.html = 'same';

    expect((label as unknown as { _renderVersion: number })._renderVersion).toBe(versionAfterConstruction);

    label.destroy();
  });

  test('css setter no-ops when unchanged and schedules a render when changed', () => {
    const label = new HTMLText('');

    expect(label.css).toBe('');

    label.css = 'p { color: blue; }';
    expect(label.css).toBe('p { color: blue; }');

    const versionAfterChange = (label as unknown as { _renderVersion: number })._renderVersion;

    label.css = 'p { color: blue; }'; // unchanged — no-op branch
    expect((label as unknown as { _renderVersion: number })._renderVersion).toBe(versionAfterChange);

    label.destroy();
  });

  test('width/height setters resize via resize()', () => {
    const label = new HTMLText('');

    label.width = 300;
    label.height = 150;

    expect(label.width).toBe(300);
    expect(label.height).toBe(150);

    label.destroy();
  });

  test('resolution setter no-ops when unchanged and resizes the canvas when changed', () => {
    const label = new HTMLText('', { resolution: 1 });
    const canvas = (label as unknown as { _canvas: HTMLCanvasElement })._canvas;

    label.resolution = 1; // no-op branch
    expect(label.resolution).toBe(1);

    label.resolution = 2;
    expect(label.resolution).toBe(2);
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(256);

    label.destroy();
  });
});

describe('HTMLText.resize', () => {
  test('is a no-op when both dimensions are unchanged', () => {
    const label = new HTMLText('');
    const meshBefore = (label as unknown as { _mesh: unknown })._mesh;

    const result = label.resize(256, 128);

    expect(result).toBe(label);
    expect((label as unknown as { _mesh: unknown })._mesh).toBe(meshBefore);

    label.destroy();
  });

  test('rebuilds the mesh and resizes the canvas when dimensions change', () => {
    const label = new HTMLText('');
    const meshBefore = (label as unknown as { _mesh: unknown })._mesh;
    const canvas = (label as unknown as { _canvas: HTMLCanvasElement })._canvas;

    label.resize(64, 32);

    expect(label.width).toBe(64);
    expect(label.height).toBe(32);
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(32);
    expect((label as unknown as { _mesh: unknown })._mesh).not.toBe(meshBefore);
    expect(label.children).toHaveLength(1); // old mesh removed, new one added

    label.destroy();
  });
});

describe('HTMLText render lifecycle', () => {
  test('logs a warning and does not throw when the image fails to load', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');

    imageOutcome = 'error';

    const label = new HTMLText('<p>broken</p>');

    await label.ready;

    expect(warnSpy).toHaveBeenCalledWith('HTMLText render failed.', expect.objectContaining({ source: 'HTMLText' }));

    warnSpy.mockRestore();
    label.destroy();
  });

  test('a stale render superseded by a newer schedule does not touch the canvas', async () => {
    const label = new HTMLText('<p>first</p>');
    const ctx = (label as unknown as { _ctx: CanvasRenderingContext2D })._ctx;

    // Schedules a second render while the first is still in flight (both
    // Image loads are queued; the first's continuation must see a version
    // mismatch and skip drawing).
    label.html = '<p>second</p>';

    await label.ready;
    await flushAsync();

    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);

    label.destroy();
  });

  test('a render still in flight when destroy() is called does not touch the canvas', async () => {
    const label = new HTMLText('<p>first</p>');
    const ctx = (label as unknown as { _ctx: CanvasRenderingContext2D })._ctx;

    label.destroy();

    await flushAsync();

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.clearRect).not.toHaveBeenCalled();
  });

  test('destroy() releases the texture', () => {
    const label = new HTMLText('');
    const texture = (label as unknown as { _texture: Texture })._texture;
    const destroySpy = vi.spyOn(texture, 'destroy');

    label.destroy();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
