import Geometry from './Geometry';
import Vector from '../types/Vector';

/**
 * @class LineGeometry
 * @extends Geometry
 */
export default class LineGeometry extends Geometry {

    /**
     * @constructor
     * @param {Number} startX
     * @param {Number} startY
     * @param {Number} endX
     * @param {Number} endY
     * @param {Number} width
     */
    constructor(startX, startY, endX, endY, width) {
        const vertices = [],
            indices = [],
            points = [startX, startY, endX, endY],
            lineWidth = width / 2,
            index = vertices.length / 6,
            perpA = new Vector(startX - endX, startY - endY).perp().normalize().multiply(lineWidth),
            perpB = new Vector(endX - startX, endY - startY).perp().normalize().multiply(lineWidth);

        vertices.push(startX - perpA.x, startY - perpA.y);
        vertices.push(startX + perpA.x, startY + perpA.y);

        vertices.push(endX - perpB.x, endY - perpB.y);
        vertices.push(endX + perpB.x, endY + perpB.y);

        indices.push(index, index, index + 1, index + 2, index + 3, index + 3);

        super({ vertices, indices, points });
    }
}
