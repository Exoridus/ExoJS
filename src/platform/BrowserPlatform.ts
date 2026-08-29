import type { BrowserGamepad } from '#input/GamepadDefinitions';

import { BrowserTextInput } from './BrowserTextInput';
import { editContextSupported, EditContextTextInput } from './EditContextTextInput';
import { browserNetworkHints, type OwnedNetworkHintSource, readBrowserNetworkHint } from './networkHints';
import type {
  NetworkHint,
  PlatformAdapter,
  PlatformListenerOptions,
  PlatformSubscription,
  PlatformSurfaceEventMap,
  PlatformSurfaceMetrics,
  PlatformWindowEventMap,
} from './PlatformAdapter';
import type { PlatformTextInput } from './PlatformTextInput';

const noGamepads: ReadonlyArray<BrowserGamepad | null> = [];

/**
 * The {@link PlatformAdapter} backed by the browser: a canvas element for the
 * drawing surface, `window` for keyboard and blur, `document` for visibility,
 * `navigator` for gamepads, and `navigator.onLine` plus the `online`/`offline`
 * window events for the network hint. Used automatically by
 * {@link Application} when no adapter was injected.
 *
 * Every capability degrades rather than throws when the host does not provide
 * it - pointer capture is rejected by jsdom and by browsers asked to release a
 * pointer they never captured, `navigator.getGamepads` is missing on locked-down
 * hosts, and `document` is absent under SSR. None of those are worth failing an
 * application over, so each is caught and reported as "unavailable".
 */
export class BrowserPlatform implements PlatformAdapter {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _subscriptions = new Set<PlatformSubscription>();
  private readonly _visibilityListeners = new Set<(visible: boolean) => void>();
  private readonly _visibilityHandler = (): void => {
    const visible = this.documentVisible;

    if (visible === this._lastVisible) {
      return;
    }

    this._lastVisible = visible;

    for (const listener of [...this._visibilityListeners]) {
      listener(visible);
    }
  };

  private _lastVisible: boolean;
  private _visibilityBound = false;
  /**
   * Bound on first subscription rather than in the constructor: an application
   * that never asks about connectivity should install no window listeners for
   * it.
   */
  private _networkHints: OwnedNetworkHintSource | null = null;

  public constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;
    this._lastVisible = this.documentVisible;
  }

  /** The canvas this adapter drives. */
  public get surface(): HTMLCanvasElement {
    return this._canvas;
  }

  public get surfaceFocused(): boolean {
    return typeof document !== 'undefined' && document.activeElement === this._canvas;
  }

  public get documentVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  public focusSurface(): void {
    this._canvas.focus();
  }

  public getSurfaceMetrics(): PlatformSurfaceMetrics {
    const rect = this._canvas.getBoundingClientRect();

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      backingWidth: this._canvas.width,
      backingHeight: this._canvas.height,
    };
  }

  public setCursor(value: string): void {
    this._canvas.style.cursor = value;
  }

  public setTouchAction(value: string): void {
    this._canvas.style.touchAction = value;
  }

  public capturePointer(pointerId: number): void {
    try {
      this._canvas.setPointerCapture(pointerId);
    } catch {
      // Not supported everywhere, and never essential - the interaction
      // system tracks the capture itself.
    }
  }

  public releasePointer(pointerId: number): void {
    try {
      this._canvas.releasePointerCapture(pointerId);
    } catch {
      // Releasing an uncaptured pointer throws in some browsers.
    }
  }

  public pollGamepads(): ReadonlyArray<BrowserGamepad | null> {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return noGamepads;
    }

    return navigator.getGamepads();
  }

  /**
   * Builds a text-input transport: `EditContext` where the host has it, a
   * hidden `<textarea>` everywhere else. Created per call, so a text widget
   * owns its transport's lifetime; callers that never ask for one never
   * create the element.
   */
  public createTextInput(): PlatformTextInput | null {
    if (typeof document === 'undefined') {
      return null;
    }

    return editContextSupported() ? new EditContextTextInput(this._canvas) : new BrowserTextInput(this._canvas);
  }

  public onVisibilityChange(listener: (visible: boolean) => void): PlatformSubscription {
    this._visibilityListeners.add(listener);
    this._bindVisibility();

    return this._track(() => {
      this._visibilityListeners.delete(listener);

      if (this._visibilityListeners.size === 0) {
        this._unbindVisibility();
      }
    });
  }

  public get networkHint(): NetworkHint {
    return this._networkHints?.networkHint ?? readBrowserNetworkHint();
  }

  public onNetworkHintChange(listener: (hint: NetworkHint) => void): PlatformSubscription {
    this._networkHints ??= browserNetworkHints();

    const unsubscribe = this._networkHints.onNetworkHintChange(listener);

    return this._track(unsubscribe);
  }

  public now(): number {
    return performance.now();
  }

  public requestFrame(callback: (timestamp: number) => void): number {
    return requestAnimationFrame(callback);
  }

  public cancelFrame(handle: number): void {
    cancelAnimationFrame(handle);
  }

  public onSurfaceEvent<K extends keyof PlatformSurfaceEventMap>(
    type: K,
    listener: (event: PlatformSurfaceEventMap[K]) => void,
    options?: PlatformListenerOptions,
  ): PlatformSubscription {
    return this._listen(this._canvas, type, listener, options);
  }

  public onWindowEvent<K extends keyof PlatformWindowEventMap>(
    type: K,
    listener: (event: PlatformWindowEventMap[K]) => void,
    options?: PlatformListenerOptions,
  ): PlatformSubscription {
    return this._listen(globalThis, type, listener, options);
  }

  public destroy(): void {
    for (const unsubscribe of [...this._subscriptions]) {
      unsubscribe();
    }

    this._subscriptions.clear();
    this._visibilityListeners.clear();
    this._unbindVisibility();
    this._networkHints?.destroy();
    this._networkHints = null;
  }

  /**
   * Attach a DOM listener and hand back an idempotent detacher. The listener
   * options are forwarded verbatim, because `removeEventListener` only matches
   * a registration whose capture flag agrees.
   */
  private _listen(target: EventTarget, type: string, listener: (event: never) => void, options?: PlatformListenerOptions): PlatformSubscription {
    const handler = listener as EventListener;
    const capture = options?.capture ?? false;

    target.addEventListener(type, handler, {
      capture,
      ...(options?.passive !== undefined && { passive: options.passive }),
    });

    return this._track(() => {
      target.removeEventListener(type, handler, { capture });
    });
  }

  /** Wrap `undo` so it runs at most once and stops being held by {@link destroy}. */
  private _track(undo: () => void): PlatformSubscription {
    let done = false;
    const subscription = (): void => {
      if (done) {
        return;
      }

      done = true;
      this._subscriptions.delete(subscription);
      undo();
    };

    this._subscriptions.add(subscription);

    return subscription;
  }

  private _bindVisibility(): void {
    if (this._visibilityBound || typeof document === 'undefined') {
      return;
    }

    this._visibilityBound = true;
    this._lastVisible = this.documentVisible;
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  private _unbindVisibility(): void {
    if (!this._visibilityBound) {
      return;
    }

    this._visibilityBound = false;
    document.removeEventListener('visibilitychange', this._visibilityHandler);
  }
}
