import { CanvasSizing, type CanvasSizingContext } from './CanvasSizing';
import { fitToHost, HostTracker, resolveHost } from './hostTracking';

/**
 * Scales the canvas to its parent while the render resolution stays exactly at
 * the base resolution.
 *
 * The CSS box is the largest base-aspect rectangle that fits the parent, so the
 * canvas grows on a large display and shrinks on a small one, but the backing
 * store is always `base x pixelRatio` and the logical coordinate system is
 * always the base resolution. Whatever space the parent has left over around
 * that rectangle stays the page's - nothing is drawn into it.
 *
 * The mode for a deliberately constant internal resolution: retro and pixel-art
 * rendering, a fixed GPU cost per frame, or any presentation where the canvas is
 * an image that is merely scaled to the viewport.
 *
 * Requires a canvas element with a parent in the document.
 */
export class FixedResolutionCanvasSizing extends CanvasSizing {
  private readonly _tracker = new HostTracker();

  public attach(context: CanvasSizingContext): void {
    const host = resolveHost(context, 'FixedResolutionCanvasSizing');

    if (host === null) {
      return;
    }

    this._tracker.start(host, (width, height) => {
      const box = fitToHost(width, height, context.baseWidth, context.baseHeight);

      context.apply({
        cssWidth: box.width,
        cssHeight: box.height,
        logicalWidth: context.baseWidth,
        logicalHeight: context.baseHeight,
        renderWidth: context.baseWidth,
        renderHeight: context.baseHeight,
      });
    });
  }

  public override detach(): void {
    this._tracker.stop();
  }
}
