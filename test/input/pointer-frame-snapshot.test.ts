/**
 * Tests for the frame-snapshot contract on Pointer: several platform events
 * collapsing into one frame must not lose phases or phase-specific data.
 * Complements `pointer-channels.test.ts` (raw channel buffer) and
 * `input-manager-events.test.ts` (signal wiring).
 */

import type { Application } from '#core/Application';
import { InputManager } from '#input/InputManager';
import type { Pointer } from '#input/Pointer';
import { Keyboard } from '#input/types';

const createCanvas = (width = 800, height = 600): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  return canvas;
};

const createMockApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    width: canvas.width,
    height: canvas.height,
    pixelRatio: 1,
    options: { input: { gamepadDefinitions: [], pointerDistanceThreshold: 10 } },
    _backingStoreToDesign: (x: number, y: number): { x: number; y: number } => ({ x, y }),
  }) as unknown as Application;

const fire = (canvas: HTMLCanvasElement, type: string, init: PointerEventInit): void => {
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', ...init }));
};

const peak = (im: InputManager, channel: number): number => (im as unknown as { channelsPeak: Float32Array }).channelsPeak[channel]!;

let canvas: HTMLCanvasElement;
let im: InputManager;

// `InputManager.update()` unconditionally polls `navigator.getGamepads()`,
// which jsdom does not implement.
beforeAll(() => {
  Object.defineProperty(window.navigator, 'getGamepads', {
    configurable: true,
    value: (): ReturnType<Navigator['getGamepads']> => [] as unknown as ReturnType<Navigator['getGamepads']>,
  });
});

beforeEach(() => {
  canvas = createCanvas();
  im = new InputManager(createMockApp(canvas));
});

afterEach(() => {
  im.destroy();
});

const getPointer = (): Pointer => {
  const pointers = (im as unknown as { pointers: Map<number, Pointer> }).pointers;
  const pointer = pointers.get(1);

  if (!pointer) {
    throw new Error('expected pointer 1 to be tracked');
  }

  return pointer;
};

