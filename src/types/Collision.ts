import type { Vector } from "math/Vector";
import type { Interval } from "math/Interval";

export const enum CollisionType {
    Point = 0,
    Line = 1,
    Rectangle = 2,
    Circle = 3,
    Ellipse = 4,
    Polygon = 5,
    SceneNode = 6,
}

export interface Collidable {
    readonly collisionType: CollisionType;
    intersectsWith(target: Collidable): boolean;
    collidesWith(target: Collidable): Collision | null;
    contains(x: number, y: number): boolean;
    getNormals(): Array<Vector>;
    project(axis: Vector, interval?: Interval): Interval;
}

export interface Collision {
    readonly shapeA: Collidable;
    readonly shapeB: Collidable;
    readonly overlap: number;
    readonly shapeAInB: boolean;
    readonly shapeBInA: boolean;
    readonly projectionN: Vector;
    readonly projectionV: Vector;
}