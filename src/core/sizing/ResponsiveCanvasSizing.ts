import { assert } from '#core/dev';

import { CanvasSizing, type CanvasSizingContext } from './CanvasSizing';
import { HostTracker, resolveHost } from './HostTracker';

export interface ResponsiveCanvasSizingOptions {
  /**
   * How far the logical view may be narrowed relative to the base view before
   * the extra world is opened up vertically instead, as a width/height ratio.
   *
   * Defaults to the base aspect ratio, which crops nothing: every host narrower
   * than the base ratio shows the full base width and gains vertical world. A
   * smaller value lets the view narrow to that ratio first - `1` allows a square
   * view before vertical growth starts - and so trades horizontal base view for
   * a less extreme layout on tall screens.
   *
   * Must be greater than zero and no larger than the base aspect ratio. Wider
   * hosts always gain horizontal world; there is no upper bound to configure.
   */
  readonly minAspect?: number;
}

/**
 * The logical view for a host of the given CSS size.
 *
 * Down to `minAspect` the base height is what is held: the view keeps its
 * vertical extent and widens or narrows with the host. Below it the width stops
 * at `baseHeight x minAspect` and the height grows instead. The two branches
 * agree exactly at `hostAspect === minAspect`, so the view never jumps as a host
 * crosses the boundary.
 */
const computeResponsiveView = (hostWidth: number, hostHeight: number, baseHeight: number, minAspect: number): { width: number; height: number } => {
  const hostAspect = hostWidth / hostHeight;

  if (hostAspect >= minAspect) {
    return { width: baseHeight * hostAspect, height: baseHeight };
  }

  const width = baseHeight * minAspect;

  return { width, height: width / hostAspect };
};

/**
 * Gives the canvas the whole parent element and derives the logical view from
 * the shape it ends up with.
 *
 * The CSS box is the parent's size, and the backing store is that size times
 * the pixel ratio, so the render resolution follows the display in both
 * directions. The canvas therefore takes the parent's aspect ratio, and the
 * logical coordinate system adapts to it rather than the canvas being letter-
 * boxed inside it: nothing is stretched, nothing is cropped, and the axis the
 * host has spare simply shows more world.
 *
 * With the default {@link ResponsiveCanvasSizingOptions.minAspect} the complete
 * base view is always visible - a wider host sees more world left and right, a
 * narrower one more above and below. Lowering `minAspect` allows the horizontal
 * view to be reduced towards that ratio first, so a phone in portrait can be
 * given a squarer view instead of a very tall one.
 *
 * Requires a canvas element with a parent in the document.
 */
export class ResponsiveCanvasSizing extends CanvasSizing {
  private readonly _tracker = new HostTracker();
  private readonly _minAspect: number | undefined;

  public constructor(options: ResponsiveCanvasSizingOptions = {}) {
    super();
    this._minAspect = options.minAspect;
  }

  public attach(context: CanvasSizingContext): void {
    const host = resolveHost(context, 'ResponsiveCanvasSizing');

    if (host === null) {
      return;
    }

    const baseAspect = context.baseWidth / context.baseHeight;
    const minAspect = this._minAspect ?? baseAspect;

    if (__DEV__) {
      assert(
        minAspect > 0 && minAspect <= baseAspect,
        `ResponsiveCanvasSizing minAspect must be greater than 0 and at most the base aspect ratio (${baseAspect}), got ${minAspect}. A value above the base ratio would crop the base view on every host.`,
      );
    }

    this._tracker.start(host, (width, height) => {
      const view = computeResponsiveView(width, height, context.baseHeight, minAspect);

      context.apply({
        cssWidth: width,
        cssHeight: height,
        logicalWidth: view.width,
        logicalHeight: view.height,
        renderWidth: width,
        renderHeight: height,
      });
    });
  }

  public override detach(): void {
    this._tracker.stop();
  }
}
