/**
 * Tests for InputManager's DOM event-driven signal paths: keyboard, mouse
 * wheel, canvas/window focus-blur, pointer signal flushing (update()-based),
 * binding factories (onStart/onActive/onStop/onTrigger + captured-channel
 * preventDefault), destroy cleanup, and gamepad-slot edge cases not covered
 * by `input-manager.test.ts` (which focuses on the gamepad lifecycle) or
 * `pointer-channels.test.ts` (which focuses on the raw channel buffer).
 */

import type { Application } from '#core/Application';
import { Gamepad } from '#input/Gamepad';
import { GamepadButton } from '#input/GamepadButton';
import { InputManager } from '#input/InputManager';
import { Pointer } from '#input/Pointer';
import { Keyboard } from '#input/types';

// ---------------------------------------------------------------------------
// Helpers (mirrors test/input/pointer-channels.test.ts conventions)
// ---------------------------------------------------------------------------

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

const createMockApp = (canvas: HTMLCanvasElement, pixelRatio = 1): Application => {
  const designWidth = canvas.width / pixelRatio;
  const designHeight = canvas.height / pixelRatio;

  return {
    canvas,
    width: designWidth,
    height: designHeight,
    pixelRatio,
    options: {
      input: {
        gamepadDefinitions: [],
        pointerDistanceThreshold: 10,
      },
    },
    _backingStoreToDesign: (backingStoreX: number, backingStoreY: number): { x: number; y: number } => ({
      x: (backingStoreX / canvas.width) * designWidth,
      y: (backingStoreY / canvas.height) * designHeight,
    }),
  } as unknown as Application;
};

const createInputManager = (canvas?: HTMLCanvasElement): { im: InputManager; canvas: HTMLCanvasElement } => {
  const c = canvas ?? createCanvas();

  return { im: new InputManager(createMockApp(c)), canvas: c };
};

const ch = (im: InputManager, channel: number): number => (im as unknown as { channels: Float32Array }).channels[channel];

const fire = (canvas: HTMLCanvasElement, type: string, init: PointerEventInit): PointerEvent => {
  const evt = new PointerEvent(type, { bubbles: true, ...init });

  canvas.dispatchEvent(evt);

  return evt;
};

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const createNativeGamepad = (id: string, index = 0, buttonValues: number[] = [], axesValues: number[] = []): BrowserGamepad =>
  ({
    id,
    index,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: axesValues,
    buttons: buttonValues.map(value => ({ value, pressed: value > 0, touched: value > 0 })),
    vibrationActuator: null,
  }) as unknown as BrowserGamepad;

// `InputManager.update()` unconditionally polls `navigator.getGamepads()`,
// which jsdom does not implement at all (not merely empty — the property is
// undefined). Stub it to an empty snapshot for every test in this file;
// `withMockedGetGamepads` below layers a per-test snapshot on top for the
// gamepad-specific tests and restores this default afterwards.
let restoreGetGamepads: (() => void) | null = null;

beforeEach(() => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads');

  Object.defineProperty(window.navigator, 'getGamepads', {
    configurable: true,
    value: (): ReturnType<Navigator['getGamepads']> => [] as unknown as ReturnType<Navigator['getGamepads']>,
  });

  restoreGetGamepads = (): void => {
    if (originalDescriptor) {
      Object.defineProperty(window.navigator, 'getGamepads', originalDescriptor);
    } else {
      delete (window.navigator as { getGamepads?: unknown }).getGamepads;
    }
  };
});

afterEach(() => {
  restoreGetGamepads?.();
});

const withMockedGetGamepads = (run: (setSnapshot: (snapshot: Array<BrowserGamepad | null>) => void) => void): void => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads');
  let snapshot: Array<BrowserGamepad | null> = [];

  Object.defineProperty(window.navigator, 'getGamepads', {
    configurable: true,
    value: (): ReturnType<Navigator['getGamepads']> => snapshot as ReturnType<Navigator['getGamepads']>,
  });

  try {
    run(next => {
      snapshot = next;
    });
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(window.navigator, 'getGamepads', originalDescriptor);
    }
  }
};

// ---------------------------------------------------------------------------
// Constructor defaults
// ---------------------------------------------------------------------------

