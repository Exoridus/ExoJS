import type { Circle } from './Circle';
import {
  buildCirclePoints,
  buildEllipsePoints,
  buildPolygonWorldPoints,
  buildRectanglePoints,
  getVectorLength,
  getVoronoiRegion as getVoronoiRegionForPoint,
  intersectionLineLineSegments,
  intersectionPointCircle as intersectionPrimitivePointCircle,
  intersectionPointEllipse as intersectionPrimitivePointEllipse,
  intersectionPointLineSegment,
  intersectionPointPoint as intersectionPrimitivePointPoint,
  intersectionPointPoly as intersectionPrimitivePointPoly,
  intersectionPointRect as intersectionPrimitivePointRect,
  intersectionRectRect as intersectionPrimitiveRectRect,
  polygonsIntersect,
} from './collisionPrimitives';
import type { Collidable, CollisionResponse } from './collisionTypes';
import type { Ellipse } from './Ellipse';
import { Interval } from './Interval';
import type { Line } from './Line';
import type { PointLike } from './PointLike';
import type { Polygon } from './Polygon';
import type { Rectangle } from './Rectangle';
import { clamp, getDistance, VoronoiRegion } from './utils';
import { Vector } from './Vector';

/**
 * INTERSECTION
 */

/**
 * Generic SAT (Separating Axis Theorem) boolean intersection test. Tests all
 * edge normals from both shapes and returns `false` as soon as a separating
 * axis is found.
 */
const intersectionSat = (shapeA: Collidable, shapeB: Collidable): boolean => {
  const normalsA = shapeA.getNormals();
  const normalsB = shapeB.getNormals();
  const projectionA = new Interval();
  const projectionB = new Interval();

  for (const normal of normalsA) {
    shapeA.project(normal, projectionA);
    shapeB.project(normal, projectionB);

    if (!projectionA.overlaps(projectionB)) {
      return false;
    }
  }

  for (const normal of normalsB) {
    shapeA.project(normal, projectionA);
    shapeB.project(normal, projectionB);

    if (!projectionA.overlaps(projectionB)) {
      return false;
    }
  }

  return true;
};

const intersectionPointPoint = (pointA: PointLike, pointB: PointLike, threshold = 0): boolean =>
  intersectionPrimitivePointPoint(pointA, pointB, threshold);

const intersectionPointLine = (point: PointLike, line: Line, threshold = 0.1): boolean =>
  intersectionPointLineSegment(point, line.fromPosition, line.toPosition, threshold);

const intersectionPointRect = (point: PointLike, rectangle: Rectangle): boolean => intersectionPrimitivePointRect(point, rectangle);

const intersectionPointCircle = (point: PointLike, circle: Circle): boolean => intersectionPrimitivePointCircle(point, circle);

const intersectionPointEllipse = (point: PointLike, ellipse: Ellipse): boolean => intersectionPrimitivePointEllipse(point, ellipse);

const intersectionPointPoly = (point: PointLike, polygon: Polygon): boolean => intersectionPrimitivePointPoly(point, polygon);

const intersectionLineLine = (lineA: Line, lineB: Line): boolean =>
  intersectionLineLineSegments(lineA.fromPosition, lineA.toPosition, lineB.fromPosition, lineB.toPosition);

const intersectionLineRect = (line: Line, rectangle: Rectangle): boolean => {
  const { x, y, width, height } = rectangle;
  const topLeft = { x, y };
  const topRight = { x: x + width, y };
  const bottomLeft = { x, y: y + height };
  const bottomRight = { x: x + width, y: y + height };

  return (
    intersectionLineLineSegments(line.fromPosition, line.toPosition, topLeft, bottomLeft) ||
    intersectionLineLineSegments(line.fromPosition, line.toPosition, topRight, bottomRight) ||
    intersectionLineLineSegments(line.fromPosition, line.toPosition, topLeft, topRight) ||
    intersectionLineLineSegments(line.fromPosition, line.toPosition, bottomLeft, bottomRight)
  );
};

const intersectionLineCircle = (line: Line, circle: Circle): boolean => {
  if (intersectionPointCircle(line.fromPosition, circle) || intersectionPointCircle(line.toPosition, circle)) {
    return true;
  }

  const { fromX: x1, fromY: y1, toX: x2, toY: y2 } = line;
  const { x: cx, y: cy, radius } = circle;

  const len = getDistance(x1, y1, x2, y2);

  if (len === 0) {
    return false;
  }

  const dot = ((cx - x1) * (x2 - x1) + (cy - y1) * (y2 - y1)) / (len * len);
  const closestX = x1 + dot * (x2 - x1);
  const closestY = y1 + dot * (y2 - y1);

  if (!intersectionPointLineSegment({ x: closestX, y: closestY }, line.fromPosition, line.toPosition)) {
    return false;
  }

  return getDistance(closestX, closestY, cx, cy) <= radius;
};

