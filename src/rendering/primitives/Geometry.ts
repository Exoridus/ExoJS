interface GeometryOptions {
    vertices?: Array<number>;
    indices?: Array<number>;
    points?: Array<number>;
}

export class Geometry {

    public readonly vertices: Float32Array;
    public readonly indices: Uint16Array;
    public readonly points: Array<number>;

    constructor({
        vertices = [],
        indices = [],
        points = [],
    }: GeometryOptions = {}) {
        this.vertices = new Float32Array(vertices);
        this.indices = new Uint16Array(indices);
        this.points = points;
    }

    destroy(): void {
        // todo - check if destroy is needed
    }
}
