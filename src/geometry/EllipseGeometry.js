import Geometry from './Geometry';

/**
 * @class EllipseGeometry
 * @extends Geometry
 */
export default class EllipseGeometry extends Geometry {

    /**
     * @constructor
     * @param {Number} centerX
     * @param {Number} centerY
     * @param {Number} radiusX
     * @param {Number} radiusY
     */
    constructor(centerX, centerY, radiusX, radiusY) {
        const length = Math.floor(15 * Math.sqrt(radiusX + radiusY)),
            segment = (Math.PI * 2) / length,
            vertices = [],
            indices = [],
            points = [];

        let index = vertices.length / 6;

        indices.push(index);

        for (let i = 0; i < length + 1; i++) {
            const segmentX = centerX + (Math.sin(segment * i) * radiusX),
                segmentY = centerY + (Math.cos(segment * i) * radiusY);

            points.push(segmentX, segmentY);

            vertices.push(centerX, centerY);
            vertices.push(segmentX, segmentY);

            indices.push(index++, index++);
        }

        indices.push(index - 1);

        super({ vertices, indices, points });
    }
}
