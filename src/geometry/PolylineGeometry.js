import Geometry from './Geometry';
import Vector from '../types/Vector';

/**
 * @class PolylineGeometry
 * @extends Geometry
 */
export default class PolylineGeometry extends Geometry {

    /**
     * @constructor
     * @param {Number[]} points
     * @param {Number} width
     */
    constructor(points, width) {
        if (points.length < 4) {
            throw new Error('At least two X/Y pairs are required to build a line.');
        }

        const vertices = [],
            indices = [],
            lineWidth = width / 2,
            firstPoint = new Vector(points[0], points[1]),
            lastPoint = new Vector(points[points.length - 2], points[points.length - 1]);

        if (firstPoint.x === lastPoint.x && firstPoint.y === lastPoint.y) {
            points = points.slice();

            points.pop();
            points.pop();

            lastPoint.set(points[points.length - 2], points[points.length - 1]);

            const midPointX = lastPoint.x + ((firstPoint.x - lastPoint.x) * 0.5);
            const midPointY = lastPoint.y + ((firstPoint.y - lastPoint.y) * 0.5);

            points.unshift(midPointX, midPointY);
            points.push(midPointX, midPointY);
        }

        const length = points.length / 2;

        let indexCount = points.length;
        let indexStart = vertices.length / 6;

        let p1x = points[0];
        let p1y = points[1];
        let p2x = points[2];
        let p2y = points[3];
        let p3x = 0;
        let p3y = 0;

        let perpx = -(p1y - p2y);
        let perpy = p1x - p2x;
        let perp2x = 0;
        let perp2y = 0;
        let perp3x = 0;
        let perp3y = 0;

        let dist = Math.sqrt((perpx * perpx) + (perpy * perpy));

        perpx /= dist;
        perpy /= dist;
        perpx *= lineWidth;
        perpy *= lineWidth;

        vertices.push(p1x - perpx, p1y - perpy);
        vertices.push(p1x + perpx, p1y + perpy);

        for (let i = 1; i < length - 1; i++) {
            p1x = points[(i - 1) * 2];
            p1y = points[((i - 1) * 2) + 1];

            p2x = points[i * 2];
            p2y = points[(i * 2) + 1];

            p3x = points[(i + 1) * 2];
            p3y = points[((i + 1) * 2) + 1];

            perpx = -(p1y - p2y);
            perpy = p1x - p2x;

            dist = Math.sqrt((perpx * perpx) + (perpy * perpy));

            perpx /= dist;
            perpy /= dist;
            perpx *= lineWidth;
            perpy *= lineWidth;

            perp2x = -(p2y - p3y);
            perp2y = p2x - p3x;

            dist = Math.sqrt((perp2x * perp2x) + (perp2y * perp2y));

            perp2x /= dist;
            perp2y /= dist;
            perp2x *= lineWidth;
            perp2y *= lineWidth;

            const a1 = (-perpy + p1y) - (-perpy + p2y);
            const b1 = (-perpx + p2x) - (-perpx + p1x);
            const c1 = ((-perpx + p1x) * (-perpy + p2y)) - ((-perpx + p2x) * (-perpy + p1y));
            const a2 = (-perp2y + p3y) - (-perp2y + p2y);
            const b2 = (-perp2x + p2x) - (-perp2x + p3x);
            const c2 = ((-perp2x + p3x) * (-perp2y + p2y)) - ((-perp2x + p2x) * (-perp2y + p3y));

            let denom = (a1 * b2) - (a2 * b1);

            if (Math.abs(denom) < 0.1) {
                denom += 10.1;

                vertices.push(p2x - perpx, p2y - perpy);
                vertices.push(p2x + perpx, p2y + perpy);

                continue;
            }

            const px = ((b1 * c2) - (b2 * c1)) / denom;
            const py = ((a2 * c1) - (a1 * c2)) / denom;
            const pdist = ((px - p2x) * (px - p2x)) + ((py - p2y) * (py - p2y));

            if (pdist > (196 * lineWidth * lineWidth)) {
                perp3x = perpx - perp2x;
                perp3y = perpy - perp2y;

                dist = Math.sqrt((perp3x * perp3x) + (perp3y * perp3y));

                perp3x /= dist;
                perp3y /= dist;
                perp3x *= lineWidth;
                perp3y *= lineWidth;

                vertices.push(p2x - perp3x, p2y - perp3y);
                vertices.push(p2x + perp3x, p2y + perp3y);
                vertices.push(p2x - perp3x, p2y - perp3y);

                indexCount++;
            } else {
                vertices.push(px, py);
                vertices.push(p2x - (px - p2x), p2y - (py - p2y));
            }
        }

        p1x = points[(length - 2) * 2];
        p1y = points[((length - 2) * 2) + 1];

        p2x = points[(length - 1) * 2];
        p2y = points[((length - 1) * 2) + 1];

        perpx = -(p1y - p2y);
        perpy = p1x - p2x;

        dist = Math.sqrt((perpx * perpx) + (perpy * perpy));

        perpx /= dist;
        perpy /= dist;
        perpx *= lineWidth;
        perpy *= lineWidth;

        vertices.push(p2x - perpx, p2y - perpy);
        vertices.push(p2x + perpx, p2y + perpy);

        indices.push(indexStart);

        for (let i = 0; i < indexCount; i++) {
            indices.push(indexStart++);
        }

        indices.push(indexStart - 1);

        super({ vertices, indices, points });
    }
}
