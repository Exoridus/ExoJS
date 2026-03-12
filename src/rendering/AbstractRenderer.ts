import type { IRenderer } from 'rendering/IRenderer';
import { Shader } from 'rendering/shader/Shader';
import { createWebGlShaderRuntime } from 'rendering/shader/WebGL2ShaderRuntime';
import type { VertexArrayObject, IVertexArrayObjectRuntime } from 'rendering/VertexArrayObject';
import { RenderBuffer, type IRenderBufferRuntime } from 'rendering/RenderBuffer';
import { createQuadIndices } from 'utils/rendering';
import type { Texture } from 'rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage } from 'types/rendering';
import type { View } from 'rendering/View';
import type { IRenderBackend } from 'rendering/IRenderBackend';
import type { IWebGl2RenderBackend } from 'rendering/IWebGl2RenderBackend';
import type { RenderTexture } from 'rendering/texture/RenderTexture';
import type { Drawable } from 'rendering/Drawable';

interface IManagedBufferState {
    readonly handle: WebGLBuffer;
    dataByteLength: number;
}

interface IRendererConnection {
    readonly gl: WebGL2RenderingContext;
    readonly buffers: Map<RenderBuffer, IManagedBufferState>;
    readonly vaoHandle: WebGLVertexArrayObject;
}

export abstract class AbstractRenderer implements IRenderer {
    protected readonly attributeCount: number;
    protected readonly batchSize: number;
    protected readonly indexData: Uint16Array;
    protected readonly vertexData: ArrayBuffer;
    protected readonly float32View: Float32Array;
    protected readonly uint32View: Uint32Array;
    protected readonly shader: Shader;
    protected batchIndex = 0;
    protected renderManager: IWebGl2RenderBackend | null = null;
    protected gl: WebGL2RenderingContext | null = null;
    protected currentTexture: Texture | RenderTexture | null = null;
    protected currentBlendMode: BlendModes | null = null;
    protected currentView: View | null = null;
    protected currentViewId = -1;
    protected vao: VertexArrayObject | null = null;
    protected indexBuffer: RenderBuffer | null = null;
    protected vertexBuffer: RenderBuffer | null = null;
    protected connection: IRendererConnection | null = null;

    protected constructor(batchSize: number, attributeCount: number, vertexSource: string, fragmentSource: string) {
        this.batchSize = batchSize;
        this.attributeCount = attributeCount;
        this.vertexData = new ArrayBuffer(batchSize * attributeCount * 4);
        this.float32View = new Float32Array(this.vertexData);
        this.uint32View = new Uint32Array(this.vertexData);
        this.indexData = createQuadIndices(batchSize);
        this.shader = new Shader(vertexSource, fragmentSource);
    }

    public connect(renderManager: IWebGl2RenderBackend): this;
    public connect(renderManager: IRenderBackend): this {
        if (!this.gl) {
            const webGl2RenderManager = renderManager as IWebGl2RenderBackend;
            const gl = webGl2RenderManager.context;

            this.gl = gl;
            this.renderManager = webGl2RenderManager;

            this.shader.connect(createWebGlShaderRuntime(gl));
            this.connection = this.createConnection(gl);
            this.indexBuffer = new RenderBuffer(BufferTypes.ELEMENT_ARRAY_BUFFER, this.indexData, BufferUsage.STATIC_DRAW)
                .connect(this.createBufferRuntime(this.connection));
            this.vertexBuffer = new RenderBuffer(BufferTypes.ARRAY_BUFFER, this.vertexData, BufferUsage.DYNAMIC_DRAW)
                .connect(this.createBufferRuntime(this.connection));
            this.vao = this.createVao(gl, this.indexBuffer, this.vertexBuffer)
                .connect(this.createVaoRuntime(this.connection));
        }

        return this;
    }

    public disconnect(): this {
        if (this.gl) {
            this.unbind();

            this.shader.disconnect();

            this.indexBuffer?.destroy();
            this.indexBuffer = null;

            this.vertexBuffer?.destroy();
            this.vertexBuffer = null;

            this.vao?.destroy();
            this.vao = null;

            this.connection = null;
            this.renderManager = null;
            this.gl = null;
        }

        return this;
    }

    public bind(): this {
        if (!this.renderManager) {
            throw new Error('Renderer has to be connected first!')
        }

        this.renderManager.setVao(this.vao);
        this.renderManager.setShader(this.shader);

        return this;
    }

    public unbind(): this {
        if (this.renderManager) {
            this.flush();

            this.renderManager.setShader(null);
            this.renderManager.setVao(null);

            this.currentTexture = null;
            this.currentBlendMode = null;
            this.currentView = null;
            this.currentViewId = -1;
        }

        return this;
    }

    public flush(): this {
        const renderManager = this.renderManager;
        const vertexBuffer = this.vertexBuffer;
        const vao = this.vao;

        if (this.batchIndex > 0 && renderManager && vertexBuffer && vao) {
            const view = renderManager.view;

            if (this.currentView !== view || this.currentViewId !== view.updateId) {
                this.currentView = view;
                this.currentViewId = view.updateId;
                this.updateView(view);
            }

            this.shader.sync();
            renderManager.setVao(vao);
            vertexBuffer.upload(this.float32View.subarray(0, this.batchIndex * this.attributeCount));
            vao.draw(this.batchIndex * 6, 0);
            this.batchIndex = 0;
        }

        return this;
    }

    public destroy(): void {
        this.disconnect();
        this.shader.destroy();
        this.currentTexture = null;
        this.currentBlendMode = null;
        this.currentView = null;
        this.renderManager = null;
        this.gl = null;
        this.connection = null;
    }

    public abstract render(drawable: Drawable): this;
    protected abstract createVao(gl: WebGL2RenderingContext, indexBuffer: RenderBuffer, vertexBuffer: RenderBuffer): VertexArrayObject;
    protected abstract updateView(view: View): this;

    protected createConnection(gl: WebGL2RenderingContext): IRendererConnection {
        const vaoHandle = gl.createVertexArray();

        if (vaoHandle === null) {
            throw new Error('Could not create vertex array object.');
        }

        return {
            gl,
            buffers: new Map<RenderBuffer, IManagedBufferState>(),
            vaoHandle,
        };
    }

    protected createBufferRuntime(connection: IRendererConnection): IRenderBufferRuntime {
        const handle = connection.gl.createBuffer();

        if (handle === null) {
            throw new Error('Could not create render buffer.');
        }

        return {
            bind: (buffer: RenderBuffer): void => {
                connection.gl.bindBuffer(buffer.type, handle);
            },
            upload: (buffer: RenderBuffer, offset: number): void => {
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
            destroy: (buffer: RenderBuffer): void => {
                connection.gl.deleteBuffer(handle);
                connection.buffers.delete(buffer);
                buffer.disconnect();
            },
        };
    }

    protected createVaoRuntime(connection: IRendererConnection): IVertexArrayObjectRuntime {
        let appliedVersion = -1;

        return {
            bind: (vao: VertexArrayObject): void => {
                const gl = connection.gl;

                gl.bindVertexArray(connection.vaoHandle);

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
                connection.gl.bindVertexArray(null);
            },
            draw: (vao: VertexArrayObject, size: number, start: number, type: number): void => {
                const gl = connection.gl;

                if (vao.indexBuffer) {
                    gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
                } else {
                    gl.drawArrays(type, start, size);
                }
            },
            destroy: (vao: VertexArrayObject): void => {
                connection.gl.deleteVertexArray(connection.vaoHandle);
                vao.disconnect();
            },
        };
    }
}
