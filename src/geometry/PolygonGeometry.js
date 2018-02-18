import Geometry from './Geometry';
import earcut from 'earcut';

/**
 * @class PolygonGeometry
 * @extends Geometry
 */
export default class PolygonGeometry extends Geometry {

    /**
     * @constructor
     * @param {Number[]} points
     */
    constructor(points) {
        if (points.length < 6) {
            throw new Error('At least three X/Y pairs are required to build a polygon.');
        }

        const vertices = [],
            indices = [],
            index = vertices.length / 6,
            length = points.length / 2,
            triangles = earcut(points, null, 2);

        if (triangles) {
            for (let i = 0; i < triangles.length; i += 3) {
                indices.push(triangles[i] + index);
                indices.push(triangles[i] + index);
                indices.push(triangles[i + 1] + index);
                indices.push(triangles[i + 2] + index);
                indices.push(triangles[i + 2] + index);
            }

            for (let i = 0; i < length; i++) {
                vertices.push(points[i * 2], points[(i * 2) + 1]);
            }
        }

        super({ vertices, indices, points });
    }
}
