import { IRenderer } from '../rendering/IRenderer';
import { Shader } from '../rendering/shader/Shader';
import { createQuadIndices } from '../utils/rendering';
import { RenderBuffer } from '../rendering/RenderBuffer';
import { VertexArrayObject } from '../rendering/VertexArrayObject';
import { RenderManager } from '../rendering/RenderManager';
import { Texture } from '../rendering/texture/Texture';
import { RenderTexture } from '../rendering/texture/RenderTexture';
import { BlendModes, BufferTypes, BufferUsage } from "../const/rendering";
import { View } from '../rendering/View';
import { ParticleSystem } from './ParticleSystem';
import { defaultParticleRendererBatchSize } from "../const/defaults";
import vertexSource from "./glsl/particle.vert";
import fragmentSource from "./glsl/particle.frag";

export class ParticleRenderer implements IRenderer {

    private _batchSize: number = defaultParticleRendererBatchSize;
    private _batchIndex = 0;

    /**
     * 4 x 9 Properties:
     * 2 = vertexPos     (x, y) +
     * 1 = texCoord (packed uv) +
     * 2 = position      (x, y) +
     * 2 = scale         (x, y) +
     * 1 = rotation      (x, y) +
     * 1 = color         (ARGB int)
     */
    private _attributeCount = 36;
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
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_translation'), gl.FLOAT, false, this._attributeCount, 12)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_scale'), gl.FLOAT, false, this._attributeCount, 20)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_rotation'), gl.FLOAT, false, this._attributeCount, 28)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, this._attributeCount, 32);
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

    render(system: ParticleSystem) {
        const { texture, textureFrame, texCoordData, particles, blendMode } = system,
            textureChanged = (texture !== this._currentTexture),
            blendModeChanged = (blendMode !== this._currentBlendMode),
            float32View = this._float32View,
            uint32View = this._uint32View;

        if (textureChanged || blendModeChanged) {
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

        texture.update();

        for (const particle of particles) {
            if (this._batchIndex >= this._batchSize) {
                this.flush();
            }

            const { position, scale, rotation, tint } = particle;
            const index = (this._batchIndex * this._attributeCount);

            float32View[index + 0] = float32View[index + 27] = textureFrame.x;
            float32View[index + 1] = float32View[index + 10] = textureFrame.y;
            float32View[index + 9] = float32View[index + 18] = textureFrame.width;
            float32View[index + 19] = float32View[index + 28] = textureFrame.height;

            uint32View[index + 2] = texCoordData[0];
            uint32View[index + 11] = texCoordData[1];
            uint32View[index + 20] = texCoordData[2];
            uint32View[index + 29] = texCoordData[3];

            float32View[index + 3]
                = float32View[index + 12]
                = float32View[index + 21]
                = float32View[index + 30]
                = position.x;

            float32View[index + 4]
                = float32View[index + 13]
                = float32View[index + 22]
                = float32View[index + 31]
                = position.y;

            float32View[index + 5]
                = float32View[index + 14]
                = float32View[index + 23]
                = float32View[index + 32]
                = scale.x;

            float32View[index + 6]
                = float32View[index + 15]
                = float32View[index + 24]
                = float32View[index + 33]
                = scale.y;

            float32View[index + 7]
                = float32View[index + 16]
                = float32View[index + 25]
                = float32View[index + 34]
                = rotation;

            uint32View[index + 8]
                = uint32View[index + 17]
                = uint32View[index + 26]
                = uint32View[index + 35]
                = tint.toRGBA();

            this._batchIndex++;
        }

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
