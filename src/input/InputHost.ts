import type { BrowserGamepad } from './GamepadDefinitions';

/**
 * The host-platform surface the input pipeline touches outside of event
 * listeners: focus, cursor and touch-action on the drawing surface, gamepad
 * polling, and pointer capture.
 *
 * These are the calls that were otherwise scattered as bare `document.`,
 * `navigator.` and `canvas.style.` references across the input and interaction
 * managers. Collecting them behind one DOM-free interface gives a future
 * platform adapter a single seam to implement, and lets a test substitute the
 * host instead of monkey-patching globals.
 *
 * Deliberately narrow: this is not a platform kernel. Event *delivery* still
 * belongs to the managers, because which platform events are intercepted — and
 * whether one is suppressed — is an input-policy decision, not a host one.
 */
export interface InputHost {
  /** Whether the drawing surface currently holds host focus. */
  readonly focused: boolean;
  /** Give the drawing surface host focus, so it starts receiving keyboard input. */
  focus(): void;
  /** Set the surface's touch-action policy — `'none'` keeps native pan/zoom out of the way. */
  setTouchAction(value: string): void;
  /** Set the cursor shown over the surface. Empty string restores the default. */
  setCursor(value: string): void;
  /** Sample every connected gamepad. Entries may be `null` for vacated slots. */
  pollGamepads(): ReadonlyArray<BrowserGamepad | null>;
  /** Route all further events for `pointerId` to the surface, best-effort. */
  capturePointer(pointerId: number): void;
  /** Undo {@link capturePointer}, best-effort. */
  releasePointer(pointerId: number): void;
}

/**
 * The {@link InputHost} backed by the browser: a canvas element, `navigator`
 * and the DOM pointer-capture API. Capture calls are best-effort — jsdom and
 * some browsers reject releasing a pointer that was never captured.
 */
export function createBrowserInputHost(canvas: HTMLCanvasElement): InputHost {
  return {
    get focused(): boolean {
      return document.activeElement === canvas;
    },

    focus(): void {
      canvas.focus();
    },

    setTouchAction(value: string): void {
      canvas.style.touchAction = value;
    },

    setCursor(value: string): void {
      canvas.style.cursor = value;
    },

    pollGamepads(): ReadonlyArray<BrowserGamepad | null> {
      return window.navigator.getGamepads();
    },

    capturePointer(pointerId: number): void {
      try {
        canvas.setPointerCapture(pointerId);
      } catch {
        // Not supported everywhere, and never essential — the manager tracks
        // the capture itself.
      }
    },

    releasePointer(pointerId: number): void {
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {
        // Releasing an uncaptured pointer throws in some browsers.
      }
    },
  };
}