const intersectionLineEllipse = (line: Line, ellipse: Ellipse): boolean => {
  const { x: centerX, y: centerY, rx, ry } = ellipse;

  if (rx <= 0 || ry <= 0) {
    return false;
  }

  const x1 = (line.fromX - centerX) / rx;
  const y1 = (line.fromY - centerY) / ry;
  const x2 = (line.toX - centerX) / rx;
  const y2 = (line.toY - centerY) / ry;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const a = dx * dx + dy * dy;
  const b = 2 * (x1 * dx + y1 * dy);
  const c = x1 * x1 + y1 * y1 - 1;

  if (c <= 0) {
    return true;
  }

  if (a <= Number.EPSILON) {
    return false;
  }

  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return false;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const tA = (-b - sqrtDiscriminant) / (2 * a);
  const tB = (-b + sqrtDiscriminant) / (2 * a);

  return (tA >= 0 && tA <= 1) || (tB >= 0 && tB <= 1);
};

const intersectionLinePoly = (line: Line, polygon: Polygon): boolean => {
  const { x: offsetX, y: offsetY, points } = polygon;
  const len = points.length;

  for (let i = 0; i < len; i++) {
    // i and (i + 1) % len are valid indices into the length-`len` points array.
    const curr = points[i]!;
    const next = points[(i + 1) % len]!;

    if (
      intersectionLineLineSegments(
        line.fromPosition,
        line.toPosition,
        { x: curr.x + offsetX, y: curr.y + offsetY },
        { x: next.x + offsetX, y: next.y + offsetY },
      )
    ) {
      return true;
    }
  }

  return false;
};

const intersectionRectRect = (rectA: Rectangle, rectB: Rectangle): boolean => intersectionPrimitiveRectRect(rectA, rectB);

const intersectionRectCircle = ({ x: rx, y: ry, width, height }: Rectangle, { x: cx, y: cy, radius }: Circle): boolean => {
  const distX = clamp(cx, rx, rx + width);
  const distY = clamp(cy, ry, ry + height);

  return getDistance(cx, cy, distX, distY) <= radius;
};

const intersectionRectEllipse = (rectangle: Rectangle, ellipse: Ellipse): boolean =>
  polygonsIntersect(buildRectanglePoints(rectangle), buildEllipsePoints(ellipse));

const intersectionRectPoly = (rectangle: Rectangle, polygon: Polygon): boolean => intersectionSat(rectangle, polygon);

const intersectionCircleCircle = ({ x: x1, y: y1, radius: r1 }: Circle, { x: x2, y: y2, radius: r2 }: Circle): boolean =>
  getDistance(x1, y1, x2, y2) <= r1 + r2;

const intersectionCircleEllipse = (circle: Circle, ellipse: Ellipse): boolean =>
  polygonsIntersect(buildCirclePoints(circle), buildEllipsePoints(ellipse));

const shouldExcludeLeftVoronoi = (
  circleX: number,
  circleY: number,
  prevPoint: PointLike,
  prevEdge: PointLike,
  pointX: number,
  pointY: number,
  radius: number,
  edgeX: number,
  edgeY: number,
): boolean => {
  if (getVoronoiRegionForPoint(edgeX, edgeY, pointX, pointY) !== VoronoiRegion.left) {
    return false;
  }

  const region = getVoronoiRegionForPoint(prevEdge.x, prevEdge.y, circleX - prevPoint.x, circleY - prevPoint.y);

  return region === VoronoiRegion.right && getVectorLength(pointX, pointY) > radius;
};

const shouldExcludeRightVoronoi = (
  circleX: number,
  circleY: number,
  nextPoint: PointLike,
  nextEdge: PointLike,
  pointX: number,
  pointY: number,
  radius: number,
  edgeX: number,
  edgeY: number,
): boolean => {
  if (getVoronoiRegionForPoint(edgeX, edgeY, pointX, pointY) !== VoronoiRegion.right) {
    return false;
  }

  // In the right region the closest polygon feature is the *next* vertex, so
  // both the region refinement and the distance test use `circle - nextPoint`
  // (mirrors the right-region branch of getCollisionPolygonCircle).
  const positionBx = circleX - nextPoint.x;
  const positionBy = circleY - nextPoint.y;
  const region = getVoronoiRegionForPoint(nextEdge.x, nextEdge.y, positionBx, positionBy);

  return region === VoronoiRegion.left && getVectorLength(positionBx, positionBy) > radius;
};

