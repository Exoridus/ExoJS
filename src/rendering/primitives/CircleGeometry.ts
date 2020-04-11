import Geometry from './Geometry';

export default class CircleGeometry extends Geometry {

    constructor(centerX: number, centerY: number, radius: number) {
        const length = Math.floor(15 * Math.sqrt(radius + radius)),
            segment = (Math.PI * 2) / length,
            vertices = [],
            indices = [],
            points = [];

        let index = vertices.length / 6;

        indices.push(index);

        for (let i = 0; i < length + 1; i++) {
            const segmentX = centerX + (Math.sin(segment * i) * radius),
                segmentY = centerY + (Math.cos(segment * i) * radius);

            points.push(segmentX, segmentY);

            vertices.push(centerX, centerY);
            vertices.push(segmentX, segmentY);

            indices.push(index++, index++);
        }

        indices.push(index - 1);

        super({ vertices, indices, points });
    }
}
