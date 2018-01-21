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
        return this._points.map((point, i, points) => Vector.subtract(points[(i + 1) % points.length], point).perpLeft().normalize());
    }

    /**
     * @public
     * @param {Vector} axis
     * @param {Interval} [result=new Interval()]
     * @returns {Interval}
     */
    project(axis, result = new Interval()) {
        const normal = axis.clone().normalize(),
            projections = this._points.map((point) => normal.dot(point.x, point.y));

        return result.set(
            Math.min(...projections),
            Math.max(...projections),
        );
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @param {Matrix} [transform]
     * @returns {Boolean}
     */
    contains(x, y) {
        const points = this._points,
            len = points.length;

        let inside = false;

        for (let i = 0, j = len - 1; i < len; j = i++) {
            const { aX, aY } = points[i],
                { bX, bY } = points[j];

            if (((aY <= y && y < bY) || (bY <= y && y < aY)) && x < ((bX - aX) / (bY - aY) * (y - aY) + aX)) {
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
