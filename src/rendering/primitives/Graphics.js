import Color from '../../core/Color';
import Container from '../Container';
import { bezierCurveTo, quadraticCurveTo } from '../../utils/math';
import { TAU } from '../../const/math';
import Polygon from '../../math/Polygon';
import { DRAW_MODES } from '../../const/rendering';
import { buildCircle, buildEllipse, buildLine, buildPath, buildPolygon, buildRectangle, buildStar } from '../../utils/geometry';
import Shape from './Shape';
import Vector from '../../math/Vector';
import CircleGeometry from './CircleGeometry';

/**
 * @class Graphics
 * @extends Container
 */
export default class Graphics extends Container {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Number}
         */
        this._lineWidth = 0;

        /**
         * @private
         * @member {Color}
         */
        this._lineColor = new Color();

        /**
         * @private
         * @member {Color}
         */
        this._fillColor = new Color();

        /**
         * @private
         * @member {Vector}
         */
        this._currentPoint = new Vector(0, 0);
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
    lineTo(toX, toY) {
        const { x: fromX, y: fromY } = this._currentPoint;

        this.drawPath([fromX, fromY, toX, toY]);
        this.moveTo(toX, toY);

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
        const { x: fromX, y: fromY } = this._currentPoint;

        this.drawPath(quadraticCurveTo(fromX, fromY, cpX, cpY, toX, toY));
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
        const { x: fromX, y: fromY } = this._currentPoint;

        this.drawPath(bezierCurveTo(fromX, fromY, cpX1, cpY1, cpX2, cpY2, toX, toY));
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
        this.addChild(new Shape(buildLine(startX, startY, endX, endY, this._lineWidth), this._lineColor, DRAW_MODES.TRIANGLE_STRIP));

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number[]} path
     * @returns {Graphics}
     */
    drawPath(path) {
        this.addChild(new Shape(buildPath(path, this._lineWidth), this._lineColor, DRAW_MODES.TRIANGLE_STRIP));

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number[]} points
     * @returns {Graphics}
     */
    drawPolygon(path) {
        const polygon = buildPolygon(path);

        this.addChild(new Shape(polygon, this._fillColor, DRAW_MODES.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(polygon.points);
        }

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
        const circle = new CircleGeometry(centerX, centerY, radius);

        this.addChild(new Shape(circle, this._fillColor, DRAW_MODES.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(circle.points);
        }

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
        const ellipse = buildEllipse(centerX, centerY, radiusX, radiusY);

        this.addChild(new Shape(ellipse, this._fillColor, DRAW_MODES.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(ellipse.points);
        }

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
        const rectangle = buildRectangle(x, y, width, height);

        this.addChild(new Shape(rectangle, this._fillColor, DRAW_MODES.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(rectangle.points);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} centerX
     * @param {Number} centerY
     * @param {Number} points
     * @param {Number} radius
     * @param {Number} [innerRadius=radius/2]
     * @param {Number} [rotation=0]
     * @return {Graphics}
     */
    drawStar(centerX, centerY, points, radius, innerRadius = radius / 2, rotation = 0) {
        const star = buildStar(centerX, centerY, points, radius, innerRadius, rotation);

        this.addChild(new Shape(star, this._fillColor, DRAW_MODES.TRIANGLE_STRIP));

        if (this._lineWidth > 0) {
            this.drawPath(star.points);
        }

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

        this.clear();

        this._lineColor.destroy();
        this._lineColor = null;

        this._fillColor.destroy();
        this._fillColor = null;

        this._currentPoint.destroy();
        this._currentPoint = null;

        this._lineWidth = null;
    }
}
