/**
 * Pointer lock: the platform seam that requests and reports it, the
 * `InputSystem` surface built on top, and the relative motion a locked pointer
 * reports in place of a position.
 */

import type { Application } from '#core/Application';
import { InputSystem } from '#input/InputSystem';
import type { Pointer } from '#input/Pointer';
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

const fire = (canvas: HTMLCanvasElement, type: string, init: PointerEventInit): void => {
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', ...init }));
};

/** Pretend the host granted (or ended) a lock on `element`, and announce it. */
const setLockElement = (element: Element | null): void => {
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: element });
  document.dispatchEvent(new Event('pointerlockchange'));
};

let canvas: HTMLCanvasElement;
let platform: BrowserPlatform;
let im: InputSystem;

// `InputSystem.update()` unconditionally polls `navigator.getGamepads()`, which
// jsdom does not implement.
beforeAll(() => {
  Object.defineProperty(window.navigator, 'getGamepads', {
    configurable: true,
    value: (): ReturnType<Navigator['getGamepads']> => [] as unknown as ReturnType<Navigator['getGamepads']>,
  });
});

beforeEach(() => {
  canvas = createCanvas();
  platform = new BrowserPlatform(canvas);
  im = new InputSystem(createMockApp(canvas, platform));
});

afterEach(() => {
  im.destroy();
  platform.destroy();
  Reflect.deleteProperty(document as unknown as Record<string, unknown>, 'pointerLockElement');
});

const getPointer = (): Pointer => {
  const pointers = (im as unknown as { pointers: Map<number, Pointer> }).pointers;
  const pointer = pointers.get(1);

  if (!pointer) {
    throw new Error('expected pointer 1 to be tracked');
  }

  return pointer;
};

describe('BrowserPlatform pointer lock', () => {
  test('reports the lock against the surface, not against any locked element', () => {
    expect(platform.pointerLocked).toBe(false);

    setLockElement(document.createElement('div'));
    expect(platform.pointerLocked).toBe(false);

    setLockElement(canvas);
    expect(platform.pointerLocked).toBe(true);
  });

  test('announces every change once, and stops when the subscription is undone', () => {
    const seen: boolean[] = [];
    const unsubscribe = platform.onPointerLockChange(locked => void seen.push(locked));

    setLockElement(canvas);
    // A change that leaves the answer where it was raises nothing.
    document.dispatchEvent(new Event('pointerlockchange'));
    setLockElement(null);

    expect(seen).toEqual([true, false]);

    unsubscribe();
    setLockElement(canvas);

    expect(seen).toEqual([true, false]);
  });

  test('degrades rather than throwing on a host without the API', () => {
    expect(() => platform.lockPointer()).not.toThrow();
    expect(() => platform.unlockPointer()).not.toThrow();

    setLockElement(canvas);

    expect(() => platform.unlockPointer()).not.toThrow();
  });
});

describe('InputSystem pointer lock', () => {
  test('reads the lock state from the platform and dispatches its changes', () => {
    const seen: boolean[] = [];

    im.onPointerLockChange.add(locked => void seen.push(locked));

    expect(im.pointerLocked).toBe(false);

    setLockElement(canvas);

    expect(im.pointerLocked).toBe(true);
    expect(seen).toEqual([true]);

    setLockElement(null);

    expect(im.pointerLocked).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  test('routes lock requests to the platform', () => {
    const lock = vi.spyOn(platform, 'lockPointer');
    const unlock = vi.spyOn(platform, 'unlockPointer');

    im.lockPointer();
    im.unlockPointer();

    expect(lock).toHaveBeenCalledOnce();
    expect(unlock).toHaveBeenCalledOnce();
  });

  test('stops dispatching once the system is destroyed', () => {
    const seen: boolean[] = [];

    im.onPointerLockChange.add(locked => void seen.push(locked));
    im.destroy();

    setLockElement(canvas);

    expect(seen).toEqual([]);
  });
});

describe('Pointer relative movement', () => {
  test('sums the host movement of every event in a frame and clears it on the next', () => {
    fire(canvas, 'pointerover', { clientX: 100, clientY: 100 });
    fire(canvas, 'pointermove', { clientX: 110, clientY: 100, movementX: 10, movementY: 0 });
    fire(canvas, 'pointermove', { clientX: 110, clientY: 96, movementX: 0, movementY: -4 });

    im.preUpdate(0 as never);

    const pointer = getPointer();

    // Closeness rather than equality: the mapping into design pixels is a
    // fractional scale, so a summed motion carries the usual rounding.
    expect(pointer.movement.x).toBeCloseTo(10);
    expect(pointer.movement.y).toBeCloseTo(-4);

    im.preUpdate(0 as never);

    expect(pointer.movement.x).toBe(0);
    expect(pointer.movement.y).toBe(0);
  });

  test('keeps reporting motion for a locked pointer whose position stands still', () => {
    fire(canvas, 'pointerover', { clientX: 400, clientY: 300 });
    im.preUpdate(0 as never);

    setLockElement(canvas);

    // A locked pointer has no position on screen, so the host repeats the last
    // one and puts the whole gesture in the movement fields.
    fire(canvas, 'pointermove', { clientX: 400, clientY: 300, movementX: 25, movementY: -12 });
    im.preUpdate(0 as never);

    const pointer = getPointer();

    expect(pointer.delta.x).toBe(0);
    expect(pointer.delta.y).toBe(0);
    expect(pointer.movement.x).toBeCloseTo(25);
    expect(pointer.movement.y).toBeCloseTo(-12);
  });

  test('maps movement through the same transform as the position', () => {
    // A surface displayed at half its backing size: a 20px host movement covers
    // 40 design pixels.
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

    fire(canvas, 'pointerover', { clientX: 100, clientY: 100 });
    fire(canvas, 'pointermove', { clientX: 120, clientY: 100, movementX: 20, movementY: 0 });

    im.preUpdate(0 as never);

    expect(getPointer().movement.x).toBeCloseTo(40);
  });
});
