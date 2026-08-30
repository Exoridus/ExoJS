import { CanvasSizing, type CanvasSizingContext } from './CanvasSizing';
import { fitToHost, HostTracker, resolveHost } from './HostTracker';

/**
 * Scales the canvas to its parent and lets the render resolution follow it
 * downwards, but never above the base resolution.
 *
 * The CSS box is the largest base-aspect rectangle that fits the parent, exactly
 * as with {@link FixedResolutionCanvasSizing}. Below the base resolution the
 * backing store follows the smaller display size, so a phone renders fewer
 * pixels; above it the backing store stops at `base x pixelRatio`, so a large
 * display costs no more to draw than the resolution the app was authored for.
 * The logical coordinate system is always the base resolution.
 *
 * The balanced responsive mode, and the usual choice when a fixed aspect ratio
 * is wanted but a fixed pixel budget is not.
 *
 * Requires a canvas element with a parent in the document.
 */
export class CappedResolutionCanvasSizing extends CanvasSizing {
  private readonly _tracker = new HostTracker();

  public attach(context: CanvasSizingContext): void {
    const host = resolveHost(context, 'CappedResolutionCanvasSizing');

    if (host === null) {
      return;
    }

    this._tracker.start(host, (width, height) => {
      const box = fitToHost(width, height, context.baseWidth, context.baseHeight);
      // Taken from the fitted box rather than per axis: the box already carries
      // the base aspect ratio, so one factor keeps the render resolution on it.
      const scale = Math.min(1, box.width / context.baseWidth);

      context.apply({
        cssWidth: box.width,
        cssHeight: box.height,
        logicalWidth: context.baseWidth,
        logicalHeight: context.baseHeight,
        renderWidth: context.baseWidth * scale,
        renderHeight: context.baseHeight * scale,
      });
    });
  }

  public override detach(): void {
    this._tracker.stop();
  }
}
