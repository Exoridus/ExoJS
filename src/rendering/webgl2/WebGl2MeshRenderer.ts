import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import { Shader } from '../shader/Shader';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '@/rendering/types';
import { Texture } from '../texture/Texture';
import type { Mesh } from '../mesh/Mesh';
import type { View } from '../View';
import type { WebGl2Backend } from './WebGl2Backend';
import vertexSource from './glsl/mesh.vert';
import fragmentSource from './glsl/mesh.frag';

// Per-vertex layout (20 bytes):
//   position: vec2 f32 (offset  0,  8 bytes)
//   texcoord: vec2 f32 (offset  8,  8 bytes)
//   color:    u8x4 norm (offset 16, 4 bytes)
const vertexStrideBytes = 20;
const vertexStrideWords = vertexStrideBytes / 4;
const initialVertexCapacity = 64;
const initialIndexCapacity = 192;
const defaultVertexColor = 0xFFFFFFFF; // white, full alpha

interface MeshRendererConnection {
    readonly gl: WebGL2RenderingContext;
    readonly vao: WebGl2VertexArrayObject;
    readonly vertexBuffer: WebGl2RenderBuffer;
    readonly indexBuffer: WebGl2RenderBuffer;
}

export class WebGl2MeshRenderer extends AbstractWebGl2Renderer<Mesh> {

    private readonly _shader: Shader = new Shader(vertexSource, fragmentSource);
    private readonly _tintScratch: Float32Array = new Float32Array(4);
    private readonly _textureUnitScratch: Int32Array = new Int32Array([0]);

    private _vertexCapacity = initialVertexCapacity;
    private _indexCapacity = initialIndexCapacity;
    private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
    private _float32View: Float32Array = new Float32Array(this._vertexData);
    private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
    private _indexData: Uint16Array = new Uint16Array(initialIndexCapacity);

    private _connection: MeshRendererConnection | null = null;
    private _currentBlendMode: number | null = null;
    private _currentView: View | null = null;
    private _viewId = -1;

    public render(mesh: Mesh): void {
        const connection = this._connection;

        if (!connection) {
            throw new Error('WebGl2MeshRenderer is not connected to a backend.');
        }

        const vertexCount = mesh.vertexCount;

        if (vertexCount === 0) {
            return;
        }

        const backend = this.getBackend();
        const blendMode = mesh.blendMode;

        if (blendMode !== this._currentBlendMode) {
            this._currentBlendMode = blendMode;
            backend.setBlendMode(blendMode);
        }

        const view = backend.view;

        if (this._currentView !== view || this._viewId !== view.updateId) {
            this._currentView = view;
            this._viewId = view.updateId;
            this._shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
        }

        this._shader.getUniform('u_translation').setValue(mesh.getGlobalTransform().toArray(false));

        const tint = mesh.tint;
        this._tintScratch[0] = tint.red;
        this._tintScratch[1] = tint.green;
        this._tintScratch[2] = tint.blue;
        this._tintScratch[3] = tint.alpha;
        this._shader.getUniform('u_tint').setValue(this._tintScratch);

        // The fragment shader always samples u_texture; meshes without an
        // explicit texture get the engine's 1x1 white default so the shader
        // path stays branchless.
        const meshTexture = mesh.texture ?? Texture.white;
        this._shader.getUniform('u_texture').setValue(this._textureUnitScratch);
        backend.bindTexture(meshTexture, 0);

        this._ensureVertexCapacity(vertexCount);

        const positions = mesh.vertices;
        const uvs = mesh.uvs;
        const colors = mesh.colors;

        for (let i = 0; i < vertexCount; i++) {
            const word = i * vertexStrideWords;
            const pair = i * 2;

            this._float32View[word] = positions[pair];
            this._float32View[word + 1] = positions[pair + 1];

            if (uvs !== null) {
                this._float32View[word + 2] = uvs[pair];
                this._float32View[word + 3] = uvs[pair + 1];
            } else {
                this._float32View[word + 2] = 0;
                this._float32View[word + 3] = 0;
            }

            this._uint32View[word + 4] = colors !== null ? colors[i] : defaultVertexColor;
        }

        const indexCount = mesh.indexCount;

        this._ensureIndexCapacity(indexCount);

        if (mesh.indices !== null) {
            this._indexData.set(mesh.indices, 0);
        } else {
            for (let i = 0; i < indexCount; i++) {
                this._indexData[i] = i;
            }
        }

        this._shader.sync();
        backend.bindVertexArrayObject(connection.vao);
        connection.vertexBuffer.upload(this._float32View.subarray(0, vertexCount * vertexStrideWords));
        connection.indexBuffer.upload(this._indexData.subarray(0, indexCount));
        connection.vao.draw(indexCount, 0, RenderingPrimitives.Triangles);

        backend.stats.batches++;
        backend.stats.drawCalls++;
    }

    public flush(): void {
        // Mesh draws are immediate per-mesh; nothing to batch.
    }

    public destroy(): void {
        this.disconnect();
        this._shader.destroy();
        this._currentBlendMode = null;
        this._currentView = null;
    }

    protected onConnect(backend: WebGl2Backend): void {
        const gl = backend.context;
        const vaoHandle = gl.createVertexArray();

        if (vaoHandle === null) {
            throw new Error('Could not create vertex array object.');
        }

        this._shader.connect(createWebGl2ShaderProgram(gl));

        const buffers = new Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number; }>();
        const indexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, this._indexData, BufferUsage.DynamicDraw)
            .connect(this._createBufferRuntime(gl, buffers));
        const vertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._vertexData, BufferUsage.DynamicDraw)
            .connect(this._createBufferRuntime(gl, buffers));

        // Force the shader's first finalize so attribute locations are
        // available immediately (the async-compile path defers extraction
        // to first sync(), but we need attributes here for VAO setup).
        this._shader.sync();

        const vao = new WebGl2VertexArrayObject()
            .addIndex(indexBuffer)
            .addAttribute(vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
            .addAttribute(vertexBuffer, this._shader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
            .addAttribute(vertexBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, vertexStrideBytes, 16)
            .connect(this._createVaoRuntime(gl, vaoHandle));

        this._connection = { gl, vao, vertexBuffer, indexBuffer };
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

    private _createBufferRuntime(
        gl: WebGL2RenderingContext,
        buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number; }>,
    ): WebGl2RenderBufferRuntime {
        const handle = gl.createBuffer();

        if (handle === null) {
            throw new Error('Could not create render buffer.');
        }

        return {
            bind: (buffer: WebGl2RenderBuffer): void => {
                gl.bindBuffer(buffer.type, handle);
            },
            upload: (buffer: WebGl2RenderBuffer, offset: number): void => {
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
            destroy: (buffer: WebGl2RenderBuffer): void => {
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