const shouldExcludeMiddleVoronoi = (pointX: number, pointY: number, radius: number, edgeX: number, edgeY: number): boolean => {
  const normalX = edgeY;
  const normalY = -edgeX;
  const normalLength = getVectorLength(normalX, normalY);

  if (normalLength === 0) {
    return false;
  }

  const distance = (pointX * normalX + pointY * normalY) / normalLength;

  return distance > 0 && Math.abs(distance) > radius;
};

const intersectionCirclePoly = ({ x: cx, y: cy, radius }: Circle, { x: px, y: py, points, edges }: Polygon): boolean => {
  // Frame transform: the circle centre expressed in the polygon's local space
  // (circle.position - poly.position), matching getCollisionPolygonCircle.
  const circleX = cx - px;
  const circleY = cy - py;
  const len = points.length;

  for (let i = 0; i < len; i++) {
    // i, prev, next are all valid indices into the parallel length-`len`
    // points/edges arrays.
    const point = points[i]!;
    const pointX = circleX - point.x;
    const pointY = circleY - point.y;
    const prev = i === 0 ? len - 1 : i - 1;
    const next = (i + 1) % len;
    const edge = edges[i]!;

    if (shouldExcludeLeftVoronoi(circleX, circleY, points[prev]!, edges[prev]!, pointX, pointY, radius, edge.x, edge.y)) {
      return false;
    }

    if (shouldExcludeRightVoronoi(circleX, circleY, points[next]!, edges[next]!, pointX, pointY, radius, edge.x, edge.y)) {
      return false;
    }

    if (shouldExcludeMiddleVoronoi(pointX, pointY, radius, edge.x, edge.y)) {
      return false;
    }
  }

  return true;
};

const intersectionEllipseEllipse = (ellipseA: Ellipse, ellipseB: Ellipse): boolean =>
  polygonsIntersect(buildEllipsePoints(ellipseA), buildEllipsePoints(ellipseB));

const intersectionEllipsePoly = (ellipse: Ellipse, polygon: Polygon): boolean =>
  polygonsIntersect(buildEllipsePoints(ellipse), buildPolygonWorldPoints(polygon));

const intersectionPolyPoly = (polygonA: Polygon, polygonB: Polygon): boolean => intersectionSat(polygonA, polygonB);

/**
 * COLLISION DETECTION
 */

/**
 * Compute a {@link CollisionResponse} for two overlapping axis-aligned
 * rectangles. Returns `null` when they do not overlap.
 *
 * `projectionN` is the unit normal of the minimum-penetration axis, pointing
 * from `rectA` toward `rectB`; `projectionV` is `projectionN` scaled by the
 * overlap. Moving `rectB` by `projectionV`, or `rectA` by its negation,
 * separates the rectangles exactly with the smallest possible displacement,
 * including when one rectangle contains the other. If several directions are
 * equally short (for example identical rectangles) the first of +X, -X, +Y, -Y
 * wins, independent of operand order.
 */
const getCollisionRectangleRectangle = (rectA: Rectangle, rectB: Rectangle): CollisionResponse | null => {
  if (rectB.left > rectA.right || rectB.top > rectA.bottom) {
    return null;
  }

  if (rectA.left > rectB.right || rectA.top > rectB.bottom) {
    return null;
  }

  // Distance rectB has to travel along each axis direction to clear rectA.
  // Using all four candidates (not just the intersection extent) keeps the
  // result a real separating translation when one rectangle contains the other.
  const candidates = [
    { x: 1, y: 0, distance: rectA.right - rectB.left },
    { x: -1, y: 0, distance: rectB.right - rectA.left },
    { x: 0, y: 1, distance: rectA.bottom - rectB.top },
    { x: 0, y: -1, distance: rectB.bottom - rectA.top },
  ];

  let best = candidates[0]!;

  for (const candidate of candidates) {
    if (candidate.distance < best.distance) {
      best = candidate;
    }
  }

  const normalX = best.x;
  const normalY = best.y;
  const overlap = best.distance;

  const projectionN = new Vector(normalX, normalY);
  const projectionV = new Vector(normalX * overlap, normalY * overlap);

  return {
    shapeA: rectA,
    shapeB: rectB,
    overlap,
    shapeAinB: rectB.containsRect(rectA),
    shapeBinA: rectA.containsRect(rectB),
    projectionN,
    projectionV,
  };
};

