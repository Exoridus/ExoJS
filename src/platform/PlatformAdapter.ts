import type { BrowserGamepad } from '#input/GamepadDefinitions';

/**
 * Undo function returned by every `PlatformAdapter` subscription. Calling it
 * twice is a no-op.
 */
export type PlatformSubscription = () => void;

/**
 * A monotonic millisecond clock. Values are only meaningful relative to each
 * other: the origin is the host's, never the wall clock, and the source never
 * jumps backwards when the system clock is adjusted.
 *
 * This is the seam every runtime clock reads instead of a global
 * `performance.now()`, which is what makes a deterministic time source
 * possible in tests. {@link PlatformAdapter} is one, so an adapter can be
 * handed straight to {@link Clock}.
 */
export interface TimeSource {
  /** Milliseconds elapsed since this source's own origin. */
  now(): number;
}

/**
 * Display-synchronised frame scheduling. The timestamp handed to the callback
 * shares its origin with {@link TimeSource.now}, so the two can be compared
 * and subtracted without conversion.
 */
export interface FrameScheduler {
  /**
   * Schedule `callback` for the next display frame and return a handle for
   * {@link FrameScheduler.cancelFrame}. One-shot - a frame loop reschedules
   * itself every frame.
   *
   * `timestamp` is the host's frame time. It is the time the frame was
   * *scheduled for*, not the time the callback happened to run, so deltas
   * derived from it are free of the jitter that reading a clock at the top of
   * the callback introduces.
   */
  requestFrame(callback: (timestamp: number) => void): number;

  /** Cancel a frame scheduled by {@link FrameScheduler.requestFrame}. */
  cancelFrame(handle: number): void;
}

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
 * The part of a host event the input pipeline can act on: suppressing the
 * host's own default handling of it.
 *
 * Both calls are the DOM's, and a real `Event` satisfies this interface as it
 * is - the browser's events cross the seam untouched, with no wrapper and no
 * copy. What the interface adds is that an adapter with no DOM behind it can
 * satisfy the same contract with a plain object, which a DOM event class could
 * never be reconstructed as on the far side of a `postMessage`.
 */
export interface PlatformEvent {
  preventDefault(): void;
  stopImmediatePropagation(): void;
}

/**
 * A pointer contact. Field-for-field a subset of the DOM's `PointerEvent`,
 * carrying the identity, position, geometry, tilt, pressure and button state
 * the engine's pointer model reads, and nothing else.
 */
export interface PlatformPointerEvent extends PlatformEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly clientX: number;
  readonly clientY: number;
  readonly width: number;
  readonly height: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  readonly pressure: number;
  readonly buttons: number;
  readonly isPrimary: boolean;
}

/**
 * A key transition, identified by physical position (`code`) rather than by
 * the character the active layout produces. `repeat` marks an OS auto-repeat
 * rather than a fresh press.
 */
export interface PlatformKeyboardEvent extends PlatformEvent {
  readonly code: string;
  readonly repeat: boolean;
}

/** A scroll gesture. `deltaMode` selects the unit the deltas are expressed in. */
export interface PlatformWheelEvent extends PlatformEvent {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaMode: number;
}

/** A positioned host event with no pointer identity of its own, such as a context-menu request. */
export interface PlatformPositionalEvent extends PlatformEvent {
  readonly clientX: number;
  readonly clientY: number;
}

/**
 * Events the input pipeline sources from the drawing surface itself.
 *
 * The payload types are the browser's event shapes, narrowed to the fields the
 * engine reads. Keeping the vocabulary this close to the DOM is deliberate:
 * {@link BrowserPlatform} forwards the browser's own event objects verbatim,
 * so the main-thread path pays nothing for the abstraction, while a host
 * without a DOM can deliver the same information as an ordinary object.
 */
export interface PlatformSurfaceEventMap {
  focus: PlatformEvent;
  blur: PlatformEvent;
  wheel: PlatformWheelEvent;
  pointerover: PlatformPointerEvent;
  pointerleave: PlatformPointerEvent;
  pointerdown: PlatformPointerEvent;
  pointermove: PlatformPointerEvent;
  pointerup: PlatformPointerEvent;
  pointercancel: PlatformPointerEvent;
  contextmenu: PlatformPositionalEvent;
  selectstart: PlatformEvent;
}

/** Events the input pipeline sources from the host window rather than the surface. */
export interface PlatformWindowEventMap {
  keydown: PlatformKeyboardEvent;
  keyup: PlatformKeyboardEvent;
  blur: PlatformEvent;
}

/**
 * Everything the engine touches outside its own state: the drawing surface's
 * focus, cursor, touch-action and geometry, pointer capture, gamepad polling,
 * document visibility, frame scheduling, and the delivery of input events.
 *
 * One adapter serves the whole {@link Application} - `app.platform` - and both
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
export interface PlatformAdapter extends TimeSource, FrameScheduler {
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

  /** Set the surface's touch-action policy - `'none'` keeps native pan/zoom out of the way. */
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
   * Subscribe to a surface event. Which events are listened for - and whether
   * one is suppressed - stays an input-policy decision made above this seam,
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
