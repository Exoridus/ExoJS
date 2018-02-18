import Color from '../../types/Color';
import Container from './Container';

/**
 * @class Shape
 * @extends Container
 */
export default class Shape extends Container {

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

        // this._vao = new VertexArrayObject(gl)
        //     .addIndex(this._indexBuffer)
        //     .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, this._attributeCount, 0)
        //     .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_texcoord'), gl.UNSIGNED_SHORT, true, this._attributeCount, 8)
        //     .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, this._attributeCount, 12);
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
