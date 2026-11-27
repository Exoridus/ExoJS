/**
 * DOM objects created in another frame's document.
 *
 * `instanceof` compares against the constructors of the realm the check runs
 * in, and a same-origin iframe has its own: its canvas is not an instance of
 * this window's `HTMLCanvasElement`. Only a real browser has a second realm to
 * create one in.
 */

import { Application } from '#core/Application';
import { isRenderSurface } from '#core/applicationCanvas';
import { getCanvasSourceSize } from '#core/utils';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import { isDomCanvas } from '#platform/RenderSurface';

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let frame: HTMLIFrameElement;
let frameDocument: Document;
let frameWindow: Window;

beforeEach(async () => {
  frame = document.createElement('iframe');
  document.body.append(frame);
  frameDocument = frame.contentDocument!;
  frameWindow = frame.contentWindow!;
  await Promise.resolve();
});

afterEach(() => {
  frame.remove();
});

describe('cross-realm DOM objects', () => {
  test('a canvas from another document is a DOM render surface', () => {
    const canvas = frameDocument.createElement('canvas');

    expect(canvas instanceof HTMLCanvasElement).toBe(false);
    expect(isDomCanvas(canvas)).toBe(true);
    expect(isRenderSurface(canvas)).toBe(true);
  });

  test('an OffscreenCanvas from another realm is a render surface but not a DOM canvas', () => {
    const canvas = new (frameWindow as unknown as typeof globalThis).OffscreenCanvas(2, 2);

    expect(isDomCanvas(canvas)).toBe(false);
    expect(isRenderSurface(canvas)).toBe(true);
  });

  test('an object that only looks like a canvas is not a render surface', () => {
    expect(isRenderSurface(frameDocument.createElement('div'))).toBe(false);
    expect(isRenderSurface({ width: 1, height: 1, getContext: () => null })).toBe(false);
  });

  test('image, video and svg sources from another document report their own sizes', async () => {
    const image = frameDocument.createElement('img');

    image.src = onePixelPng;
    image.width = 40;
    await image.decode();

    expect(getCanvasSourceSize(image)).toMatchObject({ width: 1, height: 1 });

    const video = frameDocument.createElement('video');

    video.width = 30;
    video.height = 20;
    expect(getCanvasSourceSize(video)).toMatchObject({ width: 0, height: 0 });

    const svg = frameDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');

    svg.setAttribute('width', '12');
    svg.setAttribute('height', '7');
    svg.setAttribute('style', 'display:block');
    frameDocument.body.append(svg);

    expect(getCanvasSourceSize(svg as unknown as CanvasImageSource)).toMatchObject({ width: 12, height: 7 });
  });

  test('the browser platform follows the document and window that own its canvas', () => {
    const canvas = frameDocument.createElement('canvas');

    canvas.tabIndex = 0;
    frameDocument.body.append(canvas);

    const platform = new BrowserPlatform(canvas);
    const keys: string[] = [];
    const unsubscribe = platform.onWindowEvent('keydown', event => keys.push(event.code));

    platform.focusSurface();
    frameWindow.dispatchEvent(new (frameWindow as unknown as typeof globalThis).KeyboardEvent('keydown', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' }));

    expect(platform.surfaceFocused).toBe(true);
    expect(keys).toEqual(['KeyA']);

    unsubscribe();
    platform.destroy();
  });

  test('an application given a canvas from another document drives it through the browser platform', async () => {
    const canvas = frameDocument.createElement('canvas');

    frameDocument.body.append(canvas);

    const app = new Application({ backend: { type: 'webgl2' }, canvas: { element: canvas } });

    try {
      expect(app.element).toBe(canvas);
      expect(app.platform).toBeInstanceOf(BrowserPlatform);
    } finally {
      await app.destroy();
    }
  });
});
