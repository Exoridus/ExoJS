import Container from '../Container';
import Color from '../../core/Color';

/**
 * @class Drawing
 * @extends Container
 */
export default class Drawing extends Container {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @type {Number}
         */
        this._lineWidth = 0;

        /**
         * @private
         * @type {Color}
         */
        this._lineColor = Color.Black.clone();

        /**
         * @private
         * @type {Color}
         */
        this._fillColor = Color.Black.clone();
    }

    /**
     * @public
     * @member {Color}
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
     * @chainable
     * @returns {Drawing}
     */
    closePath() {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Drawing}
     */
    moveTo(x, y) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Drawing}
     */
    lineTo(x, y) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} cp1x
     * @param {Number} cp1y
     * @param {Number} cp2x
     * @param {Number} cp2y
     * @param {Number} x
     * @param {Number} y
     * @returns {Drawing}
     */
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} cpx
     * @param {Number} cpy
     * @param {Number} x
     * @param {Number} y
     * @returns {Drawing}
     */
    quadraticCurveTo(cpx, cpy, x, y) {


        return this;
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
     * @returns {Drawing}
     */
    arc(x, y, radius, startAngle, endAngle, anticlockwise = false) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x1
     * @param {Number} y1
     * @param {Number} x2
     * @param {Number} y2
     * @param {Number} radius
     * @returns {Drawing}
     */
    arcTo(x1, y1, x2, y2, radius) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @param {Number} radiusX
     * @param {Number} radiusY
     * @param {Number} rotation
     * @param {Number} startAngle
     * @param {Number} endAngle
     * @param {Boolean} [anticlockwise=false]
     * @returns {Drawing}
     */
    ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise = false) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @param {Number} width
     * @param {Number} height
     * @returns {Drawing}
     */
    rect(x, y, width, height) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Object|Rectangle} rect
     * @param {Number} rect.x
     * @param {Number} rect.y
     * @param {Number} rect.width
     * @param {Number} rect.height
     * @returns {Drawing}
     */
    drawRect({ x, y, width, height } = {}) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Object|Circle} circle
     * @param {Number} rect.x
     * @param {Number} rect.y
     * @param {Number} rect.radius
     * @returns {Drawing}
     */
    drawCirlce({ x, y, radius } = {}) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Object|Polygon} polygon
     * @param {Number} rect.x
     * @param {Number} rect.y
     * @param {Vector[]} rect.points
     * @returns {Drawing}
     */
    drawPolygon({ x, y, points } = {}) {


        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Object} style
     * @param {Number} [style.width]
     * @param {Color} [style.color]
     * @returns {Drawing}
     */
    setLineStyle({ width, color } = {}) {
        if (width !== undefined) {
            this.lineWidth = width;
        }

        if (color !== undefined) {
            this.lineColor = color;
        }

        return this;
    }

    /**
     * @override
     */
    render(renderManager) {
        if (this.visible && renderManager.insideViewport(this)) {
            const renderer = renderManager.getRenderer('primitive');

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

        this._lineColor.destroy();
        this._lineColor = null;

        this._fillColor.destroy();
        this._fillColor = null;

        this._lineWidth = null;
    }
}
