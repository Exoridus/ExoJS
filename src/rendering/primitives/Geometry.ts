interface IGeometryOptions {
    vertices?: Array<number>;
    indices?: Array<number>;
    points?: Array<number>;
}

export class Geometry {

    public readonly vertices: Float32Array;
    public readonly indices: Uint16Array;
    public readonly points: Array<number>;

    public constructor({
        vertices = [],
        indices = [],
        points = [],
    }: IGeometryOptions = {}) {
        this.vertices = new Float32Array(vertices);
        this.indices = new Uint16Array(indices);
        this.points = points;
    }

    public destroy(): void {
        // todo - check if destroy is needed
    }
}
