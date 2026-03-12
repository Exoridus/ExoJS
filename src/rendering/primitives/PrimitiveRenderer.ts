import type { Renderer } from 'rendering/Renderer';
import { Shader } from 'rendering/shader/Shader';
import { createWebGlShaderRuntime } from 'rendering/shader/WebGL2ShaderRuntime';
import type { RenderBackend } from 'rendering/RenderBackend';
import type { WebGl2RenderBackend } from 'rendering/WebGl2RenderBackend';
import type { BlendModes} from 'types/rendering';
import { BufferTypes, BufferUsage } from 'types/rendering';
import type { View } from 'rendering/View';
import { RenderBuffer, type IRenderBufferRuntime } from 'rendering/RenderBuffer';
import { VertexArrayObject, type IVertexArrayObjectRuntime } from 'rendering/VertexArrayObject';
import type { Drawable } from 'rendering/Drawable';
import type { DrawableShape } from 'rendering/primitives/DrawableShape';
import vertexSource from './glsl/primitive.vert';
import fragmentSource from './glsl/primitive.frag';

const minBatchVertexSize = 4;
const vertexStrideBytes = 12; // vec2 position + packed rgba
const vertexStrideWords = vertexStrideBytes / 4;

interface IManagedBufferState {
    readonly handle: WebGLBuffer;
    dataByteLength: number;
}

interface IPrimitiveRendererConnection {
    readonly gl: WebGL2RenderingContext;
    readonly renderManager: WebGl2RenderBackend;
    readonly buffers: Map<RenderBuffer, IManagedBufferState>;
    readonly vaoHandle: WebGLVertexArrayObject;
    readonly vao: VertexArrayObject;
    readonly indexBuffer: RenderBuffer;
    readonly vertexBuffer: RenderBuffer;
}

export class PrimitiveRenderer implements Renderer {

    private _vertexCapacity: number;
    private _indexCapacity: number;
    private _vertexData: ArrayBuffer;
    private _indexData: Uint16Array;
    private _float32View: Float32Array;
    private _uint32View: Uint32Array;
    private _shader: Shader = new Shader(vertexSource, fragmentSource);
    private _connection: IPrimitiveRendererConnection | null = null;
    private _currentBlendMode: BlendModes | null = null;
    private _currentView: View | null = null;
    private _viewId = -1;

    public constructor(batchSize: number) {
        this._vertexCapacity = Math.max(minBatchVertexSize, batchSize);
        this._indexCapacity = Math.max(6, this._vertexCapacity * 3);
        this._vertexData = new ArrayBuffer(this._vertexCapacity * vertexStrideBytes);
        this._indexData = new Uint16Array(this._indexCapacity);
        this._float32View = new Float32Array(this._vertexData);
        this._uint32View = new Uint32Array(this._vertexData);
    }