describe('multiple phases within one frame', () => {
  it('reports pressed, moved and released together for a down-move-up sequence', () => {
    fire(canvas, 'pointerover', { clientX: 10, clientY: 10 });
    im.update(0 as never);

    fire(canvas, 'pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    fire(canvas, 'pointermove', { clientX: 14, clientY: 10, buttons: 1 });
    fire(canvas, 'pointerup', { clientX: 14, clientY: 10, buttons: 0 });

    const pointer = getPointer();

    im.update(0 as never);

    expect(pointer.pressed).toBe(true);
    expect(pointer.moved).toBe(true);
    expect(pointer.released).toBe(true);
    expect(pointer.down).toBe(false);
  });

  it('hands each phase the coordinates that phase happened at', () => {
    fire(canvas, 'pointerover', { clientX: 10, clientY: 10 });
    im.update(0 as never);

    const seen: Record<string, [number, number]> = {};

    im.onPointerDown.add(p => void (seen.down = [p.x, p.y]));
    im.onPointerMove.add(p => void (seen.move = [p.x, p.y]));
    im.onPointerUp.add(p => void (seen.up = [p.x, p.y]));

    fire(canvas, 'pointerdown', { clientX: 10, clientY: 20, buttons: 1 });
    fire(canvas, 'pointermove', { clientX: 50, clientY: 60, buttons: 1 });
    fire(canvas, 'pointerup', { clientX: 90, clientY: 100, buttons: 0 });
    im.update(0 as never);

    expect(seen.down).toEqual([10, 20]);
    expect(seen.move).toEqual([90, 100]);
    expect(seen.up).toEqual([90, 100]);
  });

  it('restores the latest position once the phase dispatch is over', () => {
    fire(canvas, 'pointerover', { clientX: 10, clientY: 10 });
    im.update(0 as never);

    fire(canvas, 'pointerdown', { clientX: 10, clientY: 20, buttons: 1 });
    fire(canvas, 'pointermove', { clientX: 90, clientY: 100, buttons: 1 });

    const pointer = getPointer();

    im.update(0 as never);

    expect(pointer.x).toBe(90);
    expect(pointer.y).toBe(100);
  });

  it('clears the frame phases on the following frame', () => {
    fire(canvas, 'pointerover', { clientX: 10, clientY: 10 });
    fire(canvas, 'pointerdown', { clientX: 10, clientY: 10, buttons: 1 });

    const pointer = getPointer();

    im.update(0 as never);
    expect(pointer.pressed).toBe(true);

    im.update(0 as never);
    expect(pointer.pressed).toBe(false);
    expect(pointer.down).toBe(true);
  });
});

describe('press excursion tracking', () => {
  it('accumulates the maximum distance rather than the release distance', () => {
    fire(canvas, 'pointerover', { clientX: 0, clientY: 0 });
    im.update(0 as never);

    fire(canvas, 'pointerdown', { clientX: 0, clientY: 0, buttons: 1 });
    fire(canvas, 'pointermove', { clientX: 100, clientY: 0, buttons: 1 });
    fire(canvas, 'pointermove', { clientX: 2, clientY: 0, buttons: 1 });

    const pointer = getPointer();

    expect(pointer.maxDistanceFromPress).toBe(100);
  });

  it('classifies an out-and-back press as a swipe, not a tap', () => {
    fire(canvas, 'pointerover', { clientX: 0, clientY: 0 });
    im.update(0 as never);

    const taps = vi.fn();
    const swipes = vi.fn();

    im.onPointerTap.add(taps);
    im.onPointerSwipe.add(swipes);

    fire(canvas, 'pointerdown', { clientX: 0, clientY: 0, buttons: 1 });
    fire(canvas, 'pointermove', { clientX: 100, clientY: 0, buttons: 1 });
    fire(canvas, 'pointermove', { clientX: 2, clientY: 0, buttons: 1 });
    fire(canvas, 'pointerup', { clientX: 2, clientY: 0, buttons: 0 });
    im.update(0 as never);

    expect(swipes).toHaveBeenCalledTimes(1);
    expect(taps).not.toHaveBeenCalled();
  });

  it('still taps when the pointer never left the threshold', () => {
    fire(canvas, 'pointerover', { clientX: 0, clientY: 0 });
    im.update(0 as never);

    const taps = vi.fn();

    im.onPointerTap.add(taps);

    fire(canvas, 'pointerdown', { clientX: 0, clientY: 0, buttons: 1 });
    fire(canvas, 'pointermove', { clientX: 3, clientY: 0, buttons: 1 });
    fire(canvas, 'pointerup', { clientX: 3, clientY: 0, buttons: 0 });
    im.update(0 as never);

    expect(taps).toHaveBeenCalledTimes(1);
  });

  it('emits neither tap nor swipe for a release that closed no press', () => {
    fire(canvas, 'pointerover', { clientX: 0, clientY: 0 });
    im.update(0 as never);

    const taps = vi.fn();
    const swipes = vi.fn();

    im.onPointerTap.add(taps);
    im.onPointerSwipe.add(swipes);

    fire(canvas, 'pointerup', { clientX: 0, clientY: 0, buttons: 0 });
    im.update(0 as never);

    expect(taps).not.toHaveBeenCalled();
    expect(swipes).not.toHaveBeenCalled();
  });

  it('keeps the press position readable after release', () => {
    fire(canvas, 'pointerover', { clientX: 0, clientY: 0 });
    im.update(0 as never);

    fire(canvas, 'pointerdown', { clientX: 30, clientY: 40, buttons: 1 });
    fire(canvas, 'pointerup', { clientX: 31, clientY: 41, buttons: 0 });

    const pointer = getPointer();

    im.update(0 as never);

    expect([pointer.pressPosition.x, pointer.pressPosition.y]).toEqual([30, 40]);
    expect([pointer.releasePosition.x, pointer.releasePosition.y]).toEqual([31, 41]);
  });
});

describe('per-frame delta', () => {
  it('spans the previous frame boundary, collapsing several moves into one', () => {
    fire(canvas, 'pointerover', { clientX: 100, clientY: 100 });
    im.update(0 as never);

    const pointer = getPointer();

    fire(canvas, 'pointermove', { clientX: 120, clientY: 100 });
    fire(canvas, 'pointermove', { clientX: 140, clientY: 110 });
    im.update(0 as never);

    expect(pointer.delta.x).toBeCloseTo(40);
    expect(pointer.delta.y).toBeCloseTo(10);
    expect(pointer.previousPosition.x).toBeCloseTo(140);
    expect(pointer.previousPosition.y).toBeCloseTo(110);
  });

  it('is zero on a frame without movement', () => {
    fire(canvas, 'pointerover', { clientX: 100, clientY: 100 });
    im.update(0 as never);

    const pointer = getPointer();

    fire(canvas, 'pointermove', { clientX: 120, clientY: 100 });
    im.update(0 as never);
    im.update(0 as never);

    expect([pointer.delta.x, pointer.delta.y]).toEqual([0, 0]);
  });
});

describe('channel peak buffer', () => {
  it('retains a keyboard press that was released before the frame boundary', () => {
    canvas.dispatchEvent(new FocusEvent('focus'));
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 32 } as KeyboardEventInit));
    window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 32 } as KeyboardEventInit));

    expect(peak(im, Keyboard.Space)).toBe(1);
  });

  it('falls back to the live channel value once the frame closes', () => {
    canvas.dispatchEvent(new FocusEvent('focus'));
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 32 } as KeyboardEventInit));
    window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 32 } as KeyboardEventInit));

    im.update(0 as never);

    expect(peak(im, Keyboard.Space)).toBe(0);
  });

  it('keeps reporting a key that is still held', () => {
    canvas.dispatchEvent(new FocusEvent('focus'));
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 32 } as KeyboardEventInit));

    im.update(0 as never);

    expect(peak(im, Keyboard.Space)).toBe(1);
  });
});
