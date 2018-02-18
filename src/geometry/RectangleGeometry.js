import Geometry from './Geometry';

/**
 * @class CircleGeometry
 * @extends Geometry
 */
export default class CircleGeometry extends Geometry {

    /**
     * @constructor
     * @param {Number} x
     * @param {Number} y
     * @param {Number} width
     * @param {Number} height
     */
    constructor(x, y, width, height) {
        const vertices = [],
            indices = [],
            points = [x, y, x + width, y, x, y + height, x + width, y + height],
            index = vertices.length / 6;

        vertices.push(...points);
        indices.push(index, index, index + 1, index + 2, index + 3, index + 3);

        super({ vertices, indices, points });
    }
}
