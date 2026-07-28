import type { BrowserGamepad } from '#input/GamepadDefinitions';

/**
 * Undo function returned by every `PlatformAdapter` subscription. Calling it
 * twice is a no-op.
 */
export type PlatformSubscription = () => void;

/** Listener flags the input pipeline needs when it subscribes to a platform event. */
export interface PlatformListenerOptions {
  /** Receive the event during the capture phase rather than while bubbling. */
  readonly capture?: boolean;
  /** Promise never to suppress the event, letting the platform skip the round-trip. */
  readonly passive?: boolean;
}

/**
 * Geometry of the drawing surface, in one snapshot. `left`/`top`/`width`/
 * `height` describe where the surface is displayed and how large it appears;
 * `backingWidth`/`backingHeight` are the resolution it is actually rendered at.
 *
 * The two differ whenever the surface is scaled for display (a CSS-scaled
 * canvas, a device-pixel-ratio above 1, a letterboxed layout), which is exactly
 * what pointer coordinates have to be mapped through.
 */
export interface PlatformSurfaceMetrics {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
}

/**
 * Events the input pipeline sources from the drawing surface itself.
 *
 * The payload types are the browser's, because the engine's pointer model is
 * `PointerEvent`-shaped end to end. That is a deliberate limit of this seam,
 * not an oversight: replacing the event vocabulary would be a rewrite of the
 * input pipeline rather than a platform port, and nothing in the engine needs
 * it yet.
 */
export interface PlatformSurfaceEventMap {
  focus: FocusEvent;
  blur: FocusEvent;
  wheel: WheelEvent;
  pointerover: PointerEvent;
  pointerleave: PointerEvent;
  pointerdown: PointerEvent;
  pointermove: PointerEvent;
  pointerup: PointerEvent;
  pointercancel: PointerEvent;
  contextmenu: MouseEvent;
  selectstart: Event;
}

/** Events the input pipeline sources from the host window rather than the surface. */
export interface PlatformWindowEventMap {
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  blur: FocusEvent;
}

/**
 * Everything the engine touches outside its own state: the drawing surface's
 * focus, cursor, touch-action and geometry, pointer capture, gamepad polling,
 * document visibility, frame scheduling, and the delivery of input events.
 *
 * One adapter serves the whole {@link Application} — `app.platform` — and both
 * the {@link InputManager} and the {@link InteractionManager} read it from
 * there, so there is exactly one seam between the engine and its host.
 * {@link BrowserPlatform} is the default; pass your own through
 * {@link ApplicationOptions.platform} to run the engine somewhere else, or to
 * drive it from a test without monkey-patching globals.
 *
 * Deliberately not a platform kernel: there is nothing here for fetch,
 * storage, audio, workers or display configuration. This adapter covers the
 * mechanics the input and frame pipeline actually needs today, and grows only
 * when a subsystem genuinely needs a seam.
 *
 * The adapter supplies mechanism, never policy. It reports that a pointer
 * moved and captures it on request; whether that movement is a drag, a tap or
 * an action is decided entirely by the input system above it.
 */
export interface PlatformAdapter {
  /** Whether the drawing surface currently holds host focus. */
  readonly surfaceFocused: boolean;

  /** Give the drawing surface host focus, so it starts receiving keyboard input. */
  focusSurface(): void;

  /**
   * Current position, display size and backing-store resolution of the drawing
   * surface. Read per pointer event, so implementations should keep it cheap.
   */
  getSurfaceMetrics(): PlatformSurfaceMetrics;

  /** Set the cursor shown over the surface. Empty string restores the default. */
  setCursor(value: string): void;

  /** Set the surface's touch-action policy — `'none'` keeps native pan/zoom out of the way. */
  setTouchAction(value: string): void;

  /** Route all further events for `pointerId` to the surface. Best-effort. */
  capturePointer(pointerId: number): void;

  /** Undo {@link PlatformAdapter.capturePointer}. Best-effort. */
  releasePointer(pointerId: number): void;

  /** Sample every connected gamepad. Entries may be `null` for vacated slots. */
  pollGamepads(): ReadonlyArray<BrowserGamepad | null>;

  /** Whether the document showing the surface is currently visible to the user. */
  readonly documentVisible: boolean;

  /** Subscribe to {@link PlatformAdapter.documentVisible} changes. */
  onVisibilityChange(listener: (visible: boolean) => void): PlatformSubscription;

  /**
   * Schedule `callback` for the next display frame and return a handle for
   * {@link PlatformAdapter.cancelFrame}. One-shot — the frame loop reschedules
   * itself every frame.
   */
  requestFrame(callback: () => void): number;

  /** Cancel a frame scheduled by {@link PlatformAdapter.requestFrame}. */
  cancelFrame(handle: number): void;

  /**
   * Subscribe to a surface event. Which events are listened for — and whether
   * one is suppressed — stays an input-policy decision made above this seam,
   * so the adapter only wires up the delivery.
   */
  onSurfaceEvent<K extends keyof PlatformSurfaceEventMap>(
    type: K,
    listener: (event: PlatformSurfaceEventMap[K]) => void,
    options?: PlatformListenerOptions,
  ): PlatformSubscription;

  /** Subscribe to a window-level event. See {@link PlatformAdapter.onSurfaceEvent}. */
  onWindowEvent<K extends keyof PlatformWindowEventMap>(
    type: K,
    listener: (event: PlatformWindowEventMap[K]) => void,
    options?: PlatformListenerOptions,
  ): PlatformSubscription;

  /**
   * Release everything the adapter itself holds. Called by
   * {@link Application.destroy} only for an adapter the application created;
   * an injected adapter stays the caller's to dispose.
   */
  destroy(): void;
}