    public connect(renderManager: WebGl2RenderBackend): this;
    public connect(renderManager: RenderBackend): this {
        if (!this._connection) {
            const webGl2RenderManager = renderManager as WebGl2RenderBackend;
            const gl = webGl2RenderManager.context;
            const vaoHandle = gl.createVertexArray();

            this._shader.connect(createWebGlShaderRuntime(gl));

            if (vaoHandle === null) {
                throw new Error('Could not create vertex array object.');
            }

            const buffers = new Map<RenderBuffer, IManagedBufferState>();
            const indexBuffer = new RenderBuffer(BufferTypes.ELEMENT_ARRAY_BUFFER, this._indexData, BufferUsage.DYNAMIC_DRAW)
                .connect(this._createBufferRuntime(gl, buffers));
            const vertexBuffer = new RenderBuffer(BufferTypes.ARRAY_BUFFER, this._vertexData, BufferUsage.DYNAMIC_DRAW)
                .connect(this._createBufferRuntime(gl, buffers));

            const vao = new VertexArrayObject()
                .addIndex(indexBuffer)
                .addAttribute(vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
                .addAttribute(vertexBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, vertexStrideBytes, 8)
                .connect(this._createVaoRuntime(gl, vaoHandle));

            this._connection = { gl, renderManager: webGl2RenderManager, buffers, vaoHandle, vao, indexBuffer, vertexBuffer };
        }

        return this;
    }

    public disconnect(): this {
        const conn = this._connection;

        if (conn) {
            this.unbind();

            this._shader.disconnect();
            conn.indexBuffer.destroy();
            conn.vertexBuffer.destroy();
            conn.vao.destroy();

            this._connection = null;
        }

        return this;
    }

    public bind(): this {
        const conn = this._connection;

        if (!conn) {
            throw new Error('Renderer has to be connected first!');
        }

        conn.renderManager.setVao(conn.vao);
        conn.renderManager.setShader(this._shader);

        return this;
    }

    public unbind(): this {
        const conn = this._connection;

        if (conn) {
            this.flush();

            conn.renderManager.setShader(null);
            conn.renderManager.setVao(null);

            this._currentBlendMode = null;
            this._currentView = null;
            this._viewId = -1;
        }

        return this;
    }

    public render(drawable: Drawable): this {
        const conn = this._connection;

        if (!conn) {
            throw new Error('Renderer not connected');
        }

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
            conn.renderManager.setBlendMode(blendMode);
        }

        const view = conn.renderManager.view;

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

        this._shader.sync();
        conn.renderManager.setVao(conn.vao);
        conn.vertexBuffer.upload(this._float32View.subarray(0, vertexCount * vertexStrideWords));
        conn.indexBuffer.upload(this._indexData.subarray(0, indexCount));
        conn.vao.draw(indexCount, 0, drawMode);

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

    private _createBufferRuntime(gl: WebGL2RenderingContext, buffers: Map<RenderBuffer, IManagedBufferState>): IRenderBufferRuntime {
        const handle = gl.createBuffer();

        if (handle === null) {
            throw new Error('Could not create render buffer.');
        }

        return {
            bind: (buffer: RenderBuffer): void => {
                gl.bindBuffer(buffer.type, handle);
            },
            upload: (buffer: RenderBuffer, offset: number): void => {
                const state = buffers.get(buffer);
                const data = buffer.data;

                gl.bindBuffer(buffer.type, handle);

                if (state && state.dataByteLength >= data.byteLength) {
                    gl.bufferSubData(buffer.type, offset, data);
                    state.dataByteLength = data.byteLength;
                } else {
                    gl.bufferData(buffer.type, data, buffer.usage);
                    buffers.set(buffer, { handle, dataByteLength: data.byteLength });
                }
            },
            destroy: (buffer: RenderBuffer): void => {
                gl.deleteBuffer(handle);
                buffers.delete(buffer);
                buffer.disconnect();
            },
        };
    }

    private _createVaoRuntime(gl: WebGL2RenderingContext, vaoHandle: WebGLVertexArrayObject): IVertexArrayObjectRuntime {
        let appliedVersion = -1;

        return {
            bind: (vao: VertexArrayObject): void => {
                gl.bindVertexArray(vaoHandle);

                if (appliedVersion !== vao.version) {
                    let lastBuffer: RenderBuffer | null = null;

                    for (const attribute of vao.attributes) {
                        if (lastBuffer !== attribute.buffer) {
                            attribute.buffer.bind();
                            lastBuffer = attribute.buffer;
                        }

                        gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
                        gl.enableVertexAttribArray(attribute.location);
                    }

                    if (vao.indexBuffer) {
                        vao.indexBuffer.bind();
                    }

                    appliedVersion = vao.version;
                }
            },
            unbind: (): void => {
                gl.bindVertexArray(null);
            },
            draw: (vao: VertexArrayObject, size: number, start: number, type: number): void => {
                if (vao.indexBuffer) {
                    gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
                } else {
                    gl.drawArrays(type, start, size);
                }
            },
            destroy: (vao: VertexArrayObject): void => {
                gl.deleteVertexArray(vaoHandle);
                vao.disconnect();
            },
        };
    }
}