describe('InputManager — constructor option defaults', () => {
  test('falls back to defaults when app.options.input is entirely absent', () => {
    const canvas = createCanvas();
    const app = { canvas, options: {} } as unknown as Application;
    const im = new InputManager(app);

    expect(im.gamepadSlotStrategy).toBe('sticky');
    expect(im.gamepads).toHaveLength(4);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

describe('InputManager — keyboard', () => {
  test('keydown/keyup are ignored while the canvas is not focused', () => {
    const { im } = createInputManager();
    const onKeyDown = vi.fn();
    const onKeyUp = vi.fn();

    im.onKeyDown.add(onKeyDown);
    im.onKeyUp.add(onKeyUp);
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.Space } as KeyboardEventInit));
    window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: Keyboard.Space } as KeyboardEventInit));
    im.update();

    expect(ch(im, Keyboard.Space)).toBe(0);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onKeyUp).not.toHaveBeenCalled();

    im.destroy();
  });

  test('canvas focus dispatch enables keyboard channels and fires onCanvasFocusChange(true) exactly once', () => {
    const { im, canvas } = createInputManager();
    const onFocusChange = vi.fn();

    im.onCanvasFocusChange.add(onFocusChange);

    canvas.dispatchEvent(new FocusEvent('focus'));
    canvas.dispatchEvent(new FocusEvent('focus')); // second dispatch while already focused: no-op

    expect(im.canvasFocused).toBe(true);
    expect(onFocusChange).toHaveBeenCalledTimes(1);
    expect(onFocusChange).toHaveBeenCalledWith(true);

    im.destroy();
  });

  test('keydown while focused sets channel=1, pushes to pressed queue, and dispatches onKeyDown on update()', () => {
    const { im, canvas } = createInputManager();
    const onKeyDown = vi.fn();

    im.onKeyDown.add(onKeyDown);
    canvas.dispatchEvent(new FocusEvent('focus'));

    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.Space } as KeyboardEventInit));

    expect(ch(im, Keyboard.Space)).toBe(1);
    expect(onKeyDown).not.toHaveBeenCalled(); // not flushed until update()

    im.update();

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledWith(Keyboard.Space);

    im.destroy();
  });

  test('keyup while focused clears channel and dispatches onKeyUp on update()', () => {
    const { im, canvas } = createInputManager();
    const onKeyUp = vi.fn();

    im.onKeyUp.add(onKeyUp);
    canvas.dispatchEvent(new FocusEvent('focus'));

    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.A } as KeyboardEventInit));
    im.update();

    window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: Keyboard.A } as KeyboardEventInit));
    expect(ch(im, Keyboard.A)).toBe(0);

    im.update();

    expect(onKeyUp).toHaveBeenCalledTimes(1);
    expect(onKeyUp).toHaveBeenCalledWith(Keyboard.A);

    im.destroy();
  });

  test('canvas blur releases every pressed keyboard channel and fires onCanvasFocusChange(false)', () => {
    const { im, canvas } = createInputManager();
    const onKeyUp = vi.fn();
    const onFocusChange = vi.fn();

    im.onKeyUp.add(onKeyUp);
    im.onCanvasFocusChange.add(onFocusChange);
    canvas.dispatchEvent(new FocusEvent('focus'));

    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.A } as KeyboardEventInit));
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.B } as KeyboardEventInit));
    im.update();
    onKeyUp.mockClear();

    canvas.dispatchEvent(new FocusEvent('blur'));

    expect(im.canvasFocused).toBe(false);
    expect(ch(im, Keyboard.A)).toBe(0);
    expect(ch(im, Keyboard.B)).toBe(0);

    im.update();

    expect(onKeyUp).toHaveBeenCalledTimes(2);
    expect(onFocusChange).toHaveBeenCalledWith(false);

    // A second blur while already unfocused is a no-op (no duplicate dispatch).
    onFocusChange.mockClear();
    canvas.dispatchEvent(new FocusEvent('blur'));
    expect(onFocusChange).not.toHaveBeenCalled();

    im.destroy();
  });

  test('window blur behaves like canvas blur: releases keys and fires onCanvasFocusChange(false)', () => {
    const { im, canvas } = createInputManager();
    const onFocusChange = vi.fn();

    im.onCanvasFocusChange.add(onFocusChange);
    canvas.dispatchEvent(new FocusEvent('focus'));

    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.Space } as KeyboardEventInit));
    im.update();

    window.dispatchEvent(new FocusEvent('blur'));

    expect(im.canvasFocused).toBe(false);
    expect(ch(im, Keyboard.Space)).toBe(0);
    expect(onFocusChange).toHaveBeenCalledWith(false);

    im.destroy();
  });

  test('window blur while the canvas was never focused is a no-op', () => {
    const { im } = createInputManager();
    const onFocusChange = vi.fn();

    im.onCanvasFocusChange.add(onFocusChange);

    window.dispatchEvent(new FocusEvent('blur'));

    expect(im.canvasFocused).toBe(false);
    expect(onFocusChange).not.toHaveBeenCalled();

    im.destroy();
  });

  test('a captured key channel (bound via onStart) suppresses the default keydown/keyup behavior', () => {
    const { im, canvas } = createInputManager();

    canvas.dispatchEvent(new FocusEvent('focus'));
    const binding = im.onStart(Keyboard.Space, () => {});

    const downEvent = new KeyboardEvent('keydown', { keyCode: Keyboard.Space, cancelable: true } as KeyboardEventInit);

    window.dispatchEvent(downEvent);
    expect(downEvent.defaultPrevented).toBe(true);

    const upEvent = new KeyboardEvent('keyup', { keyCode: Keyboard.Space, cancelable: true } as KeyboardEventInit);

    window.dispatchEvent(upEvent);
    expect(upEvent.defaultPrevented).toBe(true);

    binding.unbind();
    im.destroy();
  });

  test('an uncaptured key channel does not suppress default keydown behavior', () => {
    const { im, canvas } = createInputManager();

    canvas.dispatchEvent(new FocusEvent('focus'));

    const downEvent = new KeyboardEvent('keydown', { keyCode: Keyboard.Enter, cancelable: true } as KeyboardEventInit);

    window.dispatchEvent(downEvent);

    expect(downEvent.defaultPrevented).toBe(false);

    im.destroy();
  });

  test('ref-counts captured channels: unbinding one of two bindings on the same channel keeps it captured', () => {
    const { im, canvas } = createInputManager();

    canvas.dispatchEvent(new FocusEvent('focus'));
    const bindingA = im.onStart(Keyboard.Space, () => {});
    const bindingB = im.onStart(Keyboard.Space, () => {});

    bindingA.unbind();

    const stillCaptured = new KeyboardEvent('keydown', { keyCode: Keyboard.Space, cancelable: true } as KeyboardEventInit);

    window.dispatchEvent(stillCaptured);
    expect(stillCaptured.defaultPrevented).toBe(true);

    bindingB.unbind();

    const noLongerCaptured = new KeyboardEvent('keydown', { keyCode: Keyboard.Space, cancelable: true } as KeyboardEventInit);

    window.dispatchEvent(noLongerCaptured);
    expect(noLongerCaptured.defaultPrevented).toBe(false);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// Mouse wheel
// ---------------------------------------------------------------------------

describe('InputManager — mouse wheel', () => {
  test('wheel events are ignored while the canvas is not focused', () => {
    const { im, canvas } = createInputManager();
    const onWheel = vi.fn();

    im.onMouseWheel.add(onWheel);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaX: 5, deltaY: 10 }));
    im.update();

    expect(onWheel).not.toHaveBeenCalled();

    im.destroy();
  });

  test('wheel event while focused writes the offset, dispatches onMouseWheel, then resets to zero', () => {
    const { im, canvas } = createInputManager();
    // The dispatched vector is a mutable internal instance reset to (0, 0)
    // right after dispatch, so capture its value synchronously inside the
    // handler rather than reading `mock.calls` afterwards.
    const seen: Array<{ x: number; y: number }> = [];
    const onWheel = vi.fn((vector: { x: number; y: number }) => {
      seen.push({ x: vector.x, y: vector.y });
    });

    im.onMouseWheel.add(onWheel);
    canvas.dispatchEvent(new FocusEvent('focus'));

    const wheelEvent = new WheelEvent('wheel', { deltaX: 4, deltaY: -8, cancelable: true });

    canvas.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(true);

    im.update();

    expect(onWheel).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ x: 4, y: -8 }]);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// Pointer signal flushing (update()-based)
