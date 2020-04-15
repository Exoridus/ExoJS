import { IRenderer } from '../IRenderer';
import { Shader } from '../shader/Shader';
import { defaultSpriteRendererBatchSize } from '../../const/defaults';
import { VertexArrayObject } from '../VertexArrayObject';
import { RenderBuffer } from '../RenderBuffer';
import { createQuadIndices } from '../../utils/rendering';
import { Texture } from '../texture/Texture';
import { BlendModes, BufferTypes, BufferUsage } from "../../const/rendering";
import { View } from '../View';
import { RenderManager } from '../RenderManager';
import { Sprite } from './Sprite';
import { RenderTexture } from '../texture/RenderTexture';
import vertexSource from "./glsl/sprite.vert";
import fragmentSource from "./glsl/sprite.frag";

export class SpriteRenderer implements IRenderer {

    private _batchSize: number = defaultSpriteRendererBatchSize;
    private _batchIndex = 0;

    /**
     * 4 x 4 Properties:
     * 2 = position (x, y) +
     * 1 = texCoord (packed uv) +
     * 1 = color    (ARGB int)
     */
    private _attributeCount = 16;
    private _vertexData: ArrayBuffer = new ArrayBuffer(this._batchSize * this._attributeCount * 4);
    private _float32View: Float32Array = new Float32Array(this._vertexData);
    private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
    private _indexData: Uint16Array = createQuadIndices(this._batchSize);
    private _shader: Shader = new Shader(vertexSource, fragmentSource);
    private _renderManager: RenderManager | null = null;
    private _context: WebGL2RenderingContext | null = null;
    private _currentTexture: Texture | RenderTexture | null = null;
    private _currentBlendMode: BlendModes | null = null;
    private _currentView: View | null = null;
    private _viewId = -1;
    private _vao: VertexArrayObject | null = null;
    private _indexBuffer: RenderBuffer | null = null;
    private _vertexBuffer: RenderBuffer | null = null;

    connect(renderManager: RenderManager) {
        if (!this._context) {
            const gl = renderManager.context;

            this._context = gl;
            this._renderManager = renderManager;

            this._shader.connect(gl);
            this._indexBuffer = new RenderBuffer(gl, BufferTypes.ELEMENT_ARRAY_BUFFER, this._indexData, BufferUsage.STATIC_DRAW);
            this._vertexBuffer = new RenderBuffer(gl, BufferTypes.ARRAY_BUFFER, this._vertexData, BufferUsage.DYNAMIC_DRAW);

            this._vao = new VertexArrayObject(gl)
                .addIndex(this._indexBuffer)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, this._attributeCount, 0)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_texcoord'), gl.UNSIGNED_SHORT, true, this._attributeCount, 8)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, this._attributeCount, 12);
        }

        return this;
    }

    disconnect() {
        if (this._context) {
            this.unbind();

            this._shader.disconnect();

            this._vao!.destroy();
            this._vao = null;

            this._renderManager = null;
            this._context = null;
        }

        return this;
    }

    bind() {
        if (!this._renderManager) {
            throw new Error('Renderer has to be connected first!')
        }

        this._renderManager.setVAO(this._vao);
        this._renderManager.setShader(this._shader);

        return this;
    }

    unbind() {
        if (this._renderManager) {
            this.flush();

            this._renderManager.setShader(null);
            this._renderManager.setVAO(null);

            this._currentTexture = null;
            this._currentBlendMode = null;
            this._currentView = null;
            this._viewId = -1;
        }

        return this;
    }

    render(sprite: Sprite) {
        const { texture, blendMode, tint, vertices, texCoords } = sprite,
            batchFull = (this._batchIndex >= this._batchSize),
            textureChanged = (texture !== this._currentTexture),
            blendModeChanged = (blendMode !== this._currentBlendMode),
            flush = (batchFull || textureChanged || blendModeChanged),
            index = flush ? 0 : (this._batchIndex * this._attributeCount),
            float32View = this._float32View,
            uint32View = this._uint32View;

        if (flush) {
            this.flush();

            if (textureChanged) {
                this._currentTexture = texture;
                this._renderManager!.setTexture(texture);
            }

            if (blendModeChanged) {
                this._currentBlendMode = blendMode;
                this._renderManager!.setBlendMode(blendMode);
            }
        }

        if (texture) {
            texture.update();
        }

        // X / Y
        float32View[index + 0] = vertices[0];
        float32View[index + 1] = vertices[1];

        // X / Y
        float32View[index + 4] = vertices[2];
        float32View[index + 5] = vertices[3];

        // X / Y
        float32View[index + 8] = vertices[4];
        float32View[index + 9] = vertices[5];

        // X / Y
        float32View[index + 12] = vertices[6];
        float32View[index + 13] = vertices[7];

        // U / V
        uint32View[index + 2] = texCoords[0];
        uint32View[index + 6] = texCoords[1];

        // U / V
        uint32View[index + 10] = texCoords[2];
        uint32View[index + 14] = texCoords[3];

        // Tint
        uint32View[index + 3]
            = uint32View[index + 7]
            = uint32View[index + 11]
            = uint32View[index + 15]
            = tint.toRGBA();

        this._batchIndex++;

        return this;
    }

    flush() {
        if (this._batchIndex > 0) {
            const view = this._renderManager!.view;

            if (this._currentView !== view || this._viewId !== view.updateId) {
                this._currentView = view;
                this._viewId = view.updateId;
                this._shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
            }

            this._renderManager!.setVAO(this._vao);
            this._vertexBuffer!.upload(this._float32View.subarray(0, this._batchIndex * this._attributeCount));
            this._vao!.draw(this._batchIndex * 6, 0);
            this._batchIndex = 0;
        }

        return this;
    }

    destroy() {
        this.disconnect();

        this._shader.destroy();
        this._currentTexture = null;
        this._currentBlendMode = null;
        this._currentView = null;
        this._renderManager = null;
        this._context = null;
    }
}
