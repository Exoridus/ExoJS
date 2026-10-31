import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { buildCircle, buildEllipse, buildPolygon, buildRectangle, type MeshGeometryData } from '#math/geometry';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';

import { GraphicsPath } from './GraphicsPath';
import type { GraphicsShapeSource } from './GraphicsShape';

/** @internal */
export const buildGraphicsFill = (source: GraphicsShapeSource): MeshGeometryData | null => {
  if (source instanceof Rectangle) {
    return buildRectangle(source.x, source.y, source.width, source.height);
  }

  if (source instanceof Circle) {
    return source.radius > 0 ? buildCircle(source.x, source.y, source.radius) : null;
  }

  if (source instanceof Ellipse) {
    return source.rx > 0 && source.ry > 0 ? buildEllipse(source.x, source.y, source.rx, source.ry) : null;
  }

  if (source instanceof Polygon) {
    return source.points.length >= 3 ? buildPolygon(source.points.flatMap(point => [point.x + source.x, point.y + source.y])) : null;
  }

  if (source instanceof GraphicsPath) {
    const parts = source
      .contours()
      .filter(contour => contour.points.length >= 6)
      .map(contour => buildPolygon([...contour.points]));
    const vertexLength = parts.reduce((sum, part) => sum + part.vertices.length, 0);
    const indexLength = parts.reduce((sum, part) => sum + part.indices.length, 0);

    if (vertexLength === 0 || indexLength === 0) {
      return null;
    }

    if (vertexLength / 2 > 65535) {
      throw new Error('Graphics fill exceeds the 16-bit vertex limit.');
    }

    const vertices = new Float32Array(vertexLength);
    const indices = new Uint16Array(indexLength);
    let vertexOffset = 0;
    let indexOffset = 0;

    for (const part of parts) {
      vertices.set(part.vertices, vertexOffset);

      for (const index of part.indices) {
        indices[indexOffset++] = index + vertexOffset / 2;
      }

      vertexOffset += part.vertices.length;
    }

    return { vertices, indices, points: [] };
  }

  throw new Error('Unsupported Graphics shape source.');
};
