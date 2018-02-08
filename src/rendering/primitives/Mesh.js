import { DRAW_MODES } from '../../const/rendering';
import Color from '../../core/Color';
import Container from '../Container';

/**
 * @class Mesh
 * @extends Container
 */
export default class Mesh extends Container {

    /**
     * circulating neighbors of a vertex → v/e/f/h
     * - iterate out-halfedges CCW
     * - iterate in-halfedges CCW
     * - iterate neighboring faces CCW
     * - iterate neighboring vertices CCW
     *
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {MeshVertex[]}
         */
        this._vertices = [];

        /**
         * @private
         * @member {MeshFace[]}
         */
        this._faces = [];

        /**
         * @private
         * @member {MeshHalfEdge[]}
         */
        this._halfEdges = [];

        /**
         * @private
         * @member {Number[]}
         */
        this._indices = [];
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