/**
 * Compute a {@link CollisionResponse} for two overlapping circles. Returns
 * `null` when they do not overlap. `projectionN` points from `circleA` toward
 * `circleB`; with coincident centres it is `(1, 0)`.
 */
const getCollisionCircleCircle = (circleA: Circle, circleB: Circle): CollisionResponse | null => {
  const difference = circleB.position.clone().subtract(circleA.x, circleA.y);
  const distance = difference.length;
  const overlap = circleA.radius + circleB.radius - distance;

  if (overlap < 0) {
    difference.destroy();

    return null;
  }

  // Coincident centres have no direction: fall back to +X so the response
  // stays a usable unit normal.
  const projectionN = distance === 0 ? difference.set(1, 0) : difference.normalize();
  const projectionV = projectionN.clone().multiply(overlap);

  return {
    shapeA: circleA,
    shapeB: circleB,
    overlap,
    shapeAinB: circleA.radius <= circleB.radius && distance <= circleB.radius - circleA.radius,
    shapeBinA: circleB.radius <= circleA.radius && distance <= circleA.radius - circleB.radius,
    projectionN,
    projectionV,
  };
};

/**
 * Compute a {@link CollisionResponse} for a circle against an axis-aligned
 * rectangle. Returns `null` when they do not overlap. When `swap` is `true`,
 * the rectangle is `shapeA` and the circle `shapeB` (used when the rectangle
 * calls this internally); otherwise the circle is `shapeA`. `projectionN`
 * always points from `shapeA` toward `shapeB`. When the circle centre lies
 * inside the rectangle the nearest edge decides the axis; equally near edges
 * resolve to a fixed choice.
 */
const getCollisionCircleRectangle = (circle: Circle, rect: Rectangle, swap = false): CollisionResponse | null => {
  const radius = circle.radius;

  // Closest point on the rectangle to the circle center, found by clamping
  // the circle center against the rect's axis-aligned bounds.
  const closestX = Math.max(rect.left, Math.min(circle.x, rect.right));
  const closestY = Math.max(rect.top, Math.min(circle.y, rect.bottom));

  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq > radius * radius) {
    return null;
  }

  const distance = Math.sqrt(distanceSq);
  let overlap = radius - distance;

  // Containment flags: A inside B when the rect fully covers the circle,
  // B inside A when the circle fully covers the rect's bounding extent.
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const minHalf = Math.min(halfWidth, halfHeight);
  const maxHalf = Math.max(halfWidth, halfHeight);
  const centerDistance = getDistance(circle.x, circle.y, rect.left + halfWidth, rect.top + halfHeight);
  const containsA = radius <= minHalf && centerDistance <= minHalf - radius;
  const containsB = maxHalf <= radius && centerDistance <= radius - maxHalf;

  // Natural normal points from the rect surface toward the circle. When the circle
  // center lies inside the rect (distance == 0) fall back to a unit vector
  // pointing along the closer axis so callers always receive a usable MTV.
  let normalX: number;
  let normalY: number;

  if (distance > 0) {
    normalX = dx / distance;
    normalY = dy / distance;
  } else {
    // Circle center is inside the rect. Push along whichever axis has
    // the smallest exit distance.
    const exitLeft = circle.x - rect.left;
    const exitRight = rect.right - circle.x;
    const exitTop = circle.y - rect.top;
    const exitBottom = rect.bottom - circle.y;
    const minExitX = Math.min(exitLeft, exitRight);
    const minExitY = Math.min(exitTop, exitBottom);

    // The whole circle has to clear the edge, not just its centre.
    overlap = radius + Math.min(minExitX, minExitY);

    if (minExitX < minExitY) {
      normalX = exitLeft < exitRight ? -1 : 1;
      normalY = 0;
    } else {
      normalX = 0;
      normalY = exitTop < exitBottom ? -1 : 1;
    }
  }

  // The natural normal runs rect -> circle; it already points from A to B only
  // when the rect is `shapeA` (swap).
  const finalNormalX = swap ? normalX : -normalX;
  const finalNormalY = swap ? normalY : -normalY;

  const projectionN = circle.position.clone().set(finalNormalX, finalNormalY);
  const projectionV = circle.position.clone().set(finalNormalX * overlap, finalNormalY * overlap);

  return {
    shapeA: swap ? rect : circle,
    shapeB: swap ? circle : rect,
    overlap,
    shapeAinB: swap ? containsB : containsA,
    shapeBinA: swap ? containsA : containsB,
    projectionN,
    projectionV,
  };
};

