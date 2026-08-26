import { Geometry, RenderBatch, type RenderingContext, Scene } from '@codexo/exojs';

// The application's own vertex writer: what it draws is its business, that the
// buffer is republished with invalidate() is the guide's.
declare const writeWaveVertices: (target: ArrayBuffer, elapsed: number) => void;

class RibbonScene extends Scene {
  private elapsed = 0;
  private ribbon = new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array(256),
    stride: 8,
    usage: 'dynamic',
  });

  private batch = new RenderBatch(this.ribbon);

  public override draw(context: RenderingContext): void {
    // #region guide:dynamic-geometry
    // Rewrite the vertex data in place, then publish the change.
    writeWaveVertices(this.ribbon.vertexData as ArrayBuffer, this.elapsed);
    this.ribbon.invalidate();

    context.drawBatch(this.batch);
    // #endregion guide:dynamic-geometry
  }
}

export { RibbonScene };
