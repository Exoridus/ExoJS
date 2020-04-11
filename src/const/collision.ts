import SceneNode from "../core/SceneNode";
import Polygon from "../math/Polygon";
import Rectangle from "../math/Rectangle";
import Circle from "../math/Circle";
import Interval from "../math/Interval";
import Vector from "../math/Vector";
import { getDistance, getVoronoiRegion } from "../utils/math";
import { VORONOI_REGION } from "./math";

export interface Collision {
    readonly shapeA: Collidable;
    readonly shapeB: Collidable;
    readonly overlap: number;
    readonly shapeAInB: boolean;
    readonly shapeBInA: boolean;
    readonly projectionN: Vector;
    readonly projectionV: Vector;
}

export const enum CollisionType {
    Rectangle,
    TransformableRectangle,
    Circle,
    TransformableCircle,
    Polygon,
}

export interface Collidable {
    readonly collisionType: CollisionType;
    getNormals(): Array<Vector>;
    project(axis: Vector, interval?: Interval): Interval;
    intersects(target: Collidable): boolean;
    getCollision(target: Collidable): Collision | null;
}

export const isIntersecting = (targetA: Collidable, targetB: Collidable): boolean => {

    if (targetA instanceof SceneNode) {
        return isSceneNodeIntersecting(targetA, targetB);
    }

    if (targetA instanceof Rectangle) {
        return isRectangleIntersectingWithTarget(targetA, targetB);
    }

    if (targetA instanceof Polygon) {
        return isPolygonIntersectingWithTarget(targetA, targetB);
    }

    if (targetA instanceof Circle) {
        return isCircleIntersectingWithTarget(targetA, targetB);
    }

    return isIntersectingSAT(targetA, targetB);
};

export const isCircleIntersectingWithTarget = (circle: Circle, target: Collidable): boolean => {

    if (target instanceof SceneNode && target.rotation % 90 === 0) {
        return isIntersectingCircleRectangle(circle, target.getBounds());
    }

    if (target instanceof Rectangle) {
        return isIntersectingCircleRectangle(circle, target);
    }

    if (target instanceof Circle) {
        return isIntersectingCircleCircle(circle, target);
    }

    if (target instanceof Polygon) {
        return isIntersectingPolygonCircle(target, circle);
    }

    return false;
};

export const isRectangleIntersectingWithTarget = (rectangle: Rectangle, target: Collidable): boolean => {

    if (target instanceof SceneNode && target.rotation % 90 === 0) {
        return isIntersectingRectangleRectangle(rectangle, target.getBounds());
    }

    if (target instanceof Rectangle) {
        return isIntersectingRectangleRectangle(rectangle, target);
    }

    if (target instanceof Circle) {
        return isIntersectingCircleRectangle(target, rectangle);
    }

    return isIntersectingSAT(rectangle, target);
};

export const isPolygonIntersectingWithTarget = (polygon: Polygon, target: Collidable): boolean => {
    if (target instanceof Circle) {
        return isIntersectingPolygonCircle(polygon, target);
    }

    return isIntersectingSAT(polygon, target);
};

export const isSceneNodeIntersecting = (sceneNode: SceneNode, target: Collidable): boolean => {
    const isAlignedBox = sceneNode.rotation % 90 === 0;

    if (isAlignedBox && target instanceof SceneNode && target.rotation % 90 === 0) {
        return isIntersectingRectangleRectangle(sceneNode.getBounds(), target.getBounds());
    }

    if (isAlignedBox && target instanceof Rectangle) {
        return isIntersectingRectangleRectangle(sceneNode.getBounds(), target);
    }

    if (target instanceof Circle) {
        if (isAlignedBox) {
            return isIntersectingCircleRectangle(target, sceneNode.getBounds());
        }

        window.console.warn("Rotierte SceneNode + Circle wird noch nicht unterstützt.", sceneNode, target);
    }

    return isIntersectingSAT(sceneNode, target);
};

export const isIntersectingRectangleRectangle = (rectA: Rectangle, rectB: Rectangle): boolean => {

    if ((rectB.left > rectA.right) || (rectB.top > rectA.bottom)) {
        return false;
    }

    if ((rectA.left > rectB.right) || (rectA.top > rectB.bottom)) {
        return false;
    }

    return true;
};

export const isIntersectingCircleCircle = (circleA: Circle, circleB: Circle): boolean => (
    getDistance(circleA.x, circleA.y, circleB.x, circleB.y) <= (circleA.radius + circleB.radius)
);

export const isIntersectingCircleRectangle = (circle: Circle, rect: Rectangle): boolean => {
    const { x, y, radius } = circle;
    const centerWidth = rect.width / 2;
    const centerHeight = rect.height / 2;
    const distanceX = Math.abs(x - rect.x);
    const distanceY = Math.abs(y - rect.y);

    if ((distanceX > (centerWidth + radius)) || (distanceY > (centerHeight + radius))) {
        return false;
    }

    if ((distanceX <= centerWidth) || (distanceY <= centerHeight)) {
        return true;
    }

    return getDistance(x, y, rect.x - centerWidth, rect.y - centerHeight) <= radius;
};

