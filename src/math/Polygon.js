import Interval from './Interval';
import Vector from './Vector';
import Rectangle from './Rectangle';
import Collision from '../core/Collision';
import Circle from './Circle';

/**
 * @class Polygon
 */
export default class Polygon {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Vector[]} [points=[]]
     */
    constructor(x = 0, y = 0, points = []) {

        /**
         * @private
         * @member {Vector}
         */
        this._position = new Vector(x, y);

        /**
         * @private
         * @member {Vector[]}
         */
        this._points = points.map((point) => point.clone());
    }

    /**
     * @public
     * @member {Vector}
     */
    get position() {
        return this._position;
    }

    set position(position) {
        this._position.copy(position);
    }

    /**
     * @public
     * @member {Number}
     */
    get x() {
        return this._position.x;
    }

    set x(x) {
        this._position.x = x;
    }

    /**
     * @public
     * @member {Number}
     */
    get y() {
        return this._position.y;
    }

    set y(y) {
        this._position.y = y;
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
     * @param {Number} x
     * @param {Number} y
     * @returns {Polygon}
     */
    setPosition(x, y) {
        this._position.set(x, y);

        return this;
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
     * @param {Number} x
     * @param {Number} y
     * @param {Vector[]} points
     * @returns {Polygon}
     */
    set(x, y, points) {
        this._position.set(x, y);
        this.setPoints(points);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Polygon} polygon
     * @returns {Polygon}
     */
    copy(polygon) {
        this._position.copy(polygon.position);
        this.setPoints(polygon.points);

        return this;
    }

    /**
     * @public
     * @returns {Polygon}
     */
    clone() {
        return new Polygon(this.x, this.y, this.points);
    }

    /**
     * @public
     * @param {Polygon|Object} polygon
     * @param {Number} [polygon.x]
     * @param {Number} [polygon.y]
     * @param {Vector[]} [polygon.points]
     * @returns {Boolean}
     */
    equals({ x, y, points } = {}) {
        return (x === undefined || this.x === x)
            && (y === undefined || this.y === y)
            && (points === undefined || ((this.points.length === points.length)
                && (this.points.every((point, index) => point.equals(points[index])))
            ));
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getBounds() {
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;

        for (const point of this._points) {
            minX = Math.min(point.x, minX);
            minY = Math.min(point.y, minY);
            maxX = Math.max(point.x, maxX);
            maxY = Math.max(point.y, maxY);
        }

        return new Rectangle(
            this.x + minX,
            this.y + minY,
            maxX - minX,
            maxY - minY
        );
    }

    /**
     * todo - cache this
     *
     * @public
     * @returns {Vector[]}
     */
    getNormals() {
        const normals = [],
            len = this._points.length;

        for (let i = 0; i < len; i++) {
            const point = this._points[i],
                nextPoint = this._points[(i + 1) % len];

            normals.push(
                nextPoint.clone()
                .subtract(point.x, point.y)
                .perp()
                .normalize()
            );
        }

        return normals;
    }

    /**
     * @public
     * @param {Vector} axis
     * @param {Interval} [result=new Interval()]
     * @returns {Interval}
     */
    project(axis, result = new Interval()) {
        const len = this._points.length;

        let min = axis.dot(this._points[0]),
            max = min;

        for (let i = 1; i < len; i++) {
            const projection = axis.dot(this._points[i]);

            min = Math.min(min, projection);
            max = Math.max(max, projection);
        }

        return result.set(min, max);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @param {Matrix} [transform]
     * @returns {Boolean}
     */
    contains(x, y, transform) {
        const points = this._points,
            len = points.length;

        let inside = false;

        for (let i = 0, j = len - 1; i < len; j = i++) {
            const pointA = points[i],
                pointB = points[j];

            let { x: x1, y: y1 } = pointA,
                { x: x2, y: y2 } = pointB;

            if (transform) {
                x1 = (pointA.x * transform.a) + (pointA.y * transform.b) + transform.x;
                y1 = (pointA.x * transform.c) + (pointA.y * transform.d) + transform.y;
                x2 = (pointB.x * transform.a) + (pointB.y * transform.b) + transform.x;
                y2 = (pointB.x * transform.c) + (pointB.y * transform.d) + transform.y;
            }

            if (((y1 <= y && y < y2) || (y2 <= y && y < y1)) && x < ((x2 - x1) / (y2 - y1) * (y - y1) + x1)) {
                inside = !inside;
            };
        }

        return inside;
    }

    /**
     * @public
     * @param {Circle|Rectangle|Polygon} object
     * @returns {Boolean}
     */
    intersets(object) {
        if (object instanceof Polygon) {
            return Collision.intersectionSAT(this, object);
        }

        if (object instanceof Rectangle) {
            return Collision.intersectionSAT(this, object);
        }

        if (object instanceof Circle) {
            return Collision.intersectionPolyCircle(this, object);
        }

        return false;
    }

    /**
     * @public
     * @param {Circle|Rectangle|Polygon} object
     * @returns {?Collision}
     */
    getCollision(object) {
        if (object instanceof Polygon) {
            return Collision.collisionSAT(this, object);
        }

        if (object instanceof Rectangle) {
            return Collision.collisionSAT(this, object);
        }

        if (object instanceof Circle) {
            return Collision.collisionPolyCircle(this, object);
        }

        return null;
    }

    /**
     * @public
     */
    destroy() {

        for (const point of this._points) {
            point.destroy();
        }

        this._position.destroy();
        this._position = null;

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