/**
 * Compute a {@link CollisionResponse} between an axis-aligned ellipse and an
 * axis-aligned rectangle. Returns `null` when they do not overlap. The ellipse
 * is `shapeA` unless `swap` is `true`; `projectionN` always points from
 * `shapeA` toward `shapeB`.
 *
 * Approximate: the translation reduces the overlap but may leave a small
 * residual.
 *
 * Approach: find the closest point on the rect to the ellipse center, then
 * compare its distance against the ellipse's boundary along that direction.
 * For an axis-aligned ellipse with half-radii `(rx, ry)`, the boundary
 * distance from the center along unit direction `(dx, dy)` is
 * `1 / sqrt((dx/rx)² + (dy/ry)²)`.
 */
const getCollisionEllipseRectangle = (ellipse: Ellipse, rect: Rectangle, swap = false): CollisionResponse | null => {
  if (!intersectionRectEllipse(rect, ellipse)) {
    return null;
  }

  const closestX = Math.max(rect.left, Math.min(ellipse.x, rect.right));
  const closestY = Math.max(rect.top, Math.min(ellipse.y, rect.bottom));
  const dx = ellipse.x - closestX;
  const dy = ellipse.y - closestY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  let normalX: number;
  let normalY: number;
  let overlap: number;

  if (distance > 0) {
    normalX = dx / distance;
    normalY = dy / distance;
    const boundary = 1 / Math.sqrt((normalX * normalX) / (ellipse.rx * ellipse.rx) + (normalY * normalY) / (ellipse.ry * ellipse.ry));
    overlap = boundary - distance;
  } else {
    // Ellipse center is inside the rect - push along the smaller exit
    // axis and use the corresponding ellipse half-radius as the overlap
    // contribution.
    const exitLeft = ellipse.x - rect.left;
    const exitRight = rect.right - ellipse.x;
    const exitTop = ellipse.y - rect.top;
    const exitBottom = rect.bottom - ellipse.y;
    const minExitX = Math.min(exitLeft, exitRight);
    const minExitY = Math.min(exitTop, exitBottom);

    if (minExitX < minExitY) {
      normalX = exitLeft < exitRight ? -1 : 1;
      normalY = 0;
      overlap = minExitX + ellipse.rx;
    } else {
      normalX = 0;
      normalY = exitTop < exitBottom ? -1 : 1;
      overlap = minExitY + ellipse.ry;
    }
  }

  // The natural normal runs rect -> ellipse, i.e. A -> B only when swapped.
  const finalNormalX = swap ? normalX : -normalX;
  const finalNormalY = swap ? normalY : -normalY;
  const projectionN = ellipse.position.clone().set(finalNormalX, finalNormalY);
  const projectionV = ellipse.position.clone().set(finalNormalX * overlap, finalNormalY * overlap);

  return {
    shapeA: swap ? rect : ellipse,
    shapeB: swap ? ellipse : rect,
    overlap,
    shapeAinB: false,
    shapeBinA: false,
    projectionN,
    projectionV,
  };
};

/**
 * Compute a {@link CollisionResponse} between an axis-aligned ellipse and a
 * circle. Returns `null` when they do not overlap. Uses the ellipse's
 * directional boundary distance plus the circle's radius along the connecting
 * axis to compute penetration depth. Approximate: the translation reduces the
 * overlap but may leave a small residual. The ellipse is `shapeA` unless `swap` is
 * `true`; `projectionN` always points from `shapeA` toward `shapeB`. With
 * coincident centres the axis is the ellipse's smaller radius axis.
 */
const getCollisionEllipseCircle = (ellipse: Ellipse, circle: Circle, swap = false): CollisionResponse | null => {
  if (!intersectionCircleEllipse(circle, ellipse)) {
    return null;
  }

  const dx = ellipse.x - circle.x;
  const dy = ellipse.y - circle.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  let normalX: number;
  let normalY: number;
  let overlap: number;

  if (distance > 0) {
    normalX = dx / distance;
    normalY = dy / distance;
    const ellipseBoundary =
      1 / Math.sqrt((normalX * normalX) / (ellipse.rx * ellipse.rx) + (normalY * normalY) / (ellipse.ry * ellipse.ry));
    overlap = ellipseBoundary + circle.radius - distance;
  } else {
    // Coincident centers - use the smaller ellipse axis as the push direction.
    if (ellipse.rx <= ellipse.ry) {
      normalX = 1;
      normalY = 0;
      overlap = ellipse.rx + circle.radius;
    } else {
      normalX = 0;
      normalY = 1;
      overlap = ellipse.ry + circle.radius;
    }
  }

  // The natural normal runs circle -> ellipse, i.e. A -> B only when swapped.
  const finalNormalX = swap ? normalX : -normalX;
  const finalNormalY = swap ? normalY : -normalY;
  const projectionN = ellipse.position.clone().set(finalNormalX, finalNormalY);
  const projectionV = ellipse.position.clone().set(finalNormalX * overlap, finalNormalY * overlap);

  return {
    shapeA: swap ? circle : ellipse,
    shapeB: swap ? ellipse : circle,
    overlap,
    shapeAinB: false,
    shapeBinA: false,
    projectionN,
    projectionV,
  };
};

