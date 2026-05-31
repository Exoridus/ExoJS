import { Geometry } from './Geometry';
import type { GeometryAttribute } from './GeometryAttribute';

const quadAttributes: readonly GeometryAttribute[] = [
  { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
  { name: 'a_uv', size: 2, type: 'f32', normalized: false, offset: 8 },
];

const quadVertexData = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1]);

const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/** @internal */
export class QuadGeometry extends Geometry {
  public constructor() {
    super({
      attributes: quadAttributes,
      vertexData: new Float32Array(quadVertexData),
      stride: 16,
      indices: new Uint16Array(quadIndices),
      usage: 'static',
    });
  }
}
