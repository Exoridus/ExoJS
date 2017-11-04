import { SHAPE } from '../const';
import Shape from './Shape';
import Collision from './Collision';
import Bounds from '../core/Bounds';
import Interval from './Interval';
import Vector from './Vector';

/**
 * @class Polygon
 * @extends Shape
 */
export default class Polygon extends Shape {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Vector[]} [points=[]]
     */
    constructor(x = 0, y = 0, points = []) {
        super(x, y);

        /**
         * @private
         * @member {Vector[]}
         */
        this._points = points.map((point) => point.clone());
    }

    /**
     * @override
     */
    get type() {
        return SHAPE.POLYGON;
    }

    /**
     * @public
     * @member {Vector[]}
     */
    get points() {
        return this._points;
    }

    set points(points) {
        this.setPoints(points);
    }

    /**
     * @public
     * @chainable
     * @param {Vector[]} newPoints
     * @returns {Polygon}
     */
    setPoints(newPoints) {
        const points = this._points,
            len = points.length,
            diff = len - newPoints.length;

        for (let i = 0; i < len; i++) {
            points[i].copy(newPoints[i]);
        }

        if (diff > 0) {
            for (const point of points.splice(newPoints.length, diff)) {
                point.destroy();
            }
        } else if (diff < 0) {
            for (let i = len; i < newPoints.length; i++) {
                points.push(newPoints[i].clone());
            }
        }
    }

    /**
     * @public
     * @chainable
     * @param {Vector} axis
     * @param {Interval} [result=new Interval()]
     * @returns {Interval}
     */
    project(axis, result = new Interval()) {
        let min = Infinity,
            max = -Infinity;

        axis.normalize();

        for (const point of this._points) {
            const projection = axis.dot(point);

            min = Math.min(min, projection);
            max = Math.max(max, projection);
        }

        return result.set(min, max);
    }

    /**
     * @override
     */
    set(x, y, points) {
        this.position.set(x, y);
        this.setPoints(points);

        return this;
    }

    /**
     * @override
     */
    copy(polygon) {
        this.position.copy(polygon.position);
        this.setPoints(polygon.points);

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new Polygon(this.x, this.y, this.points);
    }

    /**
     * @override
     */
    equals(polygon) {
        return (polygon === this) || (this._points.length === polygon.points.length && this._points.every((point, index) => point.equals(polygon.points[index])));
    }

    /**
     * @override
     */
    getBounds() {
        if (!this._bounds) {
            this._bounds = new Bounds();
        } else {
            this._bounds.reset();
        }

        for (const point of this._points) {
            this._bounds.addCoords(point.x + this.x, point.y + this.y);
        }

        return this._bounds.getRect();
    }

    /**
     * @override
     */
    contains(x, y, transform) {
        const points = this._points,
            len = points.length,
            tempA = new Vector(),
            tempB = new Vector();

        let inside = false;

        for (let i = 0, j = len - 1; i < len; j = i++) {
            let pointA = points[i],
                pointB = points[j];

            if (transform) {
                pointA = pointA.transform(transform, tempA);
                pointB = pointB.transform(transform, tempB);
            }

            if (((pointA.y > y) !== (pointB.y > y)) && (x < ((pointB.x - pointA.x) * ((y - pointA.y) / (pointB.y - pointA.y))) + pointA.x)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        for (const point of this._points) {
            point.destroy();
        }

        this._points.length = 0;
        this._points = null;
    }
}

/**
 * @public
 * @static
 * @constant
 * @member {Polygon}
 */
Polygon.Empty = new Polygon(0, 0, []);

/**
 * @public
 * @static
 * @constant
 * @member {Polygon}
 */
Polygon.Temp = new Polygon();
