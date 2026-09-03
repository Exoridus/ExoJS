/**
 * The keyboard/wheel gate against REAL DOM focus, not synthetic focus events:
 * a focused text field moves host focus from the canvas to the transport
 * element the platform created, and the input pipeline has to keep treating
 * that as "this application owns keyboard focus". The harness in
 * `test/support/text-field-harness.ts` dispatches `onKeyDown` directly and
 * cannot see this path at all.
 */

import type { Application } from '#core/Application';
import { InputSystem } from '#input/InputSystem';
import { Keyboard } from '#input/types';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import type { PlatformTextInput } from '#platform/PlatformTextInput';

const createCanvas = (width = 800, height = 600): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;
  // What `Application` applies by default - without it the surface cannot
  // take host focus at all and the whole path is untestable.
  canvas.tabIndex = -1;
  document.body.append(canvas);

  return canvas;
};

const createMockApp = (canvas: HTMLCanvasElement, platform: BrowserPlatform): Application =>
  ({
    canvas,
    platform,
    width: canvas.width,
    height: canvas.height,
    pixelRatio: 1,
    options: { input: { gamepadDefinitions: [], pointerDistanceThreshold: 10 } },
    scenes: { paused: false },
    _backingStoreToLogical: (x: number, y: number): { x: number; y: number } => ({ x, y }),
  }) as unknown as Application;

const channel = (input: InputSystem, id: number): number => (input as unknown as { channels: Float32Array }).channels[id];

describe('text transport focus and the keyboard gate', () => {
  let canvas: HTMLCanvasElement;
  let platform: BrowserPlatform;
  let input: InputSystem;
  let seam: PlatformTextInput | null = null;

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'getGamepads', { configurable: true, value: () => [] });
    canvas = createCanvas();
    platform = new BrowserPlatform(canvas);
    input = new InputSystem(createMockApp(canvas, platform));
  });

  afterEach(() => {
    seam?.destroy();
    seam = null;
    input.destroy();
    canvas.remove();
  });

  test('keys and wheel keep reaching the engine while the text transport holds host focus', () => {
    const onFocusChange = vi.fn();

    input.onCanvasFocusChange.add(onFocusChange);
    canvas.focus();

    expect(input.canvasFocused).toBe(true);
    expect(onFocusChange).toHaveBeenLastCalledWith(true);

    seam = platform.createTextInput();
    expect(seam).not.toBeNull();
    seam?.focus();

    expect(document.activeElement).not.toBe(canvas);
    // Focus moved inside the application, so nothing was reported as lost.
    expect(onFocusChange).toHaveBeenCalledTimes(1);
    expect(input.canvasFocused).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    expect(channel(input, Keyboard.Left)).toBe(1);

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
    expect(channel(input, Keyboard.Left)).toBe(0);

    const onMouseWheel = vi.fn();

    input.onMouseWheel.add(onMouseWheel);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, deltaMode: 0 }));
    input.preUpdate(0 as never);

    expect(onMouseWheel).toHaveBeenCalledExactlyOnceWith(0, expect.any(Number));
  });

  test('a held key survives the field taking focus', () => {
    canvas.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));

    seam = platform.createTextInput();
    seam?.focus();

    expect(channel(input, Keyboard.W)).toBe(1);
  });

  test('the transport hands host focus back to the surface when it blurs', () => {
    canvas.focus();

    seam = platform.createTextInput();
    seam?.focus();
    seam?.blur();

    expect(document.activeElement).toBe(canvas);
    expect(input.canvasFocused).toBe(true);
  });

  test('a foreign element taking focus from the transport closes the gate', () => {
    const foreign = document.createElement('input');

    document.body.append(foreign);
    canvas.focus();

    seam = platform.createTextInput();
    seam?.focus();
    foreign.focus();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));

    expect(channel(input, Keyboard.W)).toBe(0);
    expect(input.canvasFocused).toBe(false);

    foreign.remove();
  });

  test('pressing a surface the host refuses focus for still reports the focus change', () => {
    const onFocusChange = vi.fn();

    // No tab index: `focusSurface()` raises no focus event, so the press is
    // the only thing that can report the change.
    canvas.removeAttribute('tabindex');
    input.onCanvasFocusChange.add(onFocusChange);

    canvas.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerId: 1, isPrimary: true }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, buttons: 1 }));

    expect(input.canvasFocused).toBe(true);
    expect(onFocusChange).toHaveBeenCalledExactlyOnceWith(true);
  });
});
