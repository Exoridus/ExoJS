import { Vector } from "math/Vector";

export class PolarVector {

    public radius: number;
    public phi: number;

    constructor(radius = 0, angle = 0) {
        this.radius = radius;
        this.phi = angle;
    }

    public toVector(): Vector {
        return new Vector(
            this.radius * Math.cos(this.phi),
            this.radius * Math.sin(this.phi),
        );
    }
}
