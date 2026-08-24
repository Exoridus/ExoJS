import type { RenderSurface } from '#platform/RenderSurface';

import { computeLetterboxLayout } from './letterbox';

/** How {@link Application} sizes its canvas within the parent element. */
export type CanvasSizingMode = 'fixed' | 'fill' | 'fit' | 'shrink' | 'letterbox';

/**
 * The parent-element inline style properties `'letterbox'` mode writes. Kept as
 * one list so the snapshot taken before styling and the restore performed on
 * teardown / mode change can never drift apart.
 */
const letterboxParentProperties = ['display', 'alignItems', 'justifyContent', 'overflow', 'background'] as const;

type LetterboxParentProperty = (typeof letterboxParentProperties)[number];

/**
 * A parent element together with the exact inline values it had for every
 * property the sizing mode was about to overwrite - `''` for a property with no
 * inline value at all, which is also what removes it again on restore.
 */
interface ParentStyleSnapshot {
  readonly element: HTMLElement;
  readonly styles: Readonly<Record<LetterboxParentProperty, string>>;
}

/**
 * Everything that decides how large a render surface is and, where it lives in
 * a document, how it is laid out there.
 *
 * Held apart from the application itself because the two halves have different
 * requirements: the backing-store size applies to any surface, while the CSS
 * box, the parent element and the `ResizeObserver` only exist when the surface
 * is a canvas in a document. With `element` null - a worker-hosted surface, an
 * `OffscreenCanvas` - only the first half runs, and every sizing mode other
 * than `'fixed'` is inert because there is no parent to track.
 *
 * The owner supplies `onResize`, called when a tracked parent changes size, and
 * drives teardown in its own order: the observer is released as soon as the
 * application starts going down, while the parent's styles are handed back
 * later, once the surface itself is released.
 */
export class CanvasSizing {
  private readonly _surface: RenderSurface;
  private readonly _element: HTMLCanvasElement | null;
  private readonly _pixelRatio: number;
  private readonly _onResize: (width: number, height: number) => void;

  private _designWidth: number;
  private _designHeight: number;
  private _observer: ResizeObserver | null = null;
  private _parentSnapshot: ParentStyleSnapshot | null = null;

  public constructor(
    surface: RenderSurface,
    element: HTMLCanvasElement | null,
    pixelRatio: number,
    designWidth: number,
    designHeight: number,
    onResize: (width: number, height: number) => void,
  ) {
    this._surface = surface;
    this._element = element;
    this._pixelRatio = pixelRatio;
    this._designWidth = designWidth;
    this._designHeight = designHeight;
    this._onResize = onResize;
  }

  /**
   * Size the surface for a design space of `width` x `height` logical pixels.
   * The backing store is `design x pixelRatio`; the CSS box, where there is
   * one, stays at the logical size.
   */
  public applySize(width: number, height: number): void {
    this._designWidth = width;
    this._designHeight = height;
    this._surface.width = Math.round(width * this._pixelRatio);
    this._surface.height = Math.round(height * this._pixelRatio);

    // An OffscreenCanvas has no CSS box: its backing store is the whole story,
    // so the display size the caller asked for is already expressed above.
    if (this._element !== null) {
      this._element.style.width = `${width}px`;
      this._element.style.height = `${height}px`;
    }
  }

  /**
   * Apply a sizing mode. `'fill'` observes the parent and re-renders to its
   * size; `'fit'`/`'shrink'` set CSS so the fixed-resolution canvas scales to
   * fit the parent (letterboxed via CSS object-fit); `'letterbox'` observes the
   * parent and sizes a native-resolution, design-aspect canvas centered within
   * it, the parent background showing as bars. `'fixed'` is a no-op - the exact
   * pixel size was already applied.
   *
   * `previous` is the mode being replaced, if any. Whatever CSS that mode owned
   * is undone first, so switching modes never leaves the losing mode's rules
   * layered under the winning one's - `'fit'`'s `100%` box outliving a switch
   * to `'fixed'`, say, or `'letterbox'`'s flex centering outliving a switch to
   * `'fill'`.
   */
  public applyMode(mode: CanvasSizingMode, previous: CanvasSizingMode | null = null): void {
    if (this._element === null) {
      return;
    }

    const style = this._element.style;

    if (previous !== null) {
      this._clearModeStyles(previous);
    }

    switch (mode) {
      case 'fill': {
        this._observeParent((width, height) => {
          this._onResize(width, height);
        });
        break;
      }
      case 'letterbox': {
        this._observeParent(
          (width, height) => {
            this._applyLetterboxLayout(width, height);
          },
          target => {
            // Center the canvas in the parent and let the parent background
            // show as letterbox bars around it. Snapshot first: this is the
            // caller's element, and teardown has to hand it back the way it
            // was found.
            this._snapshotParentStyles(target);

            const parentStyle = target.style;

            parentStyle.display = 'flex';
            parentStyle.alignItems = 'center';
            parentStyle.justifyContent = 'center';
            parentStyle.overflow = 'hidden';
            parentStyle.background = '#000';
          },
        );
        break;
      }
      case 'fit':
        style.width = '100%';
        style.height = '100%';
        style.objectFit = 'contain';
        break;
      case 'shrink':
        style.maxWidth = '100%';
        style.maxHeight = '100%';
        style.objectFit = 'contain';
        break;
      case 'fixed':
      default:
        break;
    }
  }

