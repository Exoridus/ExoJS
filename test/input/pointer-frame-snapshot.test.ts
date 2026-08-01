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
import { BrowserPlatform } from '#platform/BrowserPlatform';

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
    platform: new BrowserPlatform(canvas),
    width: canvas.width,
    height: canvas.height,
    pixelRatio: 1,
    options: { input: { gamepadDefinitions: [], pointerDistanceThreshold: 10 } },
    _backingStoreToDesign: (x: number, y: number): { x: number; y: number } => ({ x, y }),
  }) as unknown as Application;

const fire = (canvas: HTMLCanvasElement, type: string, init: PointerEventInit): void => {
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', ...init }));
};

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

    im.onPointerDown.add((_p, x, y) => void (seen.down = [x, y]));
    im.onPointerMove.add((_p, x, y) => void (seen.move = [x, y]));
    im.onPointerUp.add((_p, x, y) => void (seen.up = [x, y]));

    fire(canvas, 'pointerdown', { clientX: 10, clientY: 20, buttons: 1 });
    fire(canvas, 'pointermove', { clientX: 50, clientY: 60, buttons: 1 });
    fire(canvas, 'pointerup', { clientX: 90, clientY: 100, buttons: 0 });
    im.update(0 as never);

    expect(seen.down).toEqual([10, 20]);
    expect(seen.move).toEqual([50, 60]);
    expect(seen.up).toEqual([90, 100]);
  });

  it('collapses several moves onto the last of them', () => {
    fire(canvas, 'pointerover', { clientX: 10, clientY: 10 });
    im.update(0 as never);

    const seen: Array<[number, number]> = [];

    im.onPointerMove.add((_p, x, y) => void seen.push([x, y]));

    fire(canvas, 'pointermove', { clientX: 20, clientY: 20 });
    fire(canvas, 'pointermove', { clientX: 30, clientY: 30 });
    fire(canvas, 'pointermove', { clientX: 40, clientY: 40 });
    im.update(0 as never);

    expect(seen).toEqual([[40, 40]]);
  });

  it('dispatches a cancel at the position it was cancelled at', () => {
    fire(canvas, 'pointerover', { clientX: 10, clientY: 10 });
    im.update(0 as never);

    const seen: Array<[number, number]> = [];

    im.onPointerCancel.add((_p, x, y) => void seen.push([x, y]));

    fire(canvas, 'pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    fire(canvas, 'pointercancel', { clientX: 70, clientY: 80, buttons: 0 });
    im.update(0 as never);

    expect(seen).toEqual([[70, 80]]);
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
    expect(pointer.previousPosition.x).toBeCloseTo(100);
    expect(pointer.previousPosition.y).toBeCloseTo(100);
  });

  it('keeps previousPosition spanning delta together with position', () => {
    fire(canvas, 'pointerover', { clientX: 100, clientY: 100 });
    im.update(0 as never);

    const pointer = getPointer();

    fire(canvas, 'pointermove', { clientX: 140, clientY: 110 });
    im.update(0 as never);

    expect(pointer.position.x - pointer.previousPosition.x).toBeCloseTo(pointer.delta.x);
    expect(pointer.position.y - pointer.previousPosition.y).toBeCloseTo(pointer.delta.y);
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

describe('ordered channel event log', () => {
  interface RawChannelEvent {
    readonly channel: number;
    readonly value: number;
  }

  interface RawChannelEventBatch {
    readonly channels: readonly RawChannelEvent[];
  }

  const frameBatches = (manager: InputManager): RawChannelEventBatch[] => (manager as unknown as { frameBatches: RawChannelEventBatch[] }).frameBatches;
  const forSpace = (manager: InputManager): number[] =>
    frameBatches(manager)
      .flatMap(batch => batch.channels)
      .filter(e => e.channel === (Keyboard.Space as number))
      .map(e => e.value);

  const focusAndPress = (code: string): void => {
    canvas.dispatchEvent(new FocusEvent('focus'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  };

  it('records a press then a release in that true order within one frame', () => {
    focusAndPress('Space');
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));

    expect(forSpace(im)).toEqual([1, 0]);
  });

  it('records a release then a fresh press in that true order', () => {
    focusAndPress('Space');
    im.update(0 as never);

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    expect(forSpace(im)).toEqual([0, 1]);
  });

  it('does not consume the log when it is read mid-frame', () => {
    focusAndPress('Space');

    expect(forSpace(im)).toEqual([1]);
    expect(forSpace(im)).toEqual([1]);
  });

  it('clears the log once the frame closes', () => {
    focusAndPress('Space');
    im.update(0 as never);

    expect(forSpace(im)).toEqual([]);
  });

  it('does not log a repeat write of the same value', () => {
    focusAndPress('Space');
    im.update(0 as never);
    im.update(0 as never); // still held, no new platform event

    expect(forSpace(im)).toEqual([]);
  });
});

describe('keyboard dispatch order', () => {
  it('dispatches a Shift-up followed by a Tab-down in that true order, not grouped by type', () => {
    canvas.dispatchEvent(new FocusEvent('focus'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })); // Shift down
    im.update(0 as never);

    const seen: Array<{ channel: number; pressed: boolean }> = [];

    im.onKeyDown.add(channel => seen.push({ channel, pressed: true }));
    im.onKeyUp.add(channel => seen.push({ channel, pressed: false }));

    // Shift released, THEN Tab pressed — within the same frame. A fixed
    // "all keydowns before all keyups" dispatch order would report Tab's
    // keydown before Shift's keyup, letting a Tab handler still see Shift
    // as held.
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' })); // Tab down
    im.update(0 as never);

    expect(seen).toEqual([
      { channel: Keyboard.ShiftLeft, pressed: false },
      { channel: Keyboard.Tab, pressed: true },
    ]);
  });
});

describe('pointer dispatch order', () => {
  it('dispatches an Up followed by a Down in that true order, not reordered to Down-then-Up', () => {
    fire(canvas, 'pointerover', { clientX: 10, clientY: 10 });
    fire(canvas, 'pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    im.update(0 as never);

    const seen: string[] = [];

    im.onPointerDown.add(() => seen.push('down'));
    im.onPointerUp.add(() => seen.push('up'));

    // Release, then immediately press again — within the same frame. A
    // fixed "Down always dispatches before Up" order would report this
    // backwards.
    fire(canvas, 'pointerup', { clientX: 10, clientY: 10, buttons: 0 });
    fire(canvas, 'pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    im.update(0 as never);

    expect(seen).toEqual(['up', 'down']);
  });

  it('carries a fresh press as a live candidate into the next frame after an up-then-down collapse', () => {
    fire(canvas, 'pointerover', { clientX: 10, clientY: 10 });
    fire(canvas, 'pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    im.update(0 as never);

    fire(canvas, 'pointerup', { clientX: 10, clientY: 10, buttons: 0 });
    fire(canvas, 'pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    im.update(0 as never);

    const pointer = getPointer();

    expect(pointer.down).toBe(true);

    im.update(0 as never); // next frame: no new platform events

    expect(pointer.down).toBe(true);
  });

  it('dispatches two discrete presses within one frame as two separate onPointerDown calls', () => {
    fire(canvas, 'pointerover', { clientX: 10, clientY: 10 });
    im.update(0 as never);

    const downHandler = vi.fn();

    im.onPointerDown.add(downHandler);

    fire(canvas, 'pointerdown', { clientX: 10, clientY: 10, buttons: 1 });
    fire(canvas, 'pointerup', { clientX: 10, clientY: 10, buttons: 0 });
    fire(canvas, 'pointerdown', { clientX: 20, clientY: 20, buttons: 1 });
    im.update(0 as never);

    expect(downHandler).toHaveBeenCalledTimes(2);
  });
});

describe('context menu policy', () => {
  const createManager = (input?: { allowNativeContextMenu?: boolean; allowTextSelection?: boolean }): { im: InputManager; canvas: HTMLCanvasElement } => {
    const c = createCanvas();
    const app = {
      canvas: c,
      platform: new BrowserPlatform(c),
      width: c.width,
      height: c.height,
      pixelRatio: 1,
      options: { input: { gamepadDefinitions: [], pointerDistanceThreshold: 10, ...input } },
      _backingStoreToDesign: (x: number, y: number): { x: number; y: number } => ({ x, y }),
    } as unknown as Application;

    return { im: new InputManager(app), canvas: c };
  };

  it('suppresses the browser menu by default', () => {
    const { im: manager, canvas: c } = createManager();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    c.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    manager.destroy();
  });

  it('leaves the browser menu alone when the application opted in', () => {
    const { im: manager, canvas: c } = createManager({ allowNativeContextMenu: true });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    c.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    manager.destroy();
  });

  it('routes a semantic engine event either way', () => {
    const { im: manager, canvas: c } = createManager({ allowNativeContextMenu: true });
    const seen = vi.fn();

    manager.onContextMenu.add(seen);
    c.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 }));
    manager.update(0 as never);

    c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 }));
    manager.update(0 as never);

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]![0].x).toBe(40);
    expect(seen.mock.calls[0]![0].y).toBe(50);
    manager.destroy();
  });

  it('dispatches at the coordinates the menu was requested at, not where the pointer has since moved', () => {
    const { im: manager, canvas: c } = createManager();
    const seen: Array<[number, number]> = [];

    manager.onContextMenu.add(request => void seen.push([request.x, request.y]));
    c.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 }));
    manager.update(0 as never);

    c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 150 }));
    c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, clientX: 400, clientY: 400 }));
    manager.update(0 as never);

    expect(seen).toEqual([[200, 150]]);
    manager.destroy();
  });

  it('fires app.input.onContextMenu with a null pointer when no pointer has ever touched the surface', () => {
    const { im: manager, canvas: c } = createManager({ allowNativeContextMenu: true });
    const seen = vi.fn();

    manager.onContextMenu.add(seen);

    // The keyboard context-menu key / Shift+F10 funnel into this same native
    // event — no prior pointerover/pointerdown means no pointer was ever
    // tracked, but the request itself must still carry real coordinates.
    c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 }));
    manager.update(0 as never);

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]![0]).toEqual({ x: 40, y: 50, pointer: null });
    manager.destroy();
  });

  it('dispatches the engine event once per request', () => {
    const { im: manager, canvas: c } = createManager();
    const seen = vi.fn();

    manager.onContextMenu.add(seen);
    c.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 }));
    manager.update(0 as never);

    c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    manager.update(0 as never);
    manager.update(0 as never);

    expect(seen).toHaveBeenCalledTimes(1);
    manager.destroy();
  });

  it('suppresses text selection by default and honours the opt-in', () => {
    const suppressed = createManager();
    const blocked = new Event('selectstart', { bubbles: true, cancelable: true });

    suppressed.canvas.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    suppressed.im.destroy();

    const allowed = createManager({ allowTextSelection: true });
    const passed = new Event('selectstart', { bubbles: true, cancelable: true });

    allowed.canvas.dispatchEvent(passed);
    expect(passed.defaultPrevented).toBe(false);
    allowed.im.destroy();
  });
});