/**
 * Compute a {@link CollisionResponse} for a convex polygon against a circle
 * using Voronoi-region classification. Returns `null` when they do not overlap.
 * When `swap` is `true`, the circle is `shapeA` and the polygon `shapeB`.
 * `projectionN` always points from `shapeA` toward `shapeB`.
 */
const getCollisionPolygonCircle = (polygon: Polygon, circle: Circle, swap = false): CollisionResponse | null => {
  const radius = circle.radius;
  const points = polygon.points;
  const x = circle.x - polygon.x;
  const y = circle.y - polygon.y;
  const projection = circle.position.clone().set(0, 0);
  const len = points.length;

  let containsA = true;
  let containsB = true;
  let overlap = Infinity;

  for (let i = 0; i < len; i++) {
    // All polygon-vertex indices below (i, i+1, i-1, i+2, modulo len) are valid
    // indices into the length-`len` points array.
    const pointA = points[i]!;
    const pointB = points[(i + 1) % len]!;
    const edgeAx = pointB.x - pointA.x;
    const edgeAy = pointB.y - pointA.y;
    const positionAx = x - pointA.x;
    const positionAy = y - pointA.y;
    const region = getVoronoiRegionForPoint(edgeAx, edgeAy, positionAx, positionAy);
    const pointDistanceA = getVectorLength(positionAx, positionAy);

    if (pointDistanceA > radius) {
      containsA = false;
    }

    if (region === VoronoiRegion.left) {
      const prev = points[i === 0 ? len - 1 : i - 1]!;
      const edgeBx = pointA.x - prev.x;
      const edgeBy = pointA.y - prev.y;
      const positionBx = x - prev.x;
      const positionBy = y - prev.y;

      if (getVoronoiRegionForPoint(edgeBx, edgeBy, positionBx, positionBy) === VoronoiRegion.right) {
        if (pointDistanceA > radius) {
          projection.destroy();

          return null;
        }

        const candidateOverlap = radius - pointDistanceA;

        if (Math.abs(candidateOverlap) < Math.abs(overlap)) {
          overlap = candidateOverlap;
          projection.set(positionAx, positionAy).normalize();
        }

        containsB = false;
      }
    } else if (region === VoronoiRegion.right) {
      const next = points[(i + 2) % len]!;
      const edgeBx = next.x - pointB.x;
      const edgeBy = next.y - pointB.y;
      const positionBx = x - pointB.x;
      const positionBy = y - pointB.y;
      const pointDistanceB = getVectorLength(positionBx, positionBy);

      if (getVoronoiRegionForPoint(edgeBx, edgeBy, positionBx, positionBy) === VoronoiRegion.left) {
        if (pointDistanceB > radius) {
          projection.destroy();

          return null;
        }

        const candidateOverlap = radius - pointDistanceB;

        if (Math.abs(candidateOverlap) < Math.abs(overlap)) {
          overlap = candidateOverlap;
          projection.set(positionBx, positionBy).normalize();
        }

        containsB = false;
      }
    } else {
      const normalX = edgeAy;
      const normalY = -edgeAx;
      const normalLength = getVectorLength(normalX, normalY);
      const distance = normalLength === 0 ? 0 : (positionAx * normalX + positionAy * normalY) / normalLength;

      if (distance > 0 && Math.abs(distance) > radius) {
        projection.destroy();

        return null;
      }

      if (distance >= 0 || radius - distance < 2 * radius) {
        containsB = false;
      }

      const candidateOverlap = radius - distance;

      if (Math.abs(candidateOverlap) < Math.abs(overlap)) {
        overlap = candidateOverlap;
        projection.set(normalX, normalY).normalize();
      }
    }
  }

  // The natural normal runs polygon -> circle.
  if (swap) {
    projection.multiply(-1, -1);
  }

  const projectionV = projection.clone().multiply(overlap);

  return {
    shapeA: swap ? circle : polygon,
    shapeB: swap ? polygon : circle,
    overlap,
    shapeAinB: swap ? containsB : containsA,
    shapeBinA: swap ? containsA : containsB,
    projectionN: projection,
    projectionV,
  };
};

