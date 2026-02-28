import type { IRenderer } from 'rendering/IRenderer';
import { Shader } from 'rendering/shader/Shader';
import type { RenderManager } from 'rendering/RenderManager';
import { BlendModes, BufferTypes, BufferUsage } from 'types/rendering';
import type { View } from 'rendering/View';
import { RenderBuffer } from 'rendering/RenderBuffer';
import { VertexArrayObject } from 'rendering/VertexArrayObject';
import type { Drawable } from 'rendering/Drawable';
import { DrawableShape } from 'rendering/primitives/DrawableShape';
import vertexSource from './glsl/primitive.vert';
import fragmentSource from './glsl/primitive.frag';

const minBatchVertexSize = 4;
const vertexStrideBytes = 12; // vec2 position + packed rgba
const vertexStrideWords = vertexStrideBytes / 4;

export class PrimitiveRenderer implements IRenderer {

    private _vertexCapacity: number;
    private _indexCapacity: number;
    private _vertexData: ArrayBuffer;
    private _indexData: Uint16Array;
    private _float32View: Float32Array;
    private _uint32View: Uint32Array;
    private _shader: Shader = new Shader(vertexSource, fragmentSource);
    private _renderManager: RenderManager | null = null;
    private _context: WebGL2RenderingContext | null = null;
    private _currentBlendMode: BlendModes | null = null;
    private _currentView: View | null = null;
    private _viewId = -1;
    private _indexBuffer: RenderBuffer | null = null;
    private _vertexBuffer: RenderBuffer | null = null;
    private _vao: VertexArrayObject | null = null;

    public constructor(batchSize: number) {
        this._vertexCapacity = Math.max(minBatchVertexSize, batchSize);
        this._indexCapacity = Math.max(6, this._vertexCapacity * 3);
        this._vertexData = new ArrayBuffer(this._vertexCapacity * vertexStrideBytes);
        this._indexData = new Uint16Array(this._indexCapacity);
        this._float32View = new Float32Array(this._vertexData);
        this._uint32View = new Uint32Array(this._vertexData);
    }

    public connect(renderManager: RenderManager): this {
        if (!this._context) {
            const gl = renderManager.context;

            this._context = gl;
            this._renderManager = renderManager;

            this._shader.connect(gl);
            this._indexBuffer = new RenderBuffer(gl, BufferTypes.ELEMENT_ARRAY_BUFFER, this._indexData, BufferUsage.DYNAMIC_DRAW);
            this._vertexBuffer = new RenderBuffer(gl, BufferTypes.ARRAY_BUFFER, this._vertexData, BufferUsage.DYNAMIC_DRAW);

            this._vao = new VertexArrayObject(gl)
                .addIndex(this._indexBuffer)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, vertexStrideBytes, 8);
        }

        return this;
    }

    public disconnect(): this {
        if (this._context) {
            this.unbind();

            this._shader.disconnect();
            this._vao?.destroy();

            this._renderManager = null;
            this._context = null;
            this._vao = null;
            this._indexBuffer = null;
            this._vertexBuffer = null;
        }

        return this;
    }

    public bind(): this {
        if (!this._context) {
            throw new Error('Renderer has to be connected first!')
        }

        this._renderManager!.setVao(this._vao);
        this._renderManager!.setShader(this._shader);

        return this;
    }

    public unbind(): this {
        if (this._context) {
            this.flush();

            this._renderManager!.setShader(null);
            this._renderManager!.setVao(null);

            this._currentBlendMode = null;
            this._currentView = null;
            this._viewId = -1;
        }

        return this;
    }

    public render(drawable: Drawable): this {
        const shape = drawable as DrawableShape;
        const { geometry, drawMode, color, blendMode } = shape;
        const vertices = geometry.vertices;
        const sourceIndices = geometry.indices;
        const vertexCount = vertices.length / 2;
        const indexCount = sourceIndices.length > 0 ? sourceIndices.length : vertexCount;

        if (vertexCount === 0 || indexCount === 0) {
            return this;
        }

        this._ensureVertexCapacity(vertexCount);
        this._ensureIndexCapacity(indexCount);

        if (blendMode !== this._currentBlendMode) {
            this._currentBlendMode = blendMode;
            this._renderManager!.setBlendMode(blendMode);
        }

        const view = this._renderManager!.view;

        if (this._currentView !== view || this._viewId !== view.updateId) {
            this._currentView = view;
            this._viewId = view.updateId;
            this._shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
        }

        this._shader.getUniform('u_translation').setValue(shape.getGlobalTransform().toArray(false));

        const packedColor = color.toRgba();

        for (let i = 0; i < vertexCount; i++) {
            const sourceIndex = i * 2;
            const targetIndex = i * vertexStrideWords;

            this._float32View[targetIndex] = vertices[sourceIndex];
            this._float32View[targetIndex + 1] = vertices[sourceIndex + 1];
            this._uint32View[targetIndex + 2] = packedColor;
        }

        if (sourceIndices.length > 0) {
            this._indexData.set(sourceIndices, 0);
        } else {
            for (let i = 0; i < vertexCount; i++) {
                this._indexData[i] = i;
            }
        }

        this._renderManager!.setVao(this._vao);
        this._vertexBuffer!.upload(this._float32View.subarray(0, vertexCount * vertexStrideWords));
        this._indexBuffer!.upload(this._indexData.subarray(0, indexCount));
        this._vao!.draw(indexCount, 0, drawMode);

        return this;
    }

    public flush(): this {
        return this;
    }

    public destroy(): void {
        this.disconnect();

        this._shader.destroy();
        this._currentBlendMode = null;
        this._currentView = null;
        this._renderManager = null;
        this._context = null;
    }

    private _ensureVertexCapacity(vertexCount: number): void {
        if (vertexCount <= this._vertexCapacity) {
            return;
        }

        while (this._vertexCapacity < vertexCount) {
            this._vertexCapacity *= 2;
        }

        this._vertexData = new ArrayBuffer(this._vertexCapacity * vertexStrideBytes);
        this._float32View = new Float32Array(this._vertexData);
        this._uint32View = new Uint32Array(this._vertexData);
    }

    private _ensureIndexCapacity(indexCount: number): void {
        if (indexCount <= this._indexCapacity) {
            return;
        }

        while (this._indexCapacity < indexCount) {
            this._indexCapacity *= 2;
        }

        this._indexData = new Uint16Array(this._indexCapacity);
    }
}
