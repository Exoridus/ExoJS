import type { Vector } from 'math/Vector';
import type { Interval } from 'math/Interval';

export const enum CollisionType {
    point,
    line,
    rectangle,
    circle,
    ellipse,
    polygon,
    sceneNode,
}

export interface ICollidable {
    readonly collisionType: CollisionType;
    intersectsWith(target: ICollidable): boolean;
    collidesWith(target: ICollidable): ICollisionResponse | null;
    contains(x: number, y: number): boolean;
    getNormals(): Array<Vector>;
    project(axis: Vector, interval?: Interval): Interval;
}

export interface ICollisionResponse {
    readonly shapeA: ICollidable;
    readonly shapeB: ICollidable;
    readonly overlap: number;
    readonly shapeAinB: boolean;
    readonly shapeBinA: boolean;
    readonly projectionN: Vector;
    readonly projectionV: Vector;
}