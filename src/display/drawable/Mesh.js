import Color from '../../types/Color';
import Container from './Container';

/**
 * @class Mesh
 * @extends Container
 */
export default class Mesh extends Container {

    /**
     * @constructor
     * @param {Geometry} geometry
     * @param {Color|Texture} material
     */
    constructor(geometry, material) {
        super();

        /**
         * @private
         * @member {Geometry}
         */
        this._geometry = geometry;

        /**
         * @private
         * @member {Color|Texture}
         */
        this._material = material;
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
     * @member {Color|Texture}
     */
    get material() {
        return this._material;
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

        this._material = null;
        this._geometry = null;
    }
}