  /** Stop tracking the parent element, leaving its styles as they are. */
  public releaseObserver(): void {
    this._observer?.disconnect();
    this._observer = null;
  }

  /**
   * Put the parent element's inline styles back exactly as they were before
   * `'letterbox'` mode touched them, and forget the snapshot. A no-op when no
   * parent was ever restyled, so it is safe to call from every teardown path.
   */
  public restoreParentStyles(): void {
    const snapshot = this._parentSnapshot;

    if (snapshot === null) {
      return;
    }

    this._parentSnapshot = null;

    for (const property of letterboxParentProperties) {
      snapshot.element.style[property] = snapshot.styles[property];
    }
  }

  /**
   * Track the canvas's parent element, running `onChange` for every non-empty
   * size it reports. `onAttach` runs once, before observation starts, for a
   * mode that has to restyle the parent as well.
   */
  private _observeParent(onChange: (width: number, height: number) => void, onAttach?: (target: HTMLElement) => void): void {
    const target = this._element?.parentElement;

    if (typeof ResizeObserver === 'undefined' || !target) {
      return;
    }

    onAttach?.(target);

    this._observer = new ResizeObserver(() => {
      // Measured once and passed on: reading the layout box again inside the
      // handler is a second forced reflow, and a value that could already have
      // moved on from the one the guard accepted.
      const width = target.clientWidth;
      const height = target.clientHeight;

      if (width > 0 && height > 0) {
        onChange(width, height);
      }
    });
    this._observer.observe(target);
  }

  /**
   * Undo the canvas/parent CSS a sizing mode owns, returning the canvas to the
   * plain design-size box every mode starts from. Only properties the mode
   * itself wrote are touched - nothing here is a blanket style reset.
   */
  private _clearModeStyles(mode: CanvasSizingMode): void {
    const style = this._element?.style;

    if (style === undefined) {
      return;
    }

    switch (mode) {
      case 'fit':
        style.width = '';
        style.height = '';
        style.objectFit = '';
        break;
      case 'shrink':
        style.maxWidth = '';
        style.maxHeight = '';
        style.objectFit = '';
        break;
      case 'letterbox':
        this.restoreParentStyles();
        break;
      case 'fill':
      case 'fixed':
      default:
        break;
    }

    // `'fit'` and `'letterbox'` replaced the explicit pixel box (the former by
    // clearing it just above, the latter by writing a fitted one along with a
    // parent-sized backing store), and `'fill'` last sized it to the parent.
    // Restate the design size so the next mode starts from a known box.
    this.applySize(this._designWidth, this._designHeight);
  }

  /**
   * Record the parent's inline values for every property `'letterbox'` is about
   * to overwrite. The {@link ParentStyleSnapshot} record type is exhaustive over
   * {@link letterboxParentProperties}, so a property added to the mode without
   * being captured here fails to compile rather than silently escaping restore.
   */
  private _snapshotParentStyles(target: HTMLElement): void {
    const style = target.style;

    this._parentSnapshot = {
      element: target,
      styles: {
        display: style.display,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        overflow: style.overflow,
        background: style.background,
      },
    };
  }

  /**
   * Recompute the `'letterbox'` layout for a parent of the given CSS size.
   * Fits the fixed design space into the parent preserving aspect ratio, sizes
   * the canvas to that content rectangle (backing store at
   * `content x pixelRatio` - always native-crisp, never upscale-blurred), and
   * lets the parent's background show through as letterbox bars around the
   * centered canvas. The render target and camera stay at the design size, so
   * the design space exactly fills the backing store (no crop, no stretch) and
   * the camera's gameplay center / zoom survive a window resize untouched.
   */
  private _applyLetterboxLayout(parentWidthCss: number, parentHeightCss: number): void {
    const layout = computeLetterboxLayout(parentWidthCss, parentHeightCss, this._designWidth, this._designHeight, this._pixelRatio);

    this._surface.width = layout.backingWidth;
    this._surface.height = layout.backingHeight;

    if (this._element !== null) {
      this._element.style.width = `${layout.contentWidthCss}px`;
      this._element.style.height = `${layout.contentHeightCss}px`;
    }
  }
}