/**
 * Compute a {@link CollisionResponse} between two axis-aligned ellipses.
 * Returns `null` when they do not overlap. `projectionN` points from
 * `ellipseA` toward `ellipseB`.
 *
 * Approximate: the translation reduces the overlap but may leave a small
 * residual. Uses the centre-to-centre axis as the separation axis and computes each
 * ellipse's exact boundary distance along that direction via the formula
 * `sqrt((nx·rx)² + (ny·ry)²)`.  This is exact when the minimum-penetration
 * axis coincides with the centre axis (e.g. circles, concentric ellipses) and
 * a good approximation otherwise - equivalent in quality to the axis-projection
 * approach used for ellipse-vs-circle and ellipse-vs-rectangle.
 */
const getCollisionEllipseEllipse = (ellipseA: Ellipse, ellipseB: Ellipse): CollisionResponse | null => {
  if (!intersectionEllipseEllipse(ellipseA, ellipseB)) {
    return null;
  }

  const dx = ellipseB.x - ellipseA.x;
  const dy = ellipseB.y - ellipseA.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  let normalX: number;
  let normalY: number;
  let overlap: number;

  if (distance > 0) {
    normalX = dx / distance;
    normalY = dy / distance;
    const boundaryA = Math.sqrt((normalX * ellipseA.rx) ** 2 + (normalY * ellipseA.ry) ** 2);
    const boundaryB = Math.sqrt((normalX * ellipseB.rx) ** 2 + (normalY * ellipseB.ry) ** 2);
    overlap = boundaryA + boundaryB - distance;
  } else {
    // Coincident centres - push along the smaller axis of ellipseA
    if (ellipseA.rx <= ellipseA.ry) {
      normalX = 1;
      normalY = 0;
      overlap = ellipseA.rx + ellipseB.rx;
    } else {
      normalX = 0;
      normalY = 1;
      overlap = ellipseA.ry + ellipseB.ry;
    }
  }

  if (overlap <= 0) {
    return null;
  }

  const projectionN = ellipseA.position.clone().set(normalX, normalY);
  const projectionV = ellipseA.position.clone().set(normalX * overlap, normalY * overlap);

  return {
    shapeA: ellipseA,
    shapeB: ellipseB,
    overlap,
    shapeAinB: false,
    shapeBinA: false,
    projectionN,
    projectionV,
  };
};

/**
 * Full SAT collision response for any two {@link Collidable} shapes. Tests all
 * edge normals from both shapes and computes the minimum-translation axis.
 * Returns `null` when they do not overlap.
 *
 * `projectionN` points from `shapeA` toward `shapeB` - the same orientation the
 * shape-specific responses use - so moving `shapeB` by `projectionV`, or
 * `shapeA` by its negation, pulls the pair apart. When the projection midpoints
 * on the winning axis coincide the axis keeps its edge-normal orientation.
 * Exact for convex polygons and rectangles; an ellipse contributes no edge
 * normals, so ellipse pairs are approximate.
 */
