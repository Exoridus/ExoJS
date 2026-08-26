import { type RenderingContext, Scene } from '@codexo/exojs';

// The application's own overlay: the counter is the engine's, the widget is not.
declare const hud: { setStatus: (text: string) => void };

class ReadoutScene extends Scene {
  public override draw(context: RenderingContext): void {
    // #region guide:draw-call-readout
    const drawCalls = context.stats.drawCalls;
    hud.setStatus(`sparks via RenderBatch - drawCalls: ${drawCalls}`);
    // #endregion guide:draw-call-readout
  }
}

export { ReadoutScene };