// ---------------------------------------------------------------------------

describe('InputManager — pointer signal lifecycle', () => {
  test('onPointerEnter fires on update() after pointerover', () => {
    const { im, canvas } = createInputManager();
    const onEnter = vi.fn();

    im.onPointerEnter.add(onEnter);
    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });

    expect(onEnter).not.toHaveBeenCalled();
    im.update();
    expect(onEnter).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('a tracked pointer with no pending state change is skipped without affecting others', () => {
    const { im, canvas } = createInputManager();
    const onEnter = vi.fn();
    const onMove = vi.fn();

    im.onPointerEnter.add(onEnter);
    im.onPointerMove.add(onMove);

    // Both pointers arrive and get their Over flag flushed together.
    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerover', { pointerId: 2, pointerType: 'mouse', clientX: 20, clientY: 20, isPrimary: false });
    im.update();
    expect(onEnter).toHaveBeenCalledTimes(2);

    // Only pointer 1 moves this frame; pointer 2 has no pending flags and
    // must be skipped without throwing or firing anything for it.
    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 15, clientY: 15, isPrimary: true });
    im.update();

    expect(onMove).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('onPointerDown fires on update() after pointerdown', () => {
    const { im, canvas } = createInputManager();
    const onDown = vi.fn();

    im.onPointerDown.add(onDown);
    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    im.update();

    expect(onDown).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('onPointerMove fires on update() after pointermove', () => {
    const { im, canvas } = createInputManager();
    const onMove = vi.fn();

    im.onPointerMove.add(onMove);
    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: 20, isPrimary: true });
    im.update();

    expect(onMove).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('release close to the press position fires onPointerUp + onPointerTap (not swipe)', () => {
    const { im, canvas } = createInputManager();
    const onUp = vi.fn();
    const onTap = vi.fn();
    const onSwipe = vi.fn();

    im.onPointerUp.add(onUp);
    im.onPointerTap.add(onTap);
    im.onPointerSwipe.add(onSwipe);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100, isPrimary: true });
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 101, clientY: 100, isPrimary: true });
    im.update();

    expect(onUp).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onSwipe).not.toHaveBeenCalled();

    im.destroy();
  });

  test('release far from the press position fires onPointerUp + onPointerSwipe (not tap)', () => {
    const { im, canvas } = createInputManager();
    const onUp = vi.fn();
    const onTap = vi.fn();
    const onSwipe = vi.fn();

    im.onPointerUp.add(onUp);
    im.onPointerTap.add(onTap);
    im.onPointerSwipe.add(onSwipe);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100, isPrimary: true });
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 100, isPrimary: true });
    im.update();

    expect(onUp).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();

    im.destroy();
  });

  test('onPointerCancel fires on update() after pointercancel', () => {
    const { im, canvas } = createInputManager();
    const onCancel = vi.fn();

    im.onPointerCancel.add(onCancel);
    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointercancel', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    im.update();

    expect(onCancel).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('onPointerLeave fires on update() and removes the pointer from tracking', () => {
    const { im, canvas } = createInputManager();
    const onLeave = vi.fn();

    im.onPointerLeave.add(onLeave);
    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    im.update();

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(im.getPrimaryPointerPosition()).toBeNull();

    im.destroy();
  });

  test('pointer events for an unknown pointerId (no prior pointerover) are safely ignored', () => {
    const { im, canvas } = createInputManager();
    const onMove = vi.fn();
    const onDown = vi.fn();
    const onUp = vi.fn();
    const onLeave = vi.fn();
    const onCancel = vi.fn();

    im.onPointerMove.add(onMove);
    im.onPointerDown.add(onDown);
    im.onPointerUp.add(onUp);
    im.onPointerLeave.add(onLeave);
    im.onPointerCancel.add(onCancel);

    expect(() => {
      fire(canvas, 'pointerdown', { pointerId: 99, pointerType: 'mouse', clientX: 1, clientY: 1 });
      fire(canvas, 'pointermove', { pointerId: 99, pointerType: 'mouse', clientX: 2, clientY: 2 });
      fire(canvas, 'pointerup', { pointerId: 99, pointerType: 'mouse', clientX: 3, clientY: 3 });
      fire(canvas, 'pointerleave', { pointerId: 99, pointerType: 'mouse', clientX: 4, clientY: 4 });
      fire(canvas, 'pointercancel', { pointerId: 99, pointerType: 'mouse', clientX: 5, clientY: 5 });
      im.update();
    }).not.toThrow();

    expect(onMove).not.toHaveBeenCalled();
    expect(onDown).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    im.destroy();
  });

  test('a second pointerleave before update() flushes the first does not double-free the pointer slot', () => {
    const { im, canvas } = createInputManager();

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 1, clientY: 1, isPrimary: true });
    expect(ch(im, Pointer.Slot0Active)).toBe(1);

    // Two leaves in a row without an intervening update(): the pointer is
    // still present in the internal map (removal happens on flush), so the
    // handler runs twice, but the slot must only be released once.
    expect(() => {
      fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'touch', clientX: 1, clientY: 1, isPrimary: true });
      fire(canvas, 'pointerleave', { pointerId: 1, pointerType: 'touch', clientX: 1, clientY: 1, isPrimary: true });
    }).not.toThrow();

    // A newly arriving pointer must land in slot 0, not some slot beyond it —
    // proving the free-list wasn't corrupted by the redundant release.
    fire(canvas, 'pointerover', { pointerId: 2, pointerType: 'touch', clientX: 2, clientY: 2, isPrimary: false });
    expect(ch(im, Pointer.Slot0Active)).toBe(1);
    expect(ch(im, Pointer.Slot1Active)).toBe(0);

    im.destroy();
  });

  test('pointerup without a prior pointerdown fires onPointerUp but neither onPointerTap nor onPointerSwipe', () => {
    const { im, canvas } = createInputManager();
    const onUp = vi.fn();
    const onTap = vi.fn();
    const onSwipe = vi.fn();

    im.onPointerUp.add(onUp);
    im.onPointerTap.add(onTap);
    im.onPointerSwipe.add(onSwipe);

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    fire(canvas, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10, isPrimary: true });
    im.update();

    expect(onUp).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
    expect(onSwipe).not.toHaveBeenCalled();

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// getPrimaryPointerPosition / pointersInCanvas
// ---------------------------------------------------------------------------

describe('InputManager — getPrimaryPointerPosition / pointersInCanvas', () => {
  test('returns null and false when no pointers are tracked', () => {
    const { im } = createInputManager();

    expect(im.getPrimaryPointerPosition()).toBeNull();
    expect(im.pointersInCanvas).toBe(false);

    im.destroy();
  });

  test('returns the primary pointer position when one exists', () => {
    const { im, canvas } = createInputManager();

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 123, clientY: 45, isPrimary: true });

    expect(im.getPrimaryPointerPosition()).toEqual({ x: 123, y: 45 });
    expect(im.pointersInCanvas).toBe(true);

    im.destroy();
  });

  test('falls back to the first non-cancelled pointer when none is primary', () => {
    const { im, canvas } = createInputManager();

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 20, isPrimary: false });
    fire(canvas, 'pointerover', { pointerId: 2, pointerType: 'touch', clientX: 30, clientY: 40, isPrimary: false });

    expect(im.getPrimaryPointerPosition()).toEqual({ x: 10, y: 20 });

    im.destroy();
  });

  test('a cancelled pointer is excluded from both getPrimaryPointerPosition and pointersInCanvas', () => {
    const { im, canvas } = createInputManager();

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 20, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 20, isPrimary: true });
    fire(canvas, 'pointercancel', { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 20, isPrimary: true });

    expect(im.getPrimaryPointerPosition()).toBeNull();
    expect(im.pointersInCanvas).toBe(false);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// Pointer slot re-assignment for a repeated pointerover on the same id
