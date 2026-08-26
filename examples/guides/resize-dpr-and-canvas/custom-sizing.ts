import { CanvasSizing, type CanvasSizingContext, Scene } from '@codexo/exojs';

// #region guide:custom-sizing
class HalfHeightCanvasSizing extends CanvasSizing {
  private observer: ResizeObserver | null = null;

  override attach(context: CanvasSizingContext): void {
    const host = context.host;

    if (host === null) return;

    const commit = (): void => {
      const width = host.clientWidth;
      const height = host.clientHeight / 2;

      context.apply({
        cssWidth: width,
        cssHeight: height,
        logicalWidth: context.baseWidth,
        logicalHeight: context.baseHeight,
        renderWidth: width,
        renderHeight: height,
      });
    };

    commit();
    this.observer = new ResizeObserver(commit);
    this.observer.observe(host);
  }

  override detach(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
// #endregion guide:custom-sizing

class LayoutScene extends Scene {
  // #region guide:relayout-on-resize
  override init(): void {
    this.layout();
    this.app.onResize.add(() => this.layout());
  }
  // #endregion guide:relayout-on-resize

  private layout(): void {
    // ... position the scene's nodes for the current canvas size ...
  }
}

export { HalfHeightCanvasSizing, LayoutScene };
