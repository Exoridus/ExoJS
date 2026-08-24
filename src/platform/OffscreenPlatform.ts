import type { BrowserGamepad } from '#input/GamepadDefinitions';

import type {
  PlatformAdapter,
  PlatformSubscription,
  PlatformSurfaceEventMap,
  PlatformSurfaceMetrics,
  PlatformWindowEventMap,
} from './PlatformAdapter';
import type { RenderSurface } from './RenderSurface';

const noGamepads: ReadonlyArray<BrowserGamepad | null> = [];

/** Frame period used when the realm schedules no display frames of its own. */
const fallbackFramePeriodMs = 1000 / 60;

type Listener = (event: never) => void;

/**
 * Where the surface is displayed, in the coordinate space the forwarded
 * pointer events use.
 */
export interface OffscreenSurfaceRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The {@link PlatformAdapter} for a render surface with no document around it:
 * an `OffscreenCanvas`, whether it stayed on the main thread or was
 * transferred into a worker.
 *
 * What it provides on its own is everything that needs no DOM - the host's
 * monotonic clock, frame scheduling, and the surface's backing-store size.
 * Everything else is fed in by whoever owns the document: pointer and key
 * events through {@link OffscreenPlatform.emitSurfaceEvent} and
 * {@link OffscreenPlatform.emitWindowEvent}, the surface's on-screen rect
 * through {@link OffscreenPlatform.setSurfaceRect}, and visibility, focus and
 * gamepads through their setters. Nothing is invented: with no host feeding
 * it, the adapter reports a visible, unfocused surface receiving no input.
 *
 * The affordances that act on a document - focus, cursor, touch-action,
 * pointer capture - do nothing here, and deliberately do not throw. They are
 * mechanisms whose absence degrades the experience rather than breaking the
 * application, exactly as they already do on a browser host that refuses
 * pointer capture, and an application should not have to know which kind of
 * surface it draws into before it can ask for a cursor.
 *
 * Frame scheduling uses the realm's own `requestAnimationFrame` where there is
 * one. A dedicated worker generally has none, so the adapter falls back to a
 * timer at approximately 60 Hz. That fallback is not display-synchronised; a
 * worker-hosted renderer that must not tear should be driven by frames the
 * document's host forwards instead.
 */
export class OffscreenPlatform implements PlatformAdapter {
  private readonly _surface: RenderSurface;
  private readonly _surfaceListeners = new Map<string, Set<Listener>>();
  private readonly _windowListeners = new Map<string, Set<Listener>>();
  private readonly _visibilityListeners = new Set<(visible: boolean) => void>();
  private readonly _timerHandles = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly _requestFrame: ((callback: (timestamp: number) => void) => number) | null;
  private readonly _cancelFrame: ((handle: number) => void) | null;

  private _rect: OffscreenSurfaceRect;
  private _gamepads: ReadonlyArray<BrowserGamepad | null> = noGamepads;
  private _visible = true;
  private _focused = false;
  private _nextTimerHandle = 1;

  public constructor(surface: RenderSurface) {
    const scope = globalThis as typeof globalThis &
      Partial<{ requestAnimationFrame: typeof requestAnimationFrame; cancelAnimationFrame: typeof cancelAnimationFrame }>;

    this._surface = surface;
    this._rect = { left: 0, top: 0, width: surface.width, height: surface.height };
    this._requestFrame = typeof scope.requestAnimationFrame === 'function' ? scope.requestAnimationFrame.bind(scope) : null;
    this._cancelFrame = typeof scope.cancelAnimationFrame === 'function' ? scope.cancelAnimationFrame.bind(scope) : null;
  }

  /** The surface this adapter reports on. */
  public get surface(): RenderSurface {
    return this._surface;
  }

  public get surfaceFocused(): boolean {
    return this._focused;
  }

  public get documentVisible(): boolean {
    return this._visible;
  }

  /**
   * Record whether the host considers the surface focused. Keyboard input is
   * gated on this, so a host forwarding key events must forward focus too.
   */
  public setSurfaceFocused(focused: boolean): void {
    this._focused = focused;
  }

  /**
   * Record whether the host's document is visible. Drives
   * {@link PlatformAdapter.documentVisible}, its subscribers, and so
   * `pauseOnHidden`.
   */
  public setVisible(visible: boolean): void {
    if (visible === this._visible) {
      return;
    }

    this._visible = visible;

    for (const listener of [...this._visibilityListeners]) {
      listener(visible);
    }
  }

  /**
   * Record where the surface is displayed, in the same coordinate space as the
   * `clientX`/`clientY` of the pointer events being forwarded. Pointer
   * positions are mapped through this rect, so a host forwarding pointer
   * events has to keep it current across layout and scroll changes.
   */
  public setSurfaceRect(rect: OffscreenSurfaceRect): void {
    this._rect = rect;
  }

