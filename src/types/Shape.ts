import type { Collidable } from "types/Collision";
import type { Cloneable, Deletable, WithBoundingBox } from "types/types";

export interface Shape1D extends Collidable, Cloneable, Deletable {
    equals(compareTo: Partial<this>): boolean;
}

export interface Shape2D extends Shape1D, WithBoundingBox {}

export type Shape = Shape1D | Shape2D;