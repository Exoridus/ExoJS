import { Shader } from '../shader/Shader';
import { createWebGl2ShaderRuntime } from './WebGl2ShaderRuntime';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { BufferTypes, BufferUsage } from '@/rendering/types';
import type { BlendModes } from '@/rendering/types';
import type { WebGl2RendererRuntime } from './WebGl2RendererRuntime';
import type { Texture } from '../texture/Texture';
import type { RenderTexture } from '../texture/RenderTexture';
import vertexSource from './glsl/mask-compose.vert';
import fragmentSource from './glsl/mask-compose.frag';

interface MaskCompositorConnection {
    readonly gl: WebGL2RenderingContext;
    readonly vaoHandle: WebGLVertexArrayObject;
    readonly vao: WebGl2VertexArrayObject;
    readonly indexBuffer: WebGl2RenderBuffer;
    readonly vertexBuffer: WebGl2RenderBuffer;
    readonly bufferHandles: Map<WebGl2RenderBuffer, WebGLBuffer>;
}

// 4 floats per vertex: position(x, y) + texcoord(u, v).
const vertexStrideBytes = 16;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * Single-quad two-texture compositor used by `WebGl2RenderManager.composeWithAlphaMask`.
 *
 * Renders the content texture onto the active render target with each
 * output texel's alpha multiplied by the mask texture's alpha at the
 * same UV. Both textures are sampled with stretched-fit UVs over the
 * destination rectangle.
 *
 * Intentionally not a {@link AbstractWebGl2Renderer} subclass: this
 * compositor is invoked directly by the manager for non-Drawable
 * compositing operations and never participates in the renderer
 * registry dispatch path.
 */
export class WebGl2MaskCompositor {

    private readonly _shader: Shader = new Shader(vertexSource, fragmentSource);
    private readonly _vertexData: ArrayBuffer = new ArrayBuffer(4 * vertexStrideBytes);
    private readonly _float32View: Float32Array = new Float32Array(this._vertexData);
    private readonly _contentSamplerSlot: Int32Array = new Int32Array([0]);
    private readonly _maskSamplerSlot: Int32Array = new Int32Array([1]);
    private _connection: MaskCompositorConnection | null = null;

    public connect(runtime: WebGl2RendererRuntime): void {
        if (this._connection !== null) {
            return;
        }

        const gl = runtime.context;
        const vaoHandle = gl.createVertexArray();

        if (vaoHandle === null) {
            throw new Error('WebGl2MaskCompositor: could not create vertex array object.');
        }

        this._shader.connect(createWebGl2ShaderRuntime(gl));

        const bufferHandles = new Map<WebGl2RenderBuffer, WebGLBuffer>();
        const indexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, quadIndices, BufferUsage.StaticDraw)
            .connect(this._createBufferRuntime(gl, bufferHandles));
        const vertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._vertexData, BufferUsage.DynamicDraw)
            .connect(this._createBufferRuntime(gl, bufferHandles));

        const vao = new WebGl2VertexArrayObject()
            .addIndex(indexBuffer)
            .addAttribute(vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
            .addAttribute(vertexBuffer, this._shader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
            .connect(this._createVaoRuntime(gl, vaoHandle));

        this._connection = { gl, vaoHandle, vao, indexBuffer, vertexBuffer, bufferHandles };
    }

    public disconnect(): void {
        const connection = this._connection;

        if (connection === null) {
            return;
        }

        connection.indexBuffer.destroy();
        connection.vertexBuffer.destroy();
        connection.vao.destroy();
        this._shader.disconnect();
        this._connection = null;
    }

    public compose(
        runtime: WebGl2RendererRuntime,
        content: Texture | RenderTexture,
        mask: Texture | RenderTexture,
        x: number,
        y: number,
        width: number,
        height: number,
        blendMode: BlendModes,
    ): void {
        const connection = this._connection;

        if (connection === null) {
            throw new Error('WebGl2MaskCompositor: not connected.');
        }

        // Update the quad vertices for this destination rect. UVs are 0..1
        // mapped over (left, top) → (right, bottom) with an explicit Y-flip
        // for render-texture sampling: the mask path samples textures
        // already authored as RGBA in render-texture orientation.
        this._writeQuadVertices(x, y, x + width, y + height);

        // Bind the compositor program. Setting projection + sampler uniforms
        // each call because they need to match the current render target.
        runtime.bindShader(this._shader);

        const view = runtime.view;
        const projection = view.getTransform().toArray(false);

        this._shader.getUniform('u_projection').setValue(projection);
        this._shader.getUniform('u_content').setValue(this._contentSamplerSlot);
        this._shader.getUniform('u_mask').setValue(this._maskSamplerSlot);
        this._shader.sync();

        runtime.bindTexture(content, 0);
        runtime.bindTexture(mask, 1);
        runtime.setBlendMode(blendMode);

        runtime.bindVertexArrayObject(connection.vao);
        connection.vertexBuffer.upload(this._float32View);
        connection.vao.draw(6, 0);

        runtime.stats.batches++;
        runtime.stats.drawCalls++;

        // Reset the active texture unit to 0 to avoid leaking unit 1 into
        // subsequent renderer state.
        runtime.bindTexture(null, 1);
    }

    private _writeQuadVertices(left: number, top: number, right: number, bottom: number): void {
        const view = this._float32View;

        // Vertex 0: top-left (UV 0, 0)
        view[0] = left;
        view[1] = top;
        view[2] = 0;
        view[3] = 0;

        // Vertex 1: top-right (UV 1, 0)
        view[4] = right;
        view[5] = top;
        view[6] = 1;
        view[7] = 0;

        // Vertex 2: bottom-right (UV 1, 1)
        view[8] = right;
        view[9] = bottom;
        view[10] = 1;
        view[11] = 1;

        // Vertex 3: bottom-left (UV 0, 1)
        view[12] = left;
        view[13] = bottom;
        view[14] = 0;
        view[15] = 1;
    }

    private _createBufferRuntime(gl: WebGL2RenderingContext, handles: Map<WebGl2RenderBuffer, WebGLBuffer>): WebGl2RenderBufferRuntime {
        const handle = gl.createBuffer();

        if (handle === null) {
            throw new Error('WebGl2MaskCompositor: could not create render buffer.');
        }

        return {
            bind: (buffer: WebGl2RenderBuffer): void => {
                gl.bindBuffer(buffer.type, handle);
            },
            upload: (buffer: WebGl2RenderBuffer): void => {
                const data = buffer.data;

                gl.bindBuffer(buffer.type, handle);
                gl.bufferData(buffer.type, data, buffer.usage);
                handles.set(buffer, handle);
            },
            destroy: (buffer: WebGl2RenderBuffer): void => {
                gl.deleteBuffer(handle);
                handles.delete(buffer);
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

