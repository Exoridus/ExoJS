import Color from '../../types/Color';
import Drawable from '../Drawable';

/**
 * @class Shape
 * @extends Drawable
 */
export default class Shape extends Drawable {

    /**
     * @constructor
     * @param {Geometry} geometry
     * @param {Color} color
     */
    constructor(geometry, color) {
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
        this._color = color;
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

        this._geometry = null;
        this._color = null;
    }
}
