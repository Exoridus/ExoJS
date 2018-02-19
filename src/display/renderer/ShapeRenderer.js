import Renderer from './Renderer';
import Shader from '../shader/Shader';
import { readFileSync } from 'fs';
import { join } from 'path';

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
    }

    /**
     * @override
     */
    connect(renderManager) {
        if (!this._context) {
            const gl = renderManager.context;

            this._context = gl;
            this._renderManager = renderManager;
            this._shader.connect(gl);
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
            this._renderManager.setShader(null);
        }

        return this;
    }

    /**
     * @override
     */
    render(shape) {
        const { geometry } = shape,
            vao = geometry.getVAO(this._context, this._shader);

        this._renderManager.setVAO(vao);

        vao.draw(geometry.indices.length, 0)

        return this;
    }

    /**
     * @override
     */
    flush() {
        return this;
    }

    /**
     * @override
     */
    destroy() {
        this.disconnect();

        this._shader.destroy();
        this._shader = null;

        this._renderManager = null;
        this._context = null;
    }
}
