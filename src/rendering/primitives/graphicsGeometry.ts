import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { buildCircle, buildEllipse, buildPolygon, buildRectangle, type MeshGeometryData } from '#math/geometry';
import { Polygon } from '#math/Polygon';
import { subtractPolygons } from '#math/polygonSubtract';
import { Rectangle } from '#math/Rectangle';
import { triangulateWithHoles } from '#math/triangulate';

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

/**
 * Closed outline rings of a source as flat (x, y) pairs, tessellated exactly as
 * its fill is. Open path contours are skipped.
 * @internal
 */
export const graphicsSourceRings = (source: GraphicsShapeSource): number[][] => {
  if (source instanceof Rectangle) {
    return source.width !== 0 && source.height !== 0 ? [buildRectangle(source.x, source.y, source.width, source.height).points] : [];
  }

  if (source instanceof Circle) {
    return source.radius > 0 ? [buildCircle(source.x, source.y, source.radius).points] : [];
  }

  if (source instanceof Ellipse) {
    return source.rx > 0 && source.ry > 0 ? [buildEllipse(source.x, source.y, source.rx, source.ry).points] : [];
  }

  if (source instanceof Polygon) {
    return source.points.length >= 3 ? [source.points.flatMap(point => [point.x + source.x, point.y + source.y])] : [];
  }

  return source
    .contours()
    .filter(contour => contour.closed && contour.points.length >= 6)
    .map(contour => [...contour.points]);
};

/**
 * Fill of `source` minus the union of `cuts`, or `null` when nothing remains.
 * @internal
 */
export const buildGraphicsCutFill = (source: GraphicsShapeSource, cuts: Iterable<GraphicsShapeSource>): MeshGeometryData | null => {
  const cutRings = [...cuts].flatMap(graphicsSourceRings);
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const ring of graphicsSourceRings(source)) {
    for (const polygon of subtractPolygons(ring, cutRings)) {
      const points = [...polygon.outer, ...polygon.holes.flat()];
      const holeStarts: number[] = [];
      let start = polygon.outer.length / 2;

      for (const hole of polygon.holes) {
        holeStarts.push(start);
        start += hole.length / 2;
      }

      const base = vertices.length / 2;

      for (const index of triangulateWithHoles(points, holeStarts)) {
        indices.push(index + base);
      }

      vertices.push(...points);
    }
  }

  if (indices.length === 0) {
    return null;
  }

  if (vertices.length / 2 > 65535) {
    throw new Error('Graphics fill exceeds the 16-bit vertex limit.');
  }

  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices), points: [] };
};
