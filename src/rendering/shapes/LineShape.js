import Color from '../../core/Color';
import Polygon from '../../math/Polygon';
import GraphicsShape from './GraphicsShape';
import Rectangle from '../../math/Rectangle';
import Segment from '../../math/Segment';
import Vector from '../../math/Vector';
import Drawable from '../Drawable';
import { buildLine } from '../../utils/rendering';

/**
 * @class LineShape
 * @extends Drawable
 */
export default class LineShape extends Drawable {

    /**
     * @constructor
     * @param {Number[]} points
     * @param {Number} width
     * @param {Color} [color=Color.Black]
     */
    constructor(points, width, color = Color.Black) {
        super();

        /**
         * @member {Number}
         */
        this._attributeCount = 2;

        /**
         * @member {Float32Array}
         */
        this._vertexData = this.getVertices(points, width);

        /**
         * @private
         * @member {Uint16Array}
         */
        this._indexData = this.getIndices(this._vertexData);

        /**
         * @private
         * @member {Color}
         */
        this._color = color.clone();
    }

    /**
     * @public
     * @param {Number[]} points
     * @param {Number} width
     * @returns {Float32Array}
     */
    getVertices(points, width) {
        if (points.length < 4) {
            throw new Error('Line needs at least 4 values (start X/Y and end X/Y)')
        }

        const vertices = [],
            lineWidth = width / 2;

        let len = points.length;

        if ((points[0] === points[len - 2]) && (points[1] === points[len - 1])) {
            points = points.slice();

            points[len - 2] = points[len - 4] + ((points[0] - points[len - 4]) * 0.5);
            points[len - 1] = points[len - 3] + ((points[1] - points[len - 3]) * 0.5);

            points.unshift(points[len - 2], points[len - 1]);

            len = points.length;
        }

        let perpX = -(points[1] - points[3]);
        let perpY = points[0] - points[2];
        let perp2x;
        let perp2y;

        let dist = Math.sqrt((perpX * perpX) + (perpY * perpY));

        perpX = (perpX / dist) * lineWidth;
        perpY = (perpY / dist) * lineWidth;

        vertices.push(points[0] - perpX, points[1] - perpY);
        vertices.push(points[0] + perpX, points[1] + perpY);

        for (let i = 2; i < len - 2; i += 2) {
            const p1x = points[i - 2],
                p1y = points[i - 1],
                p2x = points[i + 0],
                p2y = points[i + 1],
                p3x = points[i + 2],
                p3y = points[i + 3];

            perpX = -(p1y - p2y);
            perpY = (p1x - p2x);

            dist = Math.sqrt((perpX * perpX) + (perpY * perpY));

            perpX = (perpX / dist) * lineWidth;
            perpY = (perpY / dist) * lineWidth;

            perp2x = -(p2y - p3y);
            perp2y = (p2x - p3x);

            dist = Math.sqrt((perp2x * perp2x) + (perp2y * perp2y));

            perp2x = (perp2x / dist) * lineWidth;
            perp2y = (perp2y / dist) * lineWidth;

            const [a1, a2, b1, b2, c1, c2] = [
                (-perpY + p1y) - (-perpY + p2y),
                (-perp2y + p3y) - (-perp2y + p2y),
                (-perpX + p2x) - (-perpX + p1x),
                (-perp2x + p2x) - (-perp2x + p3x),
                ((-perpX + p1x) * (-perpY + p2y)) - ((-perpX + p2x) * (-perpY + p1y)),
                ((-perp2x + p3x) * (-perp2y + p2y)) - ((-perp2x + p2x) * (-perp2y + p3y)),
            ];

            let denom = ((a1 * b2) - (a2 * b1));

            if (Math.abs(denom) < 0.1) {
                denom += 10.1;

                vertices.push(p2x - perpX, p2y - perpY);
                vertices.push(p2x + perpX, p2y + perpY);

                continue;
            }

            const px = ((b1 * c2) - (b2 * c1)) / denom,
                py = ((a2 * c1) - (a1 * c2)) / denom,
                pdist = ((px - p2x) * (px - p2x)) + ((py - p2y) * (py - p2y));

            if (pdist > (196 * lineWidth * lineWidth)) {
                let perp3x = perpX - perp2x,
                    perp3y = perpY - perp2y;

                dist = Math.sqrt((perp3x * perp3x) + (perp3y * perp3y));

                perp3x = (perp3x / dist) * lineWidth;
                perp3y = (perp3y / dist) * lineWidth;

                vertices.push(p2x - perp3x, p2y - perp3y);
                vertices.push(p2x + perp3x, p2y + perp3y);
                vertices.push(p2x - perp3x, p2y - perp3y);

                continue;
            }

            vertices.push(px, py);
            vertices.push(p2x - (px - p2x), p2y - (py - p2y));
        }

        perpX = -(points[len - 3] - points[len - 1]);
        perpY = points[len - 4] - points[len - 2];

        dist = Math.sqrt((perpX * perpX) + (perpY * perpY));

        perpX = (perpX / dist) * lineWidth;
        perpY = (perpY / dist) * lineWidth;

        vertices.push(points[len - 2] - perpX, points[len - 1] - perpY);
        vertices.push(points[len - 2] + perpX, points[len - 1] + perpY);

        return new Float32Array(vertices);
    }

    getIndices() {
        const len = this._vertexData.length / this._attributeCount,
            indices = [];

        indices.push(0);

        for (let i = 0; i < len; i++) {
            indices.push(i);
        }

        indices.push(indices[len]);

        return new Uint16Array(indices);
    }

    /**
     * @override
     */
    render(renderManager) {
        if (this.visible && this.inView(renderManager.view)) {
            const renderer = renderManager.getRenderer('shape');

            renderManager.setRenderer(renderer);
            renderer.render(this);
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this.clear();

        this._fillColor.destroy();
        this._fillColor = null;

        this._lineColor.destroy();
        this._lineColor = null;

        this._graphicsData = null;
        this._lineWidth = null;
        this._fill = null;
        this._dirty = null;
    }
}