// ---------------------------------------------------------------------------

describe('InputManager — pointer slot allocation', () => {
  test('a repeated pointerover for an already-tracked pointerId does not consume another slot', () => {
    const { im, canvas } = createInputManager();

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 1, clientY: 1, isPrimary: true });
    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'touch', clientX: 2, clientY: 2, isPrimary: true });

    expect(ch(im, Pointer.Slot0Active)).toBe(1);
    expect(ch(im, Pointer.Slot1Active)).toBe(0);

    // A genuinely new pointer must land in the next free slot (1), proving
    // slot 0 was reused rather than leaked by the repeated pointerover above.
    fire(canvas, 'pointerover', { pointerId: 2, pointerType: 'touch', clientX: 3, clientY: 3, isPrimary: false });

    expect(ch(im, Pointer.Slot1Active)).toBe(1);
    expect(ch(im, Pointer.Slot2Active)).toBe(0);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// Binding factories: onStart / onActive / onStop / onTrigger
// ---------------------------------------------------------------------------

describe('InputManager — binding factories', () => {
  test('onStart/onActive fire while the channel is active; onStop/onTrigger fire on release', () => {
    const { im, canvas } = createInputManager();
    const onStart = vi.fn();
    const onActive = vi.fn();
    const onStop = vi.fn();
    const onTrigger = vi.fn();

    im.onStart(Keyboard.Space, onStart);
    im.onActive(Keyboard.Space, onActive);
    im.onStop(Keyboard.Space, onStop);
    im.onTrigger(Keyboard.Space, onTrigger);

    canvas.dispatchEvent(new FocusEvent('focus'));
    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.Space } as KeyboardEventInit));

    im.update();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledTimes(1);

    // Held across a second frame: onActive fires again, onStart does not.
    im.update();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: Keyboard.Space } as KeyboardEventInit));
    im.update();

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledTimes(1); // released promptly, within the default tap threshold

    im.destroy();
  });

  test('onStart accepts an array of channels — any one going active triggers it', () => {
    const { im, canvas } = createInputManager();
    const onStart = vi.fn();

    im.onStart([Keyboard.A, Keyboard.B], onStart);
    canvas.dispatchEvent(new FocusEvent('focus'));

    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.B } as KeyboardEventInit));
    im.update();

    expect(onStart).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('gamepadSlot option remaps a gamepad channel to the requested slot', () => {
    const { im } = createInputManager();
    const onActive = vi.fn();

    im.onActive(GamepadButton.South, onActive, { gamepadSlot: 2 });

    const channels = (im as unknown as { channels: Float32Array }).channels;
    const slot2SouthChannel = Gamepad.resolveChannelOffset(2, GamepadButton.South);

    channels[slot2SouthChannel] = 1;
    im.update();

    expect(onActive).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledWith(1);

    // Slot 0 (the default) must NOT be affected by writes to slot 2.
    const slot0SouthChannel = Gamepad.resolveChannelOffset(0, GamepadButton.South);

    expect(channels[slot0SouthChannel]).toBe(0);

    im.destroy();
  });

  test('unbind() detaches the binding: further channel activity does not dispatch', () => {
    const { im, canvas } = createInputManager();
    const onActive = vi.fn();
    const binding = im.onActive(Keyboard.Space, onActive);

    canvas.dispatchEvent(new FocusEvent('focus'));
    binding.unbind();

    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.Space } as KeyboardEventInit));
    im.update();

    expect(onActive).not.toHaveBeenCalled();

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------

