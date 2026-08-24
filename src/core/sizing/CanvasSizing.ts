import type { RenderSurface } from '#platform/RenderSurface';

/**
 * The size of the element a sizing policy tracks, in CSS pixels.
 */
export interface CanvasSizingHostMetrics {
  readonly width: number;
  readonly height: number;
}

/**
 * One complete description of how the canvas is sized, in the three axes the
 * engine keeps apart.
 *
 * `cssWidth`/`cssHeight` are the element's display box in CSS pixels, or `null`
 * to leave the box exactly as it is - the form a policy uses when the
 * surrounding page owns the canvas geometry. They are ignored for a surface
 * with no document element.
 *
 * `logicalWidth`/`logicalHeight` are the coordinate system the application
 * draws in: node positions, {@link Application.width}/{@link Application.height}
 * and pointer coordinates are all expressed in it.
 *
 * `renderWidth`/`renderHeight` are the requested render resolution, also in CSS
 * pixels. The backing store becomes `render x pixelRatio`, so a policy states
 * how many pixels it wants without ever applying the device pixel ratio itself.
 */
export interface CanvasSizingMetrics {
  readonly cssWidth: number | null;
  readonly cssHeight: number | null;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
}

/**
 * What a {@link CanvasSizing} is given to work with, and the one channel
 * through which it changes the canvas.
 *
 * A context describes the application as it stood when the policy was attached.
 * The application hands out a fresh one on every attach, so a change it cannot
 * express - a new base resolution, a canvas moved to another parent - reaches a
 * policy by re-attaching it rather than by mutating what it already holds.
 */
export interface CanvasSizingContext {
  /** Base (design) resolution the application was configured with. */
  readonly baseWidth: number;
  /** Base (design) resolution the application was configured with. */
  readonly baseHeight: number;
  /** Device pixels per CSS pixel the backing store is scaled by. */
  readonly pixelRatio: number;
  /** Surface being sized. */
  readonly surface: RenderSurface;
  /** The surface as a document canvas, or `null` for an `OffscreenCanvas`. */
  readonly element: HTMLCanvasElement | null;
  /** The canvas's parent element, or `null` when there is no document around it. */
  readonly host: HTMLElement | null;
  /**
   * Current size of {@link CanvasSizingContext.host}, or `null` when there is
   * no host to measure. Reads layout, so call it once per change and pass the
   * result on rather than measuring again downstream.
   */
  measureHost(): CanvasSizingHostMetrics | null;
  /**
   * Commit a new geometry. Resizes the backing store, writes the CSS box where
   * one is requested, moves the application's logical coordinate system and
   * dispatches {@link Application.onResize}.
   *
   * A commit whose logical or render size is not positive is ignored, so a
   * policy may forward a zero-sized host measurement unconditionally.
   */
  apply(metrics: CanvasSizingMetrics): void;
}

/**
 * Strategy that decides how a canvas is sized and, where it lives in a
 * document, how it follows its surroundings.
 *
 * An instance owns its own lifecycle: it is handed a
 * {@link CanvasSizingContext} in {@link CanvasSizing.attach} and keeps whatever
 * it needs - a `ResizeObserver`, window listeners, a host message channel -
 * until {@link CanvasSizing.detach} releases them again. Nothing is created on
 * its behalf, so a policy that observes nothing costs nothing.
 *
 * Passing no policy at all is the fixed case: the canvas is sized once to the
 * base resolution and never tracks anything, which is why there is no built-in
 * class for it.
 *
 * An instance belongs to one application at a time. `attach` is called when the
 * application takes it, `detach` when it is replaced or the application is
 * destroyed, and a policy must not commit through a context after its `detach`.
 */
export abstract class CanvasSizing {
  /**
   * Take ownership of `context`. Called once the surface exists and, for a
   * canvas mounted through `canvas.mount`, once it is in the document.
   */
  public abstract attach(context: CanvasSizingContext): void;

  /**
   * Release everything {@link CanvasSizing.attach} created - observers,
   * listeners, message channels - and undo any styling the policy applied
   * itself. The CSS box committed through {@link CanvasSizingContext.apply} is
   * not one of those: the application clears that on detach. The default
   * implementation does nothing, which is correct for a policy that observes
   * nothing.
   */
  public detach(): void {}
}
