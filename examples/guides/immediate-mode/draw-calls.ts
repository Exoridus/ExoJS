import { Color, Geometry, Matrix, RenderBatch, type RenderingContext, Scene } from '@codexo/exojs';

const triangleGeometry = new Geometry({
  attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
  vertexData: new Float32Array([0, -40, 40, 40, -40, 40]),
  stride: 8,
  usage: 'static',
});

interface Spark {
  angle: number;
  radius: number;
  scale: number;
  tint: Color;
}

class GeometryScene extends Scene {
  private elapsed = 0;
  private transform = new Matrix();
  private triangle = triangleGeometry;
  private tints = [Color.tomato, Color.goldenrod, Color.mediumSeaGreen, Color.cornflowerBlue, Color.orchid];

  // #region guide:draw-geometry
  override draw(context: RenderingContext): void {
    // A row of the same triangle, each at a different position, rotation,
    // and scale. Each call is its own flush and its own draw call.
    for (let i = 0; i < 5; i++) {
      const angle = this.elapsed + i;
      const cos = Math.cos(angle) * 1.5;
      const sin = Math.sin(angle) * 1.5;
      const x = 200 + i * 160;

      // Row-major affine: a, b, x, c, d, y.
      this.transform.set(cos, -sin, x, sin, cos, 360);
      context.drawGeometry(this.triangle, this.transform, { tint: this.tints[i] });
    }
  }
  // #endregion guide:draw-geometry
}

class BatchScene extends Scene {
  private batch = new RenderBatch(triangleGeometry);
  private scratch = new Matrix();
  private sparks: Spark[] = [];
  private centerX = 0;
  private centerY = 0;

  // #region guide:draw-batch
  override draw(context: RenderingContext): void {
    this.batch.clear();
    for (const spark of this.sparks) {
      const x = this.centerX + Math.cos(spark.angle) * spark.radius;
      const y = this.centerY + Math.sin(spark.angle) * spark.radius;

      // One scratch matrix, rewritten and copied into the batch per instance.
      this.scratch.set(spark.scale, 0, x, 0, spark.scale, y);
      this.batch.add(this.scratch, spark.tint);
    }

    // Every instance ships as ONE instanced draw call.
    context.drawBatch(this.batch);
  }
  // #endregion guide:draw-batch
}

export { BatchScene, GeometryScene };