  /**
   * Record the host's most recent gamepad sample. The array is read as-is on
   * every poll and never copied, so hand over a snapshot rather than a buffer
   * that keeps changing.
   */
  public setGamepads(gamepads: ReadonlyArray<BrowserGamepad | null>): void {
    this._gamepads = gamepads;
  }

  /** Deliver a surface event to whatever the input pipeline subscribed. */
  public emitSurfaceEvent<K extends keyof PlatformSurfaceEventMap>(type: K, event: PlatformSurfaceEventMap[K]): void {
    this._emit(this._surfaceListeners, type, event);
  }

  /** Deliver a window-level event to whatever the input pipeline subscribed. */
  public emitWindowEvent<K extends keyof PlatformWindowEventMap>(type: K, event: PlatformWindowEventMap[K]): void {
    this._emit(this._windowListeners, type, event);
  }

  /** No document to move focus in. */
  public focusSurface(): void {}

  /** No document to style. */
  public setCursor(): void {}

  /** No document to set a touch-action policy on. */
  public setTouchAction(): void {}

  /** No document to route pointer events in - a forwarded event already carries its identity. */
  public capturePointer(): void {}

  /** Counterpart to {@link OffscreenPlatform.capturePointer}, equally inert. */
  public releasePointer(): void {}

  public getSurfaceMetrics(): PlatformSurfaceMetrics {
    return {
      left: this._rect.left,
      top: this._rect.top,
      width: this._rect.width,
      height: this._rect.height,
      backingWidth: this._surface.width,
      backingHeight: this._surface.height,
    };
  }

  public pollGamepads(): ReadonlyArray<BrowserGamepad | null> {
    return this._gamepads;
  }

  public onVisibilityChange(listener: (visible: boolean) => void): PlatformSubscription {
    this._visibilityListeners.add(listener);

    return once(() => this._visibilityListeners.delete(listener));
  }

  public now(): number {
    return performance.now();
  }

  public requestFrame(callback: (timestamp: number) => void): number {
    if (this._requestFrame !== null) {
      return this._requestFrame(callback);
    }

    // A timer handle is an object in some hosts and a number in others, so the
    // adapter hands out its own numeric handle and keeps the mapping.
    const handle = this._nextTimerHandle++;
    const timer = setTimeout(() => {
      this._timerHandles.delete(handle);
      callback(this.now());
    }, fallbackFramePeriodMs);

    this._timerHandles.set(handle, timer);

    return handle;
  }

  public cancelFrame(handle: number): void {
    const timer = this._timerHandles.get(handle);

    if (timer !== undefined) {
      this._timerHandles.delete(handle);
      clearTimeout(timer);

      return;
    }

    this._cancelFrame?.(handle);
  }

  public onSurfaceEvent<K extends keyof PlatformSurfaceEventMap>(
    type: K,
    listener: (event: PlatformSurfaceEventMap[K]) => void,
  ): PlatformSubscription {
    return subscribe(this._surfaceListeners, type, listener as Listener);
  }

  public onWindowEvent<K extends keyof PlatformWindowEventMap>(
    type: K,
    listener: (event: PlatformWindowEventMap[K]) => void,
  ): PlatformSubscription {
    return subscribe(this._windowListeners, type, listener as Listener);
  }

  public destroy(): void {
    for (const timer of this._timerHandles.values()) {
      clearTimeout(timer);
    }

    this._timerHandles.clear();
    this._surfaceListeners.clear();
    this._windowListeners.clear();
    this._visibilityListeners.clear();
    this._gamepads = noGamepads;
  }

  private _emit(registry: Map<string, Set<Listener>>, type: string, event: unknown): void {
    const listeners = registry.get(type);

    if (listeners === undefined) {
      return;
    }

    // Copied because a listener may unsubscribe itself, or another, while the
    // event is being delivered.
    for (const listener of [...listeners]) {
      (listener as (event: unknown) => void)(event);
    }
  }
}

function subscribe(registry: Map<string, Set<Listener>>, type: string, listener: Listener): PlatformSubscription {
  let listeners = registry.get(type);

  if (listeners === undefined) {
    listeners = new Set<Listener>();
    registry.set(type, listeners);
  }

  const target = listeners;

  target.add(listener);

  return once(() => {
    target.delete(listener);

    if (target.size === 0) {
      registry.delete(type);
    }
  });
}

function once(undo: () => void): PlatformSubscription {
  let done = false;

  return (): void => {
    if (done) {
      return;
    }

    done = true;
    undo();
  };
}
