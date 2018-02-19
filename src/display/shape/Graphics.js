import Color from '../../types/Color';
import Drawable from '../Drawable';
import { bezierCurveTo, quadraticCurveTo } from '../../utils/math';
import Shape from './Shape';
import Vector from '../../types/Vector';
import CircleGeometry from '../../geometry/CircleGeometry';
import LineGeometry from '../../geometry/LineGeometry';
import PolylineGeometry from '../../geometry/PolylineGeometry';
import PolygonGeometry from '../../geometry/PolygonGeometry';
import EllipseGeometry from '../../geometry/EllipseGeometry';
import RectangleGeometry from '../../geometry/RectangleGeometry';

/**
 * @class Graphics
 * @extends Drawable
 */
export default class Graphics extends Drawable {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Number} [options.lineWidth=0]
     * @param {Color} [options.lineColor=Color.Black]
     * @param {Color} [options.fillColor=Color.Black]
     */
    constructor({
        lineWidth = 0,
        lineColor = Color.Black,
        fillColor = Color.Black,
    } = {}) {
        super();

        /**
         * @private
         * @member {Number}
         */
        this._lineWidth = lineWidth;

        /**
         * @private
         * @member {Color}
         */
        this._lineColor = lineColor.clone();

        /**
         * @private
         * @member {Color}
         */
        this._fillColor = fillColor.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._currentPoint = new Vector();
    }

    /**
     * @public
     * @member {Number}
     */
    get lineWidth() {
        return this._lineWidth;
    }

    set lineWidth(lineWidth) {
        this._lineWidth = lineWidth;
    }

    /**
     * @public
     * @member {Color}
     */
    get lineColor() {
        return this._lineColor;
    }

    set lineColor(lineColor) {
        this._lineColor.copy(lineColor);
    }

    /**
     * @public
     * @member {Color}
     */
    get fillColor() {
        return this._fillColor;
    }

    set fillColor(fillColor) {
        this._fillColor.copy(fillColor);
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
     */
    get currentPoint() {
        return this._currentPoint;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Graphics}
     */
    moveTo(x, y) {
        this._currentPoint.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} toX
     * @param {Number} toY
     * @returns {Graphics}
     */
    lineTo(x, y) {
        this.drawLine(this._currentPoint.x, this._currentPoint.y, x, y);
        this.moveTo(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} cpX
     * @param {Number} cpY
     * @param {Number} toX
     * @param {Number} toY
     * @returns {Graphics}
     */
    quadraticCurveTo(cpX, cpY, toX, toY) {
        this.drawPath(quadraticCurveTo(this._currentPoint.x, this._currentPoint.y, cpX, cpY, toX, toY));
        this.moveTo(toX, toY);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} cpX1
     * @param {Number} cpY1
     * @param {Number} cpX2
     * @param {Number} cpY2
     * @param {Number} toX
     * @param {Number} toY
     * @returns {Graphics}
     */
    bezierCurveTo(cpX1, cpY1, cpX2, cpY2, toX, toY) {
        this.drawPath(bezierCurveTo(this._currentPoint.x, this._currentPoint.y, cpX1, cpY1, cpX2, cpY2, toX, toY));
        this.moveTo(toX, toY);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} radius
     * @returns {Graphics}
     */
    arcTo(x1, y1, x2, y2, radius) {
        return this; // todo
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @param {Number} radius
     * @param {Number} startAngle
     * @param {Number} endAngle
     * @param {Boolean} [anticlockwise=false]
     * @returns {Graphics}
     */
    drawArc(x, y, radius, startAngle, endAngle, anticlockwise = false) {
        return this; // todo
    }

    /**
     * @public
     * @chainable
     * @param {Number} startX
     * @param {Number} startY
     * @param {Number} endX
     * @param {Number} endY
     * @returns {Graphics}
     */
    drawLine(startX, startY, endX, endY) {
        const shape = new Shape(new LineGeometry(startX, startY, endX, endY, this._lineWidth), this._lineColor);

        this.addChild(shape);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number[]} path
     * @returns {Graphics}
     */
    drawPath(path) {
        const shape = new Shape(new PolylineGeometry(path, this._lineWidth), this._lineColor);

        this.addChild(shape);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number[]} points
     * @returns {Graphics}
     */
    drawPolygon(path) {
        const shape = new Shape(new PolygonGeometry(path), this._fillColor);

        this.addChild(shape);

        // if (this._lineWidth > 0) {
        //     this.drawPath(shape.points);
        // }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} centerX
     * @param {Number} centerY
     * @param {Number} radius
     * @returns {Graphics}
     */
    drawCircle(centerX, centerY, radius) {
        const shape = new Shape(new CircleGeometry(centerX, centerY, radius), this._fillColor);

        this.addChild(shape);

        // if (this._lineWidth > 0) {
        //     this.drawPath(shape.points);
        // }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} centerX
     * @param {Number} centerY
     * @param {Number} radiusX
     * @param {Number} radiusY
     * @returns {Graphics}
     */
    drawEllipse(centerX, centerY, radiusX, radiusY) {
        const shape = new Shape(new EllipseGeometry(centerX, centerY, radiusX, radiusY), this._fillColor);

        this.addChild(shape);

        // if (this._lineWidth > 0) {
        //     this.drawPath(shape.points);
        // }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @param {Number} width
     * @param {Number} height
     * @returns {Graphics}
     */
    drawRectangle(x, y, width, height) {
        const shape = new Shape(new RectangleGeometry(x, y, width, height), this._fillColor);

        this.addChild(shape);

        // if (this._lineWidth > 0) {
        //     this.drawPath(shape.points);
        // }

        return this;
    }

    /**
     * @public
     * @chainable
     * @return {Graphics}
     */
    clear() {
        this.removeChildren();

        this._lineWidth = 0;
        this._lineColor.copy(Color.Black);
        this._fillColor.copy(Color.Black);
        this._currentPoint.set(0, 0);

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._lineColor.destroy();
        this._lineColor = null;

        this._fillColor.destroy();
        this._fillColor = null;

        this._currentPoint.destroy();
        this._currentPoint = null;

        this._lineWidth = null;
    }
}