const getCollisionSat = (shapeA: Collidable, shapeB: Collidable): CollisionResponse | null => {
  const normalsA = shapeA.getNormals();
  const normalsB = shapeB.getNormals();
  // SAT requires at least one edge normal. A degenerate shape (empty polygon,
  // a line, an ellipse) yields none, so there is no axis to separate on.
  const firstNormal = normalsA[0] ?? normalsB[0];

  if (firstNormal === undefined) {
    return null;
  }

  const projection = firstNormal.clone();
  const projA = new Interval();
  const projB = new Interval();

  let overlap = Infinity;
  // Edge normals only describe an axis orientation, never a side: a shape hands
  // out both `n` and `-n`, so the winning axis on its own cannot tell where
  // shapeB sits and mirrored layouts collapse onto one direction - pushing one
  // of the two pairs deeper instead of apart. Record whether the chosen axis has
  // to be flipped to keep pointing from shapeA toward shapeB, deciding by
  // projection midpoint (kept doubled as `min + max` to skip the halving).
  let flipProjection = false;
  let shapeAinB = true;
  let shapeBinA = true;
  let containsA: boolean;
  let containsB: boolean;
  let distance: number;

  for (const normal of normalsA) {
    shapeA.project(normal, projA);
    shapeB.project(normal, projB);

    if (!projA.overlaps(projB)) {
      projection.destroy();

      return null;
    }

    distance = projA.getOverlap(projB);
    containsA = projB.containsInterval(projA);
    containsB = projA.containsInterval(projB);

    if (!containsA && shapeAinB) {
      shapeAinB = false;
    }

    if (!containsB && shapeBinA) {
      shapeBinA = false;
    }

    if (containsA || containsB) {
      distance += Math.min(Math.abs(projA.min - projB.min), Math.abs(projA.max - projB.max));
    }

    if (distance < overlap) {
      overlap = distance;
      projection.copy(normal);
      flipProjection = projA.min + projA.max > projB.min + projB.max;
    }
  }

  for (const normal of normalsB) {
    shapeA.project(normal, projA);
    shapeB.project(normal, projB);

    if (!projA.overlaps(projB)) {
      projection.destroy();

      return null;
    }

    distance = projA.getOverlap(projB);
    containsA = projB.containsInterval(projA);
    containsB = projA.containsInterval(projB);

    if (!containsA && shapeAinB) {
      shapeAinB = false;
    }

    if (!containsB && shapeBinA) {
      shapeBinA = false;
    }

    if (containsA || containsB) {
      distance += Math.min(Math.abs(projA.min - projB.min), Math.abs(projA.max - projB.max));
    }

    if (distance < overlap) {
      overlap = distance;
      projection.copy(normal);
      flipProjection = projA.min + projA.max > projB.min + projB.max;
    }
  }

  if (flipProjection) {
    projection.multiply(-1, -1);
  }

  const projectionV = projection.clone().multiply(overlap, overlap);

  return {
    shapeA,
    shapeB,
    overlap,
    shapeAinB,
    shapeBinA,
    projectionN: projection,
    projectionV,
  };
};

export {
  getCollisionCircleCircle,
  getCollisionCircleRectangle,
  getCollisionEllipseCircle,
  getCollisionEllipseEllipse,
  getCollisionEllipseRectangle,
  getCollisionPolygonCircle,
  getCollisionRectangleRectangle,
  getCollisionSat,
  intersectionCircleCircle,
  intersectionCircleEllipse,
  intersectionCirclePoly,
  intersectionEllipseEllipse,
  intersectionEllipsePoly,
  intersectionLineCircle,
  intersectionLineEllipse,
  intersectionLineLine,
  intersectionLinePoly,
  intersectionLineRect,
  intersectionPointCircle,
  intersectionPointEllipse,
  intersectionPointLine,
  intersectionPointPoint,
  intersectionPointPoly,
  intersectionPointRect,
  intersectionPolyPoly,
  intersectionRectCircle,
  intersectionRectEllipse,
  intersectionRectPoly,
  intersectionRectRect,
  intersectionSat,
};

/**
 * Shape-vs-shape collision queries, grouped as a namespace so the public API
 * carries no loose `intersection*`/`getCollision*` functions: `intersects.*`
 * are boolean overlap tests, `resolve.*` return a minimum-translation-vector
 * response. The underlying functions stay module exports for internal use; only
 * this facade is in the public barrel (the low-level `*Sat` primitives stay
 * internal-only).
 */
export const Collision = {
  intersects: {
    circleCircle: intersectionCircleCircle,
    circleEllipse: intersectionCircleEllipse,
    circlePoly: intersectionCirclePoly,
    ellipseEllipse: intersectionEllipseEllipse,
    ellipsePoly: intersectionEllipsePoly,
    lineCircle: intersectionLineCircle,
    lineEllipse: intersectionLineEllipse,
    lineLine: intersectionLineLine,
    linePoly: intersectionLinePoly,
    lineRect: intersectionLineRect,
    pointCircle: intersectionPointCircle,
    pointEllipse: intersectionPointEllipse,
    pointLine: intersectionPointLine,
    pointPoint: intersectionPointPoint,
    pointPoly: intersectionPointPoly,
    pointRect: intersectionPointRect,
    polyPoly: intersectionPolyPoly,
    rectCircle: intersectionRectCircle,
    rectEllipse: intersectionRectEllipse,
    rectPoly: intersectionRectPoly,
    rectRect: intersectionRectRect,
  },
  resolve: {
    circleCircle: getCollisionCircleCircle,
    circleRectangle: getCollisionCircleRectangle,
    ellipseCircle: getCollisionEllipseCircle,
    ellipseEllipse: getCollisionEllipseEllipse,
    ellipseRectangle: getCollisionEllipseRectangle,
    polygonCircle: getCollisionPolygonCircle,
    rectangleRectangle: getCollisionRectangleRectangle,
  },
} as const;