export const isIntersectingPolygonCircle = (polygon: Polygon, circle: Circle): boolean => {
    const points = polygon.points;
    const x = (circle.x - polygon.x);
    const y = (circle.y - polygon.y);
    const positionA = new Vector();
    const positionB = new Vector();
    const edgeA = new Vector();
    const edgeB = new Vector();
    const len = points.length;

    for (let i = 0; i < len; i++) {
        const pointA = points[i];
        const pointB = points[(i + 1) % len];
        const region = getVoronoiRegion(
            edgeA.set(pointB.x - pointA.x, pointB.y - pointA.y),
            positionA.set(x - pointA.x, y - pointA.y)
        );

        if (region === VORONOI_REGION.LEFT) {
            const prev = points[(i === 0 ? len - 1 : i - 1)];

            edgeB.set(pointA.x - prev.x, pointA.y - prev.y);
            positionB.set(x - prev.x, y - prev.y);

            if ((getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.RIGHT) && (positionA.length > circle.radius)) {
                return false;
            }
        } else if (region === VORONOI_REGION.RIGHT) {
            const next = points[(i + 2) % len]; // pointB ?

            edgeB.set(next.x - pointB.x, next.y - pointB.y); // edgeB.set(pointB.x - pointA.x, pointB.y - pointA.y); ?
            positionB.set(x - pointB.x, y - pointB.y); // positionB.set(x - pointB.x, y - pointB.y); ?

            if (getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.LEFT && (positionB.length > circle.radius)) {
                return false;
            }
        } else {
            const normal = edgeA.rperp().normalize();
            const distance = positionA.dot(normal.x, normal.y);

            if (distance > 0 && (Math.abs(distance) > circle.radius)) {
                return false;
            }
        }
    }

    return true;
};

// todo - make this compatible with with Circle or create new intersecting method for transformed Rect + Circle
export const isIntersectingSAT = (shapeA: Collidable, shapeB: Collidable): boolean => {
    const normalsA = shapeA.getNormals();
    const normalsB = shapeB.getNormals();
    const projA = new Interval();
    const projB = new Interval();

    for (const normal of normalsA) {
        shapeA.project(normal, projA);
        shapeB.project(normal, projB);

        if (!projA.overlaps(projB)) {
            return false;
        }
    }

    for (const normal of normalsB) {
        shapeA.project(normal, projA);
        shapeB.project(normal, projB);

        if (!projA.overlaps(projB)) {
            return false;
        }
    }

    return true;
};

export const getCollisionRectangleRectangle = (rectA: Rectangle, rectB: Rectangle): Collision | null => {
    if ((rectB.left > rectA.right) || (rectB.top > rectA.bottom)) {
        return null;
    }

    if ((rectA.left > rectB.right) || (rectA.top > rectB.bottom)) {
        return null;
    }

    return {
        shapeA: rectA,
        shapeB: rectB,
        overlap: 0, // todo
        shapeAInB: rectB.containsRect(rectA),
        shapeBInA: rectA.containsRect(rectB),
        projectionN: new Vector(), // todo
        projectionV: new Vector(), // todo
    };
};

export const getCollisionCircleCircle = (circleA: Circle, circleB: Circle): Collision | null => {
    const difference = new Vector(circleB.x - circleA.x, circleB.y - circleA.y),
        distance = difference.length,
        overlap = (circleA.radius + circleB.radius) - distance;

    if (overlap < 0) {
        return null;
    }

    return {
        shapeA: circleA,
        shapeB: circleB,
        overlap: overlap,
        shapeAInB: (circleA.radius <= circleB.radius) && (distance <= (circleB.radius - circleA.radius)),
        shapeBInA: (circleB.radius <= circleA.radius) && (distance <= (circleA.radius - circleB.radius)),
        projectionN: difference.normalize(),
        projectionV: difference.multiply(overlap),
    };
};

export const getCollisionCircleRectangle = (circle: Circle, rect: Rectangle, swap: boolean = false): Collision | null => {
    const radius = circle.radius,
        centerWidth = rect.width / 2,
        centerHeight = rect.height / 2,
        distance = getDistance(circle.x, circle.y, rect.x - centerWidth, rect.y - centerHeight),
        containsA = (radius <= Math.min(centerWidth, centerHeight)) && (distance <= (Math.min(centerWidth, centerHeight) - radius)),
        containsB = (Math.max(centerWidth, centerHeight) <= radius) && (distance <= (radius - Math.max(centerWidth, centerHeight)));

    if (distance > circle.radius) {
        return null;
    }

    return {
        shapeA: swap ? rect : circle,
        shapeB: swap ? circle : rect,
        overlap: radius - distance,
        shapeAInB: swap ? containsB : containsA,
        shapeBInA: swap ? containsA : containsB,
        projectionN: new Vector(), // todo
        projectionV: new Vector(), // todo
    };
};

