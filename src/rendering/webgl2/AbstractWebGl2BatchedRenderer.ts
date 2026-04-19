import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import { Shader } from '../shader/Shader';
import { createWebGl2ShaderRuntime } from './WebGl2ShaderRuntime';
import type { WebGl2VertexArrayObject, WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { createQuadIndices } from '@/rendering/utils';
import type { Texture } from '../texture/Texture';
import type { BlendModes } from '@/rendering/types';
import { BufferTypes, BufferUsage } from '@/rendering/types';
import type { View } from '../View';
import type { WebGl2RendererRuntime } from './WebGl2RendererRuntime';
import type { RenderTexture } from '../texture/RenderTexture';
import type { Drawable } from '../Drawable';

interface ManagedBufferState {
    readonly handle: WebGLBuffer;
    dataByteLength: number;
}

interface RendererConnection {
    readonly gl: WebGL2RenderingContext;
    readonly buffers: Map<WebGl2RenderBuffer, ManagedBufferState>;
    readonly vaoHandle: WebGLVertexArrayObject;
}

export abstract class AbstractWebGl2BatchedRenderer extends AbstractWebGl2Renderer<Drawable> {
    protected readonly attributeCount: number;
    protected readonly batchSize: number;
    protected readonly indexData: Uint16Array;
    protected readonly vertexData: ArrayBuffer;
    protected readonly float32View: Float32Array;
    protected readonly uint32View: Uint32Array;
    protected readonly shader: Shader;
    protected batchIndex = 0;
    protected currentTexture: Texture | RenderTexture | null = null;
    protected currentBlendMode: BlendModes | null = null;
    protected currentView: View | null = null;
    protected currentViewId = -1;
    protected vao: WebGl2VertexArrayObject | null = null;
    protected indexBuffer: WebGl2RenderBuffer | null = null;
    protected vertexBuffer: WebGl2RenderBuffer | null = null;
    protected connection: RendererConnection | null = null;

    protected constructor(batchSize: number, attributeCount: number, vertexSource: string, fragmentSource: string) {
        super();

        this.batchSize = batchSize;
        this.attributeCount = attributeCount;
        this.vertexData = new ArrayBuffer(batchSize * attributeCount * 4);
        this.float32View = new Float32Array(this.vertexData);
        this.uint32View = new Uint32Array(this.vertexData);
        this.indexData = createQuadIndices(batchSize);
        this.shader = new Shader(vertexSource, fragmentSource);
    }

    public flush(): void {
        const runtime = this.getRuntimeOrNull();
        const vertexBuffer = this.vertexBuffer;
        const vao = this.vao;

        if (this.batchIndex === 0 || runtime === null || vertexBuffer === null || vao === null) {
            return;
        }

        const view = runtime.view;

        if (this.currentView !== view || this.currentViewId !== view.updateId) {
            this.currentView = view;
            this.currentViewId = view.updateId;
            this.updateView(view);
        }

        this.shader.sync();
        runtime.bindVertexArrayObject(vao);
        vertexBuffer.upload(this.float32View.subarray(0, this.batchIndex * this.attributeCount));
        vao.draw(this.batchIndex * 6, 0);
        runtime.stats.batches++;
        runtime.stats.drawCalls++;
        this.batchIndex = 0;
    }

    public destroy(): void {
        this.disconnect();
        this.shader.destroy();
        this.currentTexture = null;
        this.currentBlendMode = null;
        this.currentView = null;
        this.connection = null;
    }

    protected onConnect(runtime: WebGl2RendererRuntime): void {
        const gl = runtime.context;

        this.shader.connect(createWebGl2ShaderRuntime(gl));
        this.connection = this.createConnection(gl);
        this.indexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, this.indexData, BufferUsage.StaticDraw)
            .connect(this.createBufferRuntime(this.connection));
        this.vertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this.vertexData, BufferUsage.DynamicDraw)
            .connect(this.createBufferRuntime(this.connection));
        this.vao = this.createVao(gl, this.indexBuffer, this.vertexBuffer)
            .connect(this.createVaoRuntime(this.connection));
    }

    protected onDisconnect(): void {
        this.flush();
        this.shader.disconnect();

        this.indexBuffer?.destroy();
        this.indexBuffer = null;

        this.vertexBuffer?.destroy();
        this.vertexBuffer = null;

        this.vao?.destroy();
        this.vao = null;

        this.connection = null;
        this.currentTexture = null;
        this.currentBlendMode = null;
        this.currentView = null;
        this.currentViewId = -1;
        this.batchIndex = 0;
    }

    public abstract override render(drawable: Drawable): void;
    protected abstract createVao(gl: WebGL2RenderingContext, indexBuffer: WebGl2RenderBuffer, vertexBuffer: WebGl2RenderBuffer): WebGl2VertexArrayObject;
    protected abstract updateView(view: View): void;

    protected createConnection(gl: WebGL2RenderingContext): RendererConnection {
        const vaoHandle = gl.createVertexArray();

        if (vaoHandle === null) {
            throw new Error('Could not create vertex array object.');
        }

        return {
            gl,
            buffers: new Map<WebGl2RenderBuffer, ManagedBufferState>(),
            vaoHandle,
        };
    }

    protected createBufferRuntime(connection: RendererConnection): WebGl2RenderBufferRuntime {
        const handle = connection.gl.createBuffer();

        if (handle === null) {
            throw new Error('Could not create render buffer.');
        }

        return {
            bind: (buffer: WebGl2RenderBuffer): void => {
                connection.gl.bindBuffer(buffer.type, handle);
            },
            upload: (buffer: WebGl2RenderBuffer, offset: number): void => {
                const gl = connection.gl;
                const data = buffer.data;
                const state = connection.buffers.get(buffer);

                gl.bindBuffer(buffer.type, handle);

                if (state && state.dataByteLength >= data.byteLength) {
                    gl.bufferSubData(buffer.type, offset, data);
                    state.dataByteLength = data.byteLength;
                } else {
                    gl.bufferData(buffer.type, data, buffer.usage);
                    connection.buffers.set(buffer, { handle, dataByteLength: data.byteLength });
                }
            },
            destroy: (buffer: WebGl2RenderBuffer): void => {
                connection.gl.deleteBuffer(handle);
                connection.buffers.delete(buffer);
                buffer.disconnect();
            },
        };
    }

    protected createVaoRuntime(connection: RendererConnection): WebGl2VertexArrayObjectRuntime {
        let appliedVersion = -1;

        return {
            bind: (vao: WebGl2VertexArrayObject): void => {
                const gl = connection.gl;

                gl.bindVertexArray(connection.vaoHandle);

                if (appliedVersion !== vao.version) {
                    let lastBuffer: WebGl2RenderBuffer | null = null;

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
                connection.gl.bindVertexArray(null);
            },
            draw: (vao: WebGl2VertexArrayObject, size: number, start: number, type: number): void => {
                const gl = connection.gl;

                if (vao.indexBuffer) {
                    gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
                } else {
                    gl.drawArrays(type, start, size);
                }
            },
            destroy: (vao: WebGl2VertexArrayObject): void => {
                connection.gl.deleteVertexArray(connection.vaoHandle);
                vao.disconnect();
            },
        };
    }
}
