import type { Vector } from 'math/Vector';
import type { Interval } from 'math/Interval';

export const enum CollisionType {
    Point,
    Line,
    Rectangle,
    Circle,
    Ellipse,
    Polygon,
    SceneNode,
}

export interface Collidable {
    readonly collisionType: CollisionType;
    intersectsWith(target: Collidable): boolean;
    collidesWith(target: Collidable): CollisionResponse | null;
    contains(x: number, y: number): boolean;
    getNormals(): Array<Vector>;
    project(axis: Vector, interval?: Interval): Interval;
}

export interface CollisionResponse {
    readonly shapeA: Collidable;
    readonly shapeB: Collidable;
    readonly overlap: number;
    readonly shapeAinB: boolean;
    readonly shapeBinA: boolean;
    readonly projectionN: Vector;
    readonly projectionV: Vector;
}