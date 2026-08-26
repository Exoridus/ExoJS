import { Color, Geometry, INSTANCE_TRANSFORM_GLSL, Matrix, MeshMaterial, RenderBatch, Scene, ShaderSource } from '@codexo/exojs';

interface Spark {
  driftX: number;
  driftY: number;
  phase: number;
  scale: number;
  tint: Color;
  x: number;
  y: number;
}

const sparkGeometry = new Geometry({
  attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
  vertexData: new Float32Array([0, 0, 8, 0, 4, 8]),
  stride: 8,
  usage: 'static',
});

const sparkMaterial = new MeshMaterial({
  shader: new ShaderSource({
    glsl: {
      vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}`,
      fragment: '#version 300 es\nprecision mediump float;\nout vec4 fragColor;\nvoid main() { fragColor = vec4(1.0); }',
    },
  }),
});

// #region guide:instance-attributes
const batch = new RenderBatch(sparkGeometry, sparkMaterial, {
  instanceAttributes: [
    { name: 'a_offset', format: 'float32x2' },
    { name: 'a_phase', format: 'float32' },
  ],
});
// #endregion guide:instance-attributes

class SparkFieldScene extends Scene {
  private batch = batch;
  private scratch = new Matrix();
  private sparks: Spark[] = [];

  private submit(): void {
    // #region guide:instance-data
    const data = { a_offset: [0, 0], a_phase: 0 };

    this.batch.clear();
    for (const spark of this.sparks) {
      data.a_offset[0] = spark.driftX;
      data.a_offset[1] = spark.driftY;
      data.a_phase = spark.phase;

      this.scratch.set(spark.scale, 0, spark.x, 0, spark.scale, spark.y);
      this.batch.add(this.scratch, spark.tint, data);
    }
    // #endregion guide:instance-data
  }
}

export { SparkFieldScene };
