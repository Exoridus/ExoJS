import { CanvasSizing, type CanvasSizingContext } from '@codexo/exojs';

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

export { HalfHeightCanvasSizing };
