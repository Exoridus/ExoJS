/**
 * Tests for unified Pointer channel-buffer integration:
 * slot allocation, normalization, multi-touch, gestures, and long-press.
 */

import type { Application } from '#core/Application';
import { InputManager } from '#input/InputManager';
import { Pointer } from '#input/Pointer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createCanvas = (width = 800, height = 600): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  // getBoundingClientRect must match logical pixel position for normalisation.
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

/**
 * Minimal Application stand-in exposing the surface the input system reads:
 * the canvas, input options, the design size, and the backing-store → design
 * mapping. With `pixelRatio = 1` (the default) the design size equals the
 * backing store, so coordinates pass through 1:1; a higher ratio shrinks the
 * design space accordingly (the content viewport covers the full backing store
 * outside `'letterbox'` mode).
 */
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

const createInputManager = (canvas?: HTMLCanvasElement, pixelRatio = 1): InputManager => {
  const c = canvas ?? createCanvas();

  return new InputManager(createMockApp(c, pixelRatio));
};

/** Fire a pointer event on the canvas and return it. */
const fire = (canvas: HTMLCanvasElement, type: string, init: PointerEventInit): PointerEvent => {
  const evt = new PointerEvent(type, { bubbles: true, ...init });

  canvas.dispatchEvent(evt);

  return evt;
};

/** Sequence: pointerover → (optional) pointerdown */
const pointerOver = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
  fire(canvas, 'pointerover', init);
};

const pointerDown = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
  fire(canvas, 'pointerdown', init);
};

const pointerMove = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
  fire(canvas, 'pointermove', init);
};

const pointerUp = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
  fire(canvas, 'pointerup', init);
};

const pointerLeave = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
  fire(canvas, 'pointerleave', init);
};

const pointerCancel = (canvas: HTMLCanvasElement, init: PointerEventInit): void => {
  fire(canvas, 'pointercancel', init);
};

// Channel accessors directly via Pointer namespace consts.
const ch = (im: InputManager, channel: number): number => (im as unknown as { channels: Float32Array }).channels[channel];

// ---------------------------------------------------------------------------
// 1. Single mouse pointer-down sets Active=1, IsMouse=1, IsTouch=0
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — mouse', () => {
  test('single mouse pointer-down writes Active=1, IsMouse=1, IsTouch=0', () => {
    const canvas = createCanvas();
    const im = createInputManager(canvas);

    pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 200, isPrimary: true });
    pointerDown(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 100,
      clientY: 200,
      buttons: 1,
      isPrimary: true,
    });

    expect(ch(im, Pointer.Active)).toBe(1);
    expect(ch(im, Pointer.IsMouse)).toBe(1);
    expect(ch(im, Pointer.IsTouch)).toBe(0);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 2. Single touch pointer-down sets Active=1, IsTouch=1, IsMouse=0
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — touch', () => {
  test('single touch pointer-down writes Active=1, IsTouch=1, IsMouse=0', () => {
    const canvas = createCanvas();
    const im = createInputManager(canvas);

    pointerOver(canvas, { pointerId: 10, pointerType: 'touch', clientX: 50, clientY: 80, isPrimary: true });
    pointerDown(canvas, { pointerId: 10, pointerType: 'touch', clientX: 50, clientY: 80, isPrimary: true });

    expect(ch(im, Pointer.Active)).toBe(1);
    expect(ch(im, Pointer.IsTouch)).toBe(1);
    expect(ch(im, Pointer.IsMouse)).toBe(0);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 3. Two simultaneous touch pointers occupy slots 0 and 1
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — multi-touch', () => {
  test('two simultaneous touch pointers occupy slot 0 and slot 1', () => {
    const canvas = createCanvas();
    const im = createInputManager(canvas);

    // First touch.
    pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });
    pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });

    // Second touch.
    pointerOver(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 200, isPrimary: false });
    pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 200, isPrimary: false });

    expect(ch(im, Pointer.Slot0Active)).toBe(1);
    expect(ch(im, Pointer.Slot1Active)).toBe(1);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 4. Releasing slot 0 frees it; next pointer lands in slot 0 again
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — slot reuse', () => {
  test('after slot 0 is released, the next new pointer lands in slot 0', () => {
    const canvas = createCanvas();
    const im = createInputManager(canvas);

    // Pointer 1 takes slot 0.
    pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    expect(ch(im, Pointer.Slot0Active)).toBe(1);

    // Pointer 1 leaves → slot 0 freed.
    pointerLeave(canvas, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10, isPrimary: true });
    expect(ch(im, Pointer.Slot0Active)).toBe(0);

    // Pointer 2 should land in slot 0 again (front of free-list).
    pointerOver(canvas, { pointerId: 2, pointerType: 'touch', clientX: 20, clientY: 20, isPrimary: true });
    pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 20, clientY: 20, isPrimary: true });
    expect(ch(im, Pointer.Slot0Active)).toBe(1);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 5. 17th simultaneous pointer is silently dropped
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — 16 pointer maximum', () => {
  test('the 17th simultaneous pointer is silently dropped', () => {
    const canvas = createCanvas();
    const im = createInputManager(canvas);

    // Allocate all 16 slots.
    for (let i = 1; i <= 16; i++) {
      pointerOver(canvas, { pointerId: i, pointerType: 'touch', clientX: i * 10, clientY: 10, isPrimary: i === 1 });
    }

    // Verify all 16 slots are active.
    for (let s = 0; s < 16; s++) {
      expect(ch(im, Pointer.Slot0Active + s * 16)).toBe(1);
    }

    // 17th pointer — should be silently ignored (no crash, no slot written).
    expect(() => {
      pointerOver(canvas, { pointerId: 17, pointerType: 'touch', clientX: 170, clientY: 10, isPrimary: false });
    }).not.toThrow();

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 6. pointermove updates channels[Pointer.X] and channels[Pointer.Y]
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — move normalization', () => {
  test('pointermove writes normalized x/y to channels', () => {
    const canvas = createCanvas(800, 600); // 0..1 maps to 0..800 / 0..600
    const im = createInputManager(canvas);

    pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0, isPrimary: true });
    pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 400, clientY: 300, isPrimary: true });

    expect(ch(im, Pointer.X)).toBeCloseTo(0.5, 5);
    expect(ch(im, Pointer.Y)).toBeCloseTo(0.5, 5);

    im.destroy();
  });

  test('off-canvas coordinates are clamped to [0, 1]', () => {
    const canvas = createCanvas(800, 600);
    const im = createInputManager(canvas);

    pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0, isPrimary: true });
    pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: -100, clientY: 900, isPrimary: true });

    expect(ch(im, Pointer.X)).toBe(0);
    expect(ch(im, Pointer.Y)).toBe(1);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 7. Pressure, width/height, twist, tilt are written