export const getCollisionPolygonCircle = (polygon: Polygon, circle: Circle, swap: boolean = false): Collision | null => {
    const radius = circle.radius;
    const points = polygon.points;
    const x = (circle.x - polygon.x);
    const y = (circle.y - polygon.y);
    const projection = new Vector();
    const positionA = new Vector();
    const positionB = new Vector();
    const edgeA = new Vector();
    const edgeB = new Vector();
    const len = points.length;

    let containsA = true,
        containsB = true,
        overlap = 0;

    for (let i = 0; i < len; i++) {
        const pointA = points[i],
            pointB = points[(i + 1) % len],
            region = getVoronoiRegion(
                edgeA.set(pointB.x - pointA.x, pointB.y - pointA.y),
                positionA.set(x - pointA.x, y - pointA.y)
            );

        if (positionA.length > radius) {
            containsA = false;
        }

        if (region === VORONOI_REGION.LEFT) {
            const prev = points[(i === 0 ? len - 1 : i - 1)];

            edgeB.set(pointA.x - prev.x, pointA.y - prev.y);
            positionB.set(x - prev.x, y - prev.y);

            if ((getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.RIGHT)) {
                const distance = positionA.length;

                if (distance > radius) {
                    return null;
                }

                if (Math.abs(radius - distance) < Math.abs(overlap)) {
                    overlap = radius - distance;
                    projection.copy(positionA).normalize();
                }

                containsB = false;
            }
        } else if (region === VORONOI_REGION.RIGHT) {
            const next = points[(i + 2) % len]; // pointB ?

            edgeB.set(next.x - pointB.x, next.y - pointB.y); // edgeB.set(pointB.x - pointA.x, pointB.y - pointA.y); ?
            positionB.set(x - pointB.x, y - pointB.y); // positionB.set(x - pointB.x, y - pointB.y); ?

            if (getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.LEFT) {
                const distance = positionB.length;

                if (distance > radius) {
                    return null;
                }

                if (Math.abs(radius - distance) < Math.abs(overlap)) {
                    overlap = radius - distance;
                    projection.copy(positionB).normalize();
                }

                containsB = false;
            }
        } else {
            const normal = edgeA.rperp().normalize();
            const distance = positionA.dot(normal.x, normal.y);

            if (distance > 0 && (Math.abs(distance) > radius)) {
                return null;
            }

            if (distance >= 0 || (radius - distance) < (2 * radius)) {
                containsB = false;
            }

            if (Math.abs(radius - distance) < Math.abs(overlap)) {
                overlap = radius - distance;
                projection.copy(normal);
            }
        }
    }

    return {
        shapeA: swap ? circle : polygon,
        shapeB: swap ? polygon : circle,
        overlap: overlap,
        shapeAInB: swap ? containsB : containsA,
        shapeBInA: swap ? containsA : containsB,
        projectionN: projection,
        projectionV: projection.multiply(overlap),
    };
};

export const getCollisionSAT = (shapeA: Collidable, shapeB: Collidable): Collision | null => {
    const projection = new Vector(),
        normalsA = shapeA.getNormals(),
        normalsB = shapeB.getNormals(),
        projA = new Interval(),
        projB = new Interval();

    let overlap = Infinity,
        shapeAInB = true,
        shapeBInA = true,
        containsA,
        containsB,
        distance;

    for (const normal of normalsA) {
        shapeA.project(normal, projA);
        shapeB.project(normal, projB);

        if (!projA.overlaps(projB)) {
            return null;
        }

        distance = projA.getOverlap(projB);
        containsA = projB.contains(projA);
        containsB = projA.contains(projB);

        if (!containsA && shapeAInB) {
            shapeAInB = false;
        }

        if (!containsB && shapeBInA) {
            shapeBInA = false;
        }

        if (containsA || containsB) {
            distance += Math.min(
                Math.abs(projA.min - projB.min),
                Math.abs(projA.max - projB.max)
            );
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
            return null;
        }

        distance = projA.getOverlap(projB);
        containsA = projB.contains(projA);
        containsB = projA.contains(projB);

        if (!containsA && shapeAInB) {
            shapeAInB = false;
        }

        if (!containsB && shapeBInA) {
            shapeBInA = false;
        }

        if (containsA || containsB) {
            distance += Math.min(
                Math.abs(projA.min - projB.min),
                Math.abs(projA.max - projB.max)
            );
        }

        if (distance < overlap) {
            overlap = distance;
            projection.copy(normal);
        }
    }

    return {
        shapeA,
        shapeB,
        overlap,
        shapeAInB,
        shapeBInA,
        projectionN: projection,
        projectionV: projection.clone().multiply(overlap, overlap),
    };
};