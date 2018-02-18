import Renderer from './Renderer';
import Shader from '../shader/Shader';
import settings from '../../settings';
import VertexArrayObject from '../VertexArrayObject';
import Buffer from '../Buffer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createQuadIndices } from '../../utils/rendering';
import Texture from '../Texture';

/**
 * @class ShapeRenderer
 * @extends Renderer
 */
export default class ShapeRenderer extends Renderer {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Shader}
         */
        this._shader = new Shader(
            readFileSync(join(__dirname, './glsl/shape.vert'), 'utf8'),
            readFileSync(join(__dirname, './glsl/shape.frag'), 'utf8')
        );

        /**
         * @private
         * @member {?RenderManager}
         */
        this._renderManager = null;

        /**
         * @private
         * @member {?WebGL2RenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?Texture}
         */
        this._currentTexture = null;

        /**
         * @private
         * @member {?Number}
         */
        this._currentBlendMode = null;

        /**
         * @private
         * @member {?View}
         */
        this._currentView = null;

        /**
         * @private
         * @member {Number}
         */
        this._viewId = -1;
    }

    /**
     * @override
     */
    connect(renderManager) {
        if (!this._context) {
            this._context = renderManager.context;
            this._renderManager = renderManager;
            this._shader.connect(this._context);
        }

        return this;
    }

    /**
     * @override
     */
    disconnect() {
        if (this._context) {
            this.unbind();

            this._shader.disconnect();
            this._renderManager = null;
            this._context = null;
        }

        return this;
    }

    /**
     * @override
     */
    bind() {
        if (!this._context) {
            throw new Error('Renderer has to be connected first!')
        }

        this._renderManager.setShader(this._shader);

        return this;
    }

    /**
     * @override
     */
    unbind() {
        if (this._context) {
            this.flush();

            this._renderManager.setShader(null);
            this._renderManager.setVAO(null);

            this._currentTexture = null;
            this._currentBlendMode = null;
            this._currentView = null;
        }

        return this;
    }

    /**
     * @override
     * @param {Shape} shape
     */
    render(shape) {
        const { geometry, blendMode } = shape;

        this._renderManager.setTexture(null);
        this._renderManager.setBlendMode(blendMode);
        this._renderManager.setVAO(geometry.vao);

        geometry.vao.draw(geometry.vao.vertices.length, 0);

        return this;
    }

    /**
     * @override
     */
    flush() {
        const view = this._renderManager.view;

        if (this._currentView !== view || this._viewId !== view.updateId) {
            this._currentView = view;
            this._viewId = view.updateId;
            this._shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this.disconnect();

        this._shader.destroy();
        this._shader = null;

        this._uint32View = null;
        this._float32View = null;
        this._viewId = null;
        this._batchSize = null;
        this._batchIndex = null;
        this._attributeCount = null;
        this._currentTexture = null;
        this._currentBlendMode = null;
        this._currentView = null;
        this._renderManager = null;
        this._context = null;
    }
}
