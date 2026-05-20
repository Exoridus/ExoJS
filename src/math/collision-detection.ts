import type { Circle } from '@/math/Circle';
import type { Collidable, CollisionResponse } from '@/math/Collision';
import type { Ellipse } from '@/math/Ellipse';
import { Interval } from '@/math/Interval';
import type { Line } from '@/math/Line';
import type { PointLike } from '@/math/PointLike';
import type { Polygon } from '@/math/Polygon';
import type { Rectangle } from '@/math/Rectangle';
import { clamp, getDistance, VoronoiRegion } from '@/math/utils';

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
} from './collision-primitives';

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

const intersectionPointPoint = (pointA: PointLike, pointB: PointLike, threshold = 0): boolean => intersectionPrimitivePointPoint(pointA, pointB, threshold);

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
    const curr = points[i];
    const next = points[(i + 1) % len];

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

const intersectionCircleEllipse = (circle: Circle, ellipse: Ellipse): boolean => polygonsIntersect(buildCirclePoints(circle), buildEllipsePoints(ellipse));

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

  const region = getVoronoiRegionForPoint(nextEdge.x, nextEdge.y, circleX - nextPoint.x, circleY - nextPoint.y);

  return region === VoronoiRegion.left && getVectorLength(pointX, pointY) > radius;
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
  // Frame transform: express the circle's position relative to the polygon's
  // local space, but with the sign inverted (poly.position - circle.position
  // rather than the natural circle.position - poly.position). The poly's
  // `points` are then in their local coordinates and the Voronoi-region tests
  // below combine them with the negated-offset circle position to reach the
  // same value as a positively-offset frame would. Don't flip without
  // re-deriving the Voronoi math.
  const circleX = px - cx;
  const circleY = py - cy;
  const len = points.length;

  for (let i = 0; i < len; i++) {
    const point = points[i];
    const pointX = circleX - point.x;
    const pointY = circleY - point.y;
    const prev = i === 0 ? len - 1 : i - 1;
    const next = (i + 1) % len;
    const edge = edges[i];

    if (shouldExcludeLeftVoronoi(circleX, circleY, points[prev], edges[prev], pointX, pointY, radius, edge.x, edge.y)) {
      return false;
    }

    if (shouldExcludeRightVoronoi(circleX, circleY, points[next], edges[next], pointX, pointY, radius, edge.x, edge.y)) {
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
 * `projectionN` is the unit normal of the minimum-penetration axis;
 * `projectionV` is the minimum-translation vector — moving `rectA` by
 * `projectionV` separates the two rectangles with the smallest possible
 * displacement.
 */
const getCollisionRectangleRectangle = (rectA: Rectangle, rectB: Rectangle): CollisionResponse | null => {
  if (rectB.left > rectA.right || rectB.top > rectA.bottom) {
    return null;
  }

  if (rectA.left > rectB.right || rectA.top > rectB.bottom) {
    return null;
  }

  const overlapX = Math.min(rectA.right, rectB.right) - Math.max(rectA.left, rectB.left);
  const overlapY = Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.top, rectB.top);

  // Pick the axis with the smaller overlap as the MTV — pushing along that
  // axis separates the rectangles with the least displacement. Sign is
  // determined by whether rectB's center is right/below or left/above of
  // rectA's center.
  const centerAx = rectA.left + rectA.width * 0.5;
  const centerAy = rectA.top + rectA.height * 0.5;
  const centerBx = rectB.left + rectB.width * 0.5;
  const centerBy = rectB.top + rectB.height * 0.5;

  let normalX: number;
  let normalY: number;
  let overlap: number;

  if (overlapX < overlapY) {
    overlap = overlapX;
    normalX = centerBx < centerAx ? -1 : 1;
    normalY = 0;
  } else {
    overlap = overlapY;
    normalX = 0;
    normalY = centerBy < centerAy ? -1 : 1;
  }

  const projectionN = rectA.position.clone().set(normalX, normalY);
  const projectionV = rectA.position.clone().set(normalX * overlap, normalY * overlap);

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

/** Compute a {@link CollisionResponse} for two overlapping circles. Returns `null` when they do not overlap. */
const getCollisionCircleCircle = (circleA: Circle, circleB: Circle): CollisionResponse | null => {
  const difference = circleB.position.clone().subtract(circleA.x, circleA.y);
  const distance = difference.length;
  const overlap = circleA.radius + circleB.radius - distance;

  if (overlap < 0) {
    difference.destroy();
    return null;
  }

  const projectionN = difference.clone().normalize();
  const projectionV = difference.multiply(overlap);

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
 * `shapeA`/`shapeB` in the response are swapped (used when the rectangle calls
 * this internally as the "other" shape).
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
  const overlap = radius - distance;

  // Containment flags: A inside B when the rect fully covers the circle,
  // B inside A when the circle fully covers the rect's bounding extent.
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const minHalf = Math.min(halfWidth, halfHeight);
  const maxHalf = Math.max(halfWidth, halfHeight);
  const centerDistance = getDistance(circle.x, circle.y, rect.left + halfWidth, rect.top + halfHeight);
  const containsA = radius <= minHalf && centerDistance <= minHalf - radius;
  const containsB = maxHalf <= radius && centerDistance <= radius - maxHalf;

  // Normal points from the rect surface toward the circle. When the circle
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

    if (minExitX < minExitY) {
      normalX = exitLeft < exitRight ? -1 : 1;
      normalY = 0;
    } else {
      normalX = 0;
      normalY = exitTop < exitBottom ? -1 : 1;
    }
  }

  // When the response is "swapped" (rect-against-circle), flip the normal
  // so it points from `shapeA` (rect) toward `shapeB` (circle).
  const finalNormalX = swap ? -normalX : normalX;
  const finalNormalY = swap ? -normalY : normalY;

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
 * axis-aligned rectangle. Returns `null` when they do not overlap.
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
    // Ellipse center is inside the rect — push along the smaller exit
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

  const finalNormalX = swap ? -normalX : normalX;
  const finalNormalY = swap ? -normalY : normalY;
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
 * axis to compute penetration depth.
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
    const ellipseBoundary = 1 / Math.sqrt((normalX * normalX) / (ellipse.rx * ellipse.rx) + (normalY * normalY) / (ellipse.ry * ellipse.ry));
    overlap = ellipseBoundary + circle.radius - distance;
  } else {
    // Coincident centers — use the smaller ellipse axis as the push direction.
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

  const finalNormalX = swap ? -normalX : normalX;
  const finalNormalY = swap ? -normalY : normalY;
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
 * When `swap` is `true`, `shapeA`/`shapeB` roles are swapped in the response.
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
    const pointA = points[i];
    const pointB = points[(i + 1) % len];
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
      const prev = points[i === 0 ? len - 1 : i - 1];
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
      const next = points[(i + 2) % len];
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
 * Returns `null` when they do not overlap.
 *
 * Uses the centre-to-centre axis as the separation axis and computes each
 * ellipse's exact boundary distance along that direction via the formula
 * `sqrt((nx·rx)² + (ny·ry)²)`.  This is exact when the minimum-penetration
 * axis coincides with the centre axis (e.g. circles, concentric ellipses) and
 * a good approximation otherwise — equivalent in quality to the axis-projection
 * approach used for ellipse-vs-circle and ellipse-vs-rectangle.
 */
const getCollisionEllipseEllipse = (ellipseA: Ellipse, ellipseB: Ellipse): CollisionResponse | null => {
  if (!intersectionEllipseEllipse(ellipseA, ellipseB)) return null;

  const dx = ellipseA.x - ellipseB.x;
  const dy = ellipseA.y - ellipseB.y;
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
    // Coincident centres — push along the smaller axis of ellipseA
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

  if (overlap <= 0) return null;

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
 */
const getCollisionSat = (shapeA: Collidable, shapeB: Collidable): CollisionResponse | null => {
  const normalsA = shapeA.getNormals();
  const normalsB = shapeB.getNormals();
  const projection = (normalsA[0] || normalsB[0]).clone();
  const projA = new Interval();
  const projB = new Interval();

  let overlap = Infinity;
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
    }
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
