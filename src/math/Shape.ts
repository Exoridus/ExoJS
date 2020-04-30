import type { Collidable } from "types/Collision";
import type { Cloneable, Deletable, WithBoundingBox } from "types/types";

export interface Shape extends Collidable, Cloneable, Deletable, WithBoundingBox {

}