// ---------------------------------------------------------------------------

describe('Pointer channel buffer — extended properties', () => {
  test('pressure, width, height, twist, tiltX, tiltY are normalized and written', () => {
    const canvas = createCanvas(800, 600);
    const im = createInputManager(canvas);

    pointerOver(canvas, {
      pointerId: 1,
      pointerType: 'pen',
      clientX: 400,
      clientY: 300,
      pressure: 0.75,
      width: 80, // 80 / 800 = 0.1
      height: 60, // 60 / 600 = 0.1
      twist: 180, // 180 / 359 ≈ 0.5014
      tiltX: 45, // (45 + 90) / 180 = 0.75
      tiltY: -45, // (-45 + 90) / 180 = 0.25
      isPrimary: true,
    });

    expect(ch(im, Pointer.Pressure)).toBeCloseTo(0.75, 5);
    expect(ch(im, Pointer.Width)).toBeCloseTo(80 / 800, 5);
    expect(ch(im, Pointer.Height)).toBeCloseTo(60 / 600, 5);
    expect(ch(im, Pointer.Twist)).toBeCloseTo(180 / 359, 5);
    expect(ch(im, Pointer.TiltX)).toBeCloseTo((45 + 90) / 180, 5);
    expect(ch(im, Pointer.TiltY)).toBeCloseTo((-45 + 90) / 180, 5);
    expect(ch(im, Pointer.IsPen)).toBe(1);

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 8. Pinch: two touch pointers move apart → onPinch fires with scale > 1
// ---------------------------------------------------------------------------

describe('Gesture — pinch', () => {
  test('two touch pointers spreading apart fire onPinch with scale > 1', () => {
    const canvas = createCanvas(800, 600);
    const im = createInputManager(canvas);

    const pinchSpy = vi.fn();

    im.onPinch.add(pinchSpy);

    // Two touches start close together.
    pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 300, isPrimary: true });
    pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 300, isPrimary: true });

    pointerOver(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 300, isPrimary: false });
    pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 300, isPrimary: false });

    // First move establishes the distance baseline.
    pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 300, isPrimary: true });

    // Second move increases the distance → pinch fires.
    pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 300, isPrimary: true });

    expect(pinchSpy).toHaveBeenCalledTimes(1);
    const [scale] = pinchSpy.mock.calls[0] as [number, unknown];

    expect(scale).toBeGreaterThan(1); // fingers spreading → scale > 1

    im.destroy();
  });

  test('two mouse pointers do not fire onPinch (mice cannot pinch)', () => {
    const canvas = createCanvas(800, 600);
    const im = createInputManager(canvas);

    const pinchSpy = vi.fn();

    im.onPinch.add(pinchSpy);

    pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 300, isPrimary: true });
    pointerDown(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 300, isPrimary: true });

    pointerOver(canvas, { pointerId: 2, pointerType: 'mouse', clientX: 200, clientY: 300, isPrimary: false });
    pointerDown(canvas, { pointerId: 2, pointerType: 'mouse', clientX: 200, clientY: 300, isPrimary: false });

    pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 300, isPrimary: true });

    expect(pinchSpy).not.toHaveBeenCalled();

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 9. Long-press: pointer held ≥ 500ms fires onLongPress
// ---------------------------------------------------------------------------

