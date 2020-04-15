import { Vector } from '../math/Vector';
import { Collidable } from "../const/collision";

export interface IShape extends Collidable {
    position: Vector;
    x: number;
    y: number;
    setPosition(x: number, y: number): this;
}