describe('InputManager — destroy', () => {
  test('unbinds outstanding bindings created via onStart/onActive/onStop/onTrigger', () => {
    const { im } = createInputManager();
    const binding = im.onActive(Keyboard.Space, () => {});

    expect((binding as unknown as { _unbound: boolean })._unbound).toBe(false);

    im.destroy();

    expect((binding as unknown as { _unbound: boolean })._unbound).toBe(true);
  });

  test('removes DOM listeners: events dispatched after destroy() have no effect', () => {
    const { im, canvas } = createInputManager();
    const onKeyDown = vi.fn();
    const onPointerDown = vi.fn();

    im.onKeyDown.add(onKeyDown);
    im.onPointerDown.add(onPointerDown);
    canvas.dispatchEvent(new FocusEvent('focus'));

    im.destroy();

    window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: Keyboard.Space } as KeyboardEventInit));
    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 1, clientY: 1, isPrimary: true });
    fire(canvas, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 1, clientY: 1, isPrimary: true });

    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  test('clears tracked pointers so getPrimaryPointerPosition() returns null afterwards', () => {
    const { im, canvas } = createInputManager();

    fire(canvas, 'pointerover', { pointerId: 1, pointerType: 'mouse', clientX: 1, clientY: 1, isPrimary: true });
    expect(im.getPrimaryPointerPosition()).not.toBeNull();

    im.destroy();

    expect(im.getPrimaryPointerPosition()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Gamepad edge cases not covered by input-manager.test.ts
// ---------------------------------------------------------------------------

describe('InputManager — gamepad edge cases', () => {
  test('gamepadSlotStrategy exposes the resolved strategy ("sticky" by default)', () => {
    const { im } = createInputManager();

    expect(im.gamepadSlotStrategy).toBe('sticky');

    im.destroy();
  });

  test('a browserGamepad snapshot entry with a negative index is skipped', () => {
    const { im } = createInputManager();
    const onConnected = vi.fn();

    im.onGamepadConnected.add(onConnected);

    withMockedGetGamepads(setSnapshot => {
      setSnapshot([createNativeGamepad('bogus', -1)]);
      im.update();

      expect(onConnected).not.toHaveBeenCalled();
      expect(im.hasGamepad).toBe(false);
    });

    im.destroy();
  });

  test('a 5th connecting pad is silently ignored once all 4 slots are filled', () => {
    const { im } = createInputManager();
    const onConnected = vi.fn();

    im.onGamepadConnected.add(onConnected);

    withMockedGetGamepads(setSnapshot => {
      setSnapshot([
        createNativeGamepad('Vendor: 045e Product: 0b13', 0),
        createNativeGamepad('Vendor: 054c Product: 0ce6', 1),
        createNativeGamepad('Vendor: 057e Product: 2009', 2),
        createNativeGamepad('Vendor: 045e Product: 0b13', 3),
      ]);
      im.update();
      expect(onConnected).toHaveBeenCalledTimes(4);

      // A 5th physical pad connects (browser index 4) — no free slot remains.
      setSnapshot([
        createNativeGamepad('Vendor: 045e Product: 0b13', 0),
        createNativeGamepad('Vendor: 054c Product: 0ce6', 1),
        createNativeGamepad('Vendor: 057e Product: 2009', 2),
        createNativeGamepad('Vendor: 045e Product: 0b13', 3),
        createNativeGamepad('Vendor: 054c Product: 0ce6', 4),
      ]);
      im.update();

      expect(onConnected).toHaveBeenCalledTimes(4);
      expect(im.connectedGamepadCount).toBe(4);
    });

    im.destroy();
  });

  test('onAnyGamepadAxisChange fires when an axis value changes between frames', () => {
    const { im } = createInputManager();
    const onAxisChange = vi.fn();

    im.onAnyGamepadAxisChange.add(onAxisChange);

    withMockedGetGamepads(setSnapshot => {
      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [], [0])]);
      im.update();

      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [], [0.75])]);
      im.update();

      expect(onAxisChange).toHaveBeenCalled();
      const [pad, , value] = onAxisChange.mock.calls[onAxisChange.mock.calls.length - 1] as [Gamepad, unknown, number];

      expect(pad).toBe(im.gamepads[0]);
      expect(value).toBeCloseTo(0.75, 2);
    });

    im.destroy();
  });

  test('onAnyGamepadButtonDown/Up fire for any slot', () => {
    const { im } = createInputManager();
    const onButtonDown = vi.fn();
    const onButtonUp = vi.fn();

    im.onAnyGamepadButtonDown.add(onButtonDown);
    im.onAnyGamepadButtonUp.add(onButtonUp);

    withMockedGetGamepads(setSnapshot => {
      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [0])]);
      im.update();

      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [1])]);
      im.update();

      expect(onButtonDown).toHaveBeenCalledTimes(1);
      expect(onButtonDown.mock.calls[0][0]).toBe(im.gamepads[0]);

      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [0])]);
      im.update();

      expect(onButtonUp).toHaveBeenCalledTimes(1);
    });

    im.destroy();
  });
});
