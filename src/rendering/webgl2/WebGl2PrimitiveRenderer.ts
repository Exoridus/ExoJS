import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import { Shader } from '../shader/Shader';
import { createWebGl2ShaderRuntime } from './WebGl2ShaderRuntime';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';
import type { WebGl2RenderBuffer, WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { BufferTypes, BufferUsage } from '@/rendering/types';
import type { View } from '../View';
import { WebGl2RenderBuffer as Buffer } from './WebGl2RenderBuffer';
import type { DrawableShape } from '../primitives/DrawableShape';
import type { WebGl2RendererRuntime } from './WebGl2RendererRuntime';
import vertexSource from './glsl/primitive.vert';
import fragmentSource from './glsl/primitive.frag';

const minBatchVertexSize = 4;
const vertexStrideBytes = 12;
const vertexStrideWords = vertexStrideBytes / 4;

interface ManagedBufferState {
    readonly handle: WebGLBuffer;
    dataByteLength: number;
}

interface PrimitiveRendererConnection {
    readonly gl: WebGL2RenderingContext;
    readonly buffers: Map<Buffer, ManagedBufferState>;
    readonly vaoHandle: WebGLVertexArrayObject;
    readonly vao: WebGl2VertexArrayObject;
    readonly indexBuffer: Buffer;
    readonly vertexBuffer: Buffer;
}

export class WebGl2PrimitiveRenderer extends AbstractWebGl2Renderer<DrawableShape> {
    private _vertexCapacity: number;
    private _indexCapacity: number;
    private _vertexData: ArrayBuffer;
    private _indexData: Uint16Array;
    private _float32View: Float32Array;
    private _uint32View: Uint32Array;
    private _shader: Shader = new Shader(vertexSource, fragmentSource);
    private _connection: PrimitiveRendererConnection | null = null;
    private _currentBlendMode: number | null = null;
    private _currentView: View | null = null;
    private _viewId = -1;

    public constructor(batchSize: number) {
        super();

        this._vertexCapacity = Math.max(minBatchVertexSize, batchSize);
        this._indexCapacity = Math.max(6, this._vertexCapacity * 3);
        this._vertexData = new ArrayBuffer(this._vertexCapacity * vertexStrideBytes);
        this._indexData = new Uint16Array(this._indexCapacity);
        this._float32View = new Float32Array(this._vertexData);
        this._uint32View = new Uint32Array(this._vertexData);
    }

    public render(shape: DrawableShape): void {
        const connection = this._connection;

        if (!connection) {
            throw new Error('Renderer not connected');
        }

        const runtime = this.getRuntime();
        const { geometry, drawMode, color, blendMode } = shape;
        const vertices = geometry.vertices;
        const sourceIndices = geometry.indices;
        const vertexCount = vertices.length / 2;
        const indexCount = sourceIndices.length > 0 ? sourceIndices.length : vertexCount;

        if (vertexCount === 0 || indexCount === 0) {
            return;
        }

        this._ensureVertexCapacity(vertexCount);
        this._ensureIndexCapacity(indexCount);

        if (blendMode !== this._currentBlendMode) {
            this._currentBlendMode = blendMode;
            runtime.setBlendMode(blendMode);
        }

        const view = runtime.view;

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
        runtime.bindVertexArrayObject(connection.vao);
        connection.vertexBuffer.upload(this._float32View.subarray(0, vertexCount * vertexStrideWords));
        connection.indexBuffer.upload(this._indexData.subarray(0, indexCount));
        connection.vao.draw(indexCount, 0, drawMode);
        runtime.stats.batches++;
        runtime.stats.drawCalls++;
    }

    public flush(): void {
        // Primitive rendering is immediate per shape in this bridge stage.
    }

    public destroy(): void {
        this.disconnect();
        this._shader.destroy();
        this._currentBlendMode = null;
        this._currentView = null;
    }

    protected onConnect(runtime: WebGl2RendererRuntime): void {
        const gl = runtime.context;
        const vaoHandle = gl.createVertexArray();

        this._shader.connect(createWebGl2ShaderRuntime(gl));

        if (vaoHandle === null) {
            throw new Error('Could not create vertex array object.');
        }

        const buffers = new Map<Buffer, ManagedBufferState>();
        const indexBuffer = new Buffer(BufferTypes.ElementArrayBuffer, this._indexData, BufferUsage.DynamicDraw)
            .connect(this._createBufferRuntime(gl, buffers));
        const vertexBuffer = new Buffer(BufferTypes.ArrayBuffer, this._vertexData, BufferUsage.DynamicDraw)
            .connect(this._createBufferRuntime(gl, buffers));
        const vao = new WebGl2VertexArrayObject()
            .addIndex(indexBuffer)
            .addAttribute(vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
            .addAttribute(vertexBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, vertexStrideBytes, 8)
            .connect(this._createVaoRuntime(gl, vaoHandle));

        this._connection = { gl, buffers, vaoHandle, vao, indexBuffer, vertexBuffer };
    }

    protected onDisconnect(): void {
        const connection = this._connection;

        if (!connection) {
            return;
        }

        this._shader.disconnect();
        connection.indexBuffer.destroy();
        connection.vertexBuffer.destroy();
        connection.vao.destroy();

        this._connection = null;
        this._currentBlendMode = null;
        this._currentView = null;
        this._viewId = -1;
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

    private _createBufferRuntime(gl: WebGL2RenderingContext, buffers: Map<Buffer, ManagedBufferState>): WebGl2RenderBufferRuntime {
        const handle = gl.createBuffer();

        if (handle === null) {
            throw new Error('Could not create render buffer.');
        }

        return {
            bind: (buffer: Buffer): void => {
                gl.bindBuffer(buffer.type, handle);
            },
            upload: (buffer: Buffer, offset: number): void => {
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
            destroy: (buffer: Buffer): void => {
                gl.deleteBuffer(handle);
                buffers.delete(buffer);
                buffer.disconnect();
            },
        };
    }

    private _createVaoRuntime(gl: WebGL2RenderingContext, vaoHandle: WebGLVertexArrayObject): WebGl2VertexArrayObjectRuntime {
        let appliedVersion = -1;

        return {
            bind: (vao: WebGl2VertexArrayObject): void => {
                gl.bindVertexArray(vaoHandle);

                if (appliedVersion !== vao.version) {
                    let lastBuffer: Buffer | null = null;

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
            draw: (vao: WebGl2VertexArrayObject, size: number, start: number, type: number): void => {
                if (vao.indexBuffer) {
                    gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
                } else {
                    gl.drawArrays(type, start, size);
                }
            },
            destroy: (vao: WebGl2VertexArrayObject): void => {
                gl.deleteVertexArray(vaoHandle);
                vao.disconnect();
            },
        };
    }
}
