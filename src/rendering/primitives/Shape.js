import { DRAW_MODES } from '../../const/rendering';
import Color from '../../core/Color';
import Container from '../Container';

/**
 * @class Shape
 * @extends Container
 */
export default class Shape extends Container {

    /**
     * @constructor
     * @param {Geometry} geometry
     * @param {Color} color
     * @param {Number} [drawMode=DRAW_MODES.TRIANGLES]
     */
    constructor(geometry, color, drawMode = DRAW_MODES.TRIANGLES) {
        super();

        /**
         * @private
         * @member {Geometry}
         */
        this._geometry = geometry;

        /**
         * @private
         * @member {Color}
         */
        this._color = color.clone();

        /**
         * @private
         * @member {Number}
         */
        this._drawMode = drawMode;
    }

    /**
     * @public
     * @readonly
     * @member {Geometry}
     */
    get geometry() {
        return this._geometry;
    }

    /**
     * @public
     * @readonly
     * @member {Color}
     */
    get color() {
        return this._color;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get drawMode() {
        return this._drawMode;
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

        this._color.destroy();
        this._color = null;

        this._geometry = null;
        this._drawMode = null;
    }
}