describe('Gesture — long press', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  test('pointer held 600ms without moving fires onLongPress', () => {
    const canvas = createCanvas();
    const im = createInputManager(canvas);

    const longPressSpy = vi.fn();

    im.onLongPress.add(longPressSpy);

    pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });
    pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });

    expect(longPressSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);

    expect(longPressSpy).toHaveBeenCalledTimes(1);

    im.destroy();
  });

  test('pointer that moves beyond threshold cancels long-press', () => {
    const canvas = createCanvas();
    const im = createInputManager(canvas);
    const longPressSpy = vi.fn();

    im.onLongPress.add(longPressSpy);

    pointerOver(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });
    pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, isPrimary: true });

    // Move well beyond the 10px threshold.
    pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 100, isPrimary: true });

    vi.advanceTimersByTime(600);

    expect(longPressSpy).not.toHaveBeenCalled();

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 10. Coordinate mapping when the canvas is displayed at a different size
//     (sizingMode 'fit'/'shrink' or a CSS transform: scale)
// ---------------------------------------------------------------------------

describe('Pointer coordinate mapping — scaled canvas', () => {
  // Backing store 800x600, but displayed (CSS) at 400x300 — e.g. object-fit
  // contain or transform: scale(0.5). getBoundingClientRect reflects the
  // displayed (CSS) size; raw pointer coordinates must map into design space
  // (here pixelRatio=1 so design == backing store) so picking matches node
  // positions / screenToWorld.
  const createScaledCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');

    canvas.width = 800;
    canvas.height = 600;

    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    return canvas;
  };

  const getPointer = (im: InputManager, id: number): Pointer => (im as unknown as { pointers: Record<number, Pointer> }).pointers[id];

  test('constructor maps CSS-display coordinates to design pixels', () => {
    const canvas = createScaledCanvas();
    const im = createInputManager(canvas);

    // Display center (200,150) → design center (400,300) — 2x, since the canvas
    // is shown at half its size and design == backing store at pixelRatio 1.
    pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 150, isPrimary: true });

    const pointer = getPointer(im, 1);

    expect(pointer.x).toBeCloseTo(400, 5);
    expect(pointer.y).toBeCloseTo(300, 5);

    // The normalized channel is scale-invariant and stays correct regardless.
    expect(ch(im, Pointer.X)).toBeCloseTo(0.5, 5);
    expect(ch(im, Pointer.Y)).toBeCloseTo(0.5, 5);

    im.destroy();
  });

  test('pointermove keeps the mapping (handleEvent path)', () => {
    const canvas = createScaledCanvas();
    const im = createInputManager(canvas);

    pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0, isPrimary: true });
    pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 75, isPrimary: true });

    const pointer = getPointer(im, 1);

    expect(pointer.x).toBeCloseTo(200, 5); // 100 * 800/400
    expect(pointer.y).toBeCloseTo(150, 5); // 75 * 600/300

    im.destroy();
  });
});

// ---------------------------------------------------------------------------
// 11. pixelRatio > 1: pointer reads design pixels, not physical backing-store
// ---------------------------------------------------------------------------

describe('Pointer coordinate mapping — pixelRatio > 1', () => {
  // Design 800x600 rendered at pixelRatio 2 → backing store 1600x1200, but the
  // canvas is displayed (CSS) at its design size 800x600. Pointer coordinates
  // must come out in design pixels (0..800 × 0..600), independent of DPR.
  const createDprCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');

    canvas.width = 1600;
    canvas.height = 1200;

    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    return canvas;
  };

  const getPointer = (im: InputManager, id: number): Pointer => (im as unknown as { pointers: Record<number, Pointer> }).pointers[id];

  test('pointer position is in design pixels regardless of pixelRatio', () => {
    const canvas = createDprCanvas();
    const im = createInputManager(canvas, 2);

    // Display center (400,300) → design center (400,300), not the physical
    // backing-store center (800,600).
    pointerOver(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 400, clientY: 300, isPrimary: true });

    const pointer = getPointer(im, 1);

    expect(pointer.x).toBeCloseTo(400, 5);
    expect(pointer.y).toBeCloseTo(300, 5);

    // Normalized channels stay 0..1 (scale-invariant).
    expect(ch(im, Pointer.X)).toBeCloseTo(0.5, 5);
    expect(ch(im, Pointer.Y)).toBeCloseTo(0.5, 5);

    im.destroy();
  });
});
