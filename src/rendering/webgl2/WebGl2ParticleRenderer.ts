import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import { Shader } from '../shader/Shader';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '@/rendering/types';
import type { ParticleSystem } from '@/particles/ParticleSystem';
import type { Texture } from '../texture/Texture';
import type { View } from '../View';
import type { BlendModes } from '@/rendering/types';
import type { WebGl2Backend } from './WebGl2Backend';
import vertexSource from './glsl/particle.vert';
import fragmentSource from './glsl/particle.frag';

/**
 * Instanced particle renderer for WebGL2.
 *
 * One ParticleSystem = one batch. Each `render(system)` flushes any
 * pending batch, sets the system-level uniforms (transform, local
 * bounds, UV bounds, texture), and packs every active particle into
 * the per-instance buffer. The next `flush()` issues a single
 * `drawElementsInstanced` for that system.
 *
 * Per-instance layout (24 bytes per particle, 4 attributes):
 * ```
 *   translation  f32x2  (offset  0,  8 bytes)  particle position (system-local)
 *   scale        f32x2  (offset  8,  8 bytes)
 *   rotation     f32    (offset 16,  4 bytes)  degrees
 *   color        u8x4   (offset 20,  4 bytes)  RGBA tint, normalised
 * ```
 *
 * vs the previous per-vertex layout (36 bytes per vertex × 4 verts =
 * 144 bytes per particle), this is an 83% bandwidth reduction and
 * roughly 80% fewer CPU writes per particle (one pack call vs four
 * duplicated vertex writes plus per-corner UV coords).
 *
 * The system transform stays as a uniform — mixing systems in one
 * batch would require either a per-instance transform matrix (more
 * bandwidth) or per-particle texture-slot indexing (multi-texture
 * support similar to the sprite renderer). Both are follow-ups; the
 * current pattern keeps the renderer focused on the per-particle win.
 */

const instanceStrideBytes = 24;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
const indicesPerQuad = 6;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

interface ParticleRendererConnection {
    readonly gl: WebGL2RenderingContext;
    readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number; }>;
    readonly vaoHandle: WebGLVertexArrayObject;
}

export class WebGl2ParticleRenderer extends AbstractWebGl2Renderer<ParticleSystem> {

    private readonly _shader: Shader;
    private readonly _batchSize: number;
    private readonly _instanceData: ArrayBuffer;
    private readonly _instanceFloat32: Float32Array;
    private readonly _instanceUint32: Uint32Array;

    private _instanceCount = 0;
    private _currentTexture: Texture | null = null;
    private _currentBlendMode: BlendModes | null = null;
    private _currentView: View | null = null;
    private _currentViewId = -1;

    private _instanceBuffer: WebGl2RenderBuffer | null = null;
    private _indexBuffer: WebGl2RenderBuffer | null = null;
    private _vao: WebGl2VertexArrayObject | null = null;
    private _connection: ParticleRendererConnection | null = null;

    public constructor(batchSize: number) {
        super();

        this._batchSize = batchSize;
        this._shader = new Shader(vertexSource, fragmentSource);
        this._instanceData = new ArrayBuffer(batchSize * instanceStrideBytes);
        this._instanceFloat32 = new Float32Array(this._instanceData);
        this._instanceUint32 = new Uint32Array(this._instanceData);
    }

    public render(system: ParticleSystem): this {
        const backend = this.getBackend();
        const { texture, particles, blendMode } = system;
        const textureChanged = texture !== this._currentTexture;
        const blendModeChanged = blendMode !== this._currentBlendMode;

        // System transform / texture / UV / local-bounds are uniforms, so
        // mixing systems in one batch is invalid. Flush any prior system
        // before setting up this one.
        this.flush();

        if (textureChanged) {
            this._currentTexture = texture;
            backend.bindTexture(texture);
        }

        if (blendModeChanged) {
            this._currentBlendMode = blendMode;
            backend.setBlendMode(blendMode);
        }

        // System-level uniforms are set before packing so the eventual
        // flush() can sync them in one go.
        const localBounds = system.vertices;
        const uvBounds = this._unpackUvBounds(system);

        this._shader
            .getUniform('u_systemTransform')
            .setValue(system.getGlobalTransform().toArray(false));
        this._shader
            .getUniform('u_localBounds')
            .setValue(localBounds);
        this._shader
            .getUniform('u_uvBounds')
            .setValue(uvBounds);

        const f32 = this._instanceFloat32;
        const u32 = this._instanceUint32;
        const limit = Math.min(particles.length, this._batchSize);

        for (let i = 0; i < limit; i++) {
            const particle = particles[i];
            const offset = i * wordsPerInstance;

            f32[offset + 0] = particle.position.x;
            f32[offset + 1] = particle.position.y;
            f32[offset + 2] = particle.scale.x;
            f32[offset + 3] = particle.scale.y;
            f32[offset + 4] = particle.rotation;
            u32[offset + 5] = particle.tint.toRgba();
        }

        this._instanceCount = limit;

        return this;
    }

    public flush(): void {
        const backend = this.getBackendOrNull();
        const instanceBuffer = this._instanceBuffer;
        const indexBuffer = this._indexBuffer;
        const vao = this._vao;

        if (this._instanceCount === 0 || backend === null || instanceBuffer === null || indexBuffer === null || vao === null) {
            return;
        }

        const view = backend.view;

        if (this._currentView !== view || this._currentViewId !== view.updateId) {
            this._currentView = view;
            this._currentViewId = view.updateId;
            this._shader
                .getUniform('u_projection')
                .setValue(view.getTransform().toArray(false));
        }

        this._shader.sync();
        backend.bindVertexArrayObject(vao);
        instanceBuffer.upload(this._instanceFloat32.subarray(0, this._instanceCount * wordsPerInstance));
        vao.drawInstanced(indicesPerQuad, 0, this._instanceCount, RenderingPrimitives.Triangles);
        backend.stats.batches++;
        backend.stats.drawCalls++;

        this._instanceCount = 0;
    }

    protected onConnect(backend: WebGl2Backend): void {
        const gl = backend.context;

        this._shader.connect(createWebGl2ShaderProgram(gl));
        this._connection = this._createConnection(gl);

        this._indexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, quadIndices, BufferUsage.StaticDraw)
            .connect(this._createBufferRuntime(this._connection));
        this._instanceBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._instanceData, BufferUsage.DynamicDraw)
            .connect(this._createBufferRuntime(this._connection));

        this._shader.sync();

        this._vao = new WebGl2VertexArrayObject()
            .addIndex(this._indexBuffer)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_translation'), gl.FLOAT,         false, instanceStrideBytes,  0, false, 1)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_scale'),       gl.FLOAT,         false, instanceStrideBytes,  8, false, 1)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_rotation'),    gl.FLOAT,         false, instanceStrideBytes, 16, false, 1)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_color'),       gl.UNSIGNED_BYTE, true,  instanceStrideBytes, 20, false, 1)
            .connect(this._createVaoRuntime(this._connection));
    }

    protected onDisconnect(): void {
        this._shader.disconnect();
        this._instanceBuffer?.destroy();
        this._instanceBuffer = null;
        this._indexBuffer?.destroy();
        this._indexBuffer = null;
        this._vao?.destroy();
        this._vao = null;
        this._connection = null;
        this._currentTexture = null;
        this._currentBlendMode = null;
        this._currentView = null;
        this._currentViewId = -1;
        this._instanceCount = 0;
    }

    public destroy(): void {
        this.disconnect();
        this._shader.destroy();
    }

    /**
     * Convert the system's per-corner packed-u32 texCoords into the
     * (uMin, vMin, uMax, vMax) bounds the new vertex shader expects.
     * Already accounts for flipY (the system's `texCoords` baked it in).
     *
     * The four packed u32s, by corner index, are:
     *   [0] TL = (uMin/uMax | vMin/vMax depending on flipY)
     *   [1] TR
     *   [2] BR
     *   [3] BL
     * We need (uMin, vMin, uMax, vMax) — the corner-extreme values.
     */
    private _uvBoundsScratch = new Float32Array(4);
    private _unpackUvBounds(system: ParticleSystem): Float32Array {
        const texCoords = system.texCoords;
        // Each packed u32: low 16 bits = U normalised to 0..65535,
        //                  high 16 bits = V normalised.
        const uTopLeft = (texCoords[0] & 0xFFFF) / 0xFFFF;
        const vTopLeft = ((texCoords[0] >>> 16) & 0xFFFF) / 0xFFFF;
        const uBottomRight = (texCoords[2] & 0xFFFF) / 0xFFFF;
        const vBottomRight = ((texCoords[2] >>> 16) & 0xFFFF) / 0xFFFF;

        // For flipY: TL.v becomes vMax (was minY → maxY). The shader picks
        // (cornerY == 0 ? vMin : vMax); writing TL.v into vMin and BR.v into
        // vMax matches the original per-corner ordering whether or not flipY
        // was applied at texCoords pack time.
        this._uvBoundsScratch[0] = uTopLeft;
        this._uvBoundsScratch[1] = vTopLeft;
        this._uvBoundsScratch[2] = uBottomRight;
        this._uvBoundsScratch[3] = vBottomRight;

        return this._uvBoundsScratch;
    }

    private _createConnection(gl: WebGL2RenderingContext): ParticleRendererConnection {
        const vaoHandle = gl.createVertexArray();

        if (vaoHandle === null) {
            throw new Error('WebGl2ParticleRenderer: could not create vertex array object.');
        }

        return {
            gl,
            buffers: new Map(),
            vaoHandle,
        };
    }

    private _createBufferRuntime(connection: ParticleRendererConnection): WebGl2RenderBufferRuntime {
        const handle = connection.gl.createBuffer();

        if (handle === null) {
            throw new Error('WebGl2ParticleRenderer: could not create render buffer.');
        }

        return {
            bind: (buffer): void => {
                connection.gl.bindBuffer(buffer.type, handle);
            },
            upload: (buffer, offset): void => {
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
            destroy: (buffer): void => {
                connection.gl.deleteBuffer(handle);
                connection.buffers.delete(buffer);
                buffer.disconnect();
            },
        };
    }

    private _createVaoRuntime(connection: ParticleRendererConnection): WebGl2VertexArrayObjectRuntime {
        let appliedVersion = -1;

        return {
            bind: (vao): void => {
                const gl = connection.gl;

                gl.bindVertexArray(connection.vaoHandle);

                if (appliedVersion !== vao.version) {
                    let lastBuffer: WebGl2RenderBuffer | null = null;

                    for (const attribute of vao.attributes) {
                        if (lastBuffer !== attribute.buffer) {
                            attribute.buffer.bind();
                            lastBuffer = attribute.buffer;
                        }

                        if (attribute.integer) {
                            gl.vertexAttribIPointer(attribute.location, attribute.size, attribute.type, attribute.stride, attribute.start);
                        } else {
                            gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
                        }

                        gl.enableVertexAttribArray(attribute.location);
                        gl.vertexAttribDivisor(attribute.location, attribute.divisor);
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
            draw: (vao, size, start, type): void => {
                const gl = connection.gl;

                if (vao.indexBuffer) {
                    gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
                } else {
                    gl.drawArrays(type, start, size);
                }
            },
            drawInstanced: (vao, count, start, instanceCount, type): void => {
                const gl = connection.gl;

                if (vao.indexBuffer) {
                    gl.drawElementsInstanced(type, count, gl.UNSIGNED_SHORT, start, instanceCount);
                } else {
                    gl.drawArraysInstanced(type, start, count, instanceCount);
                }
            },
            destroy: (vao): void => {
                connection.gl.deleteVertexArray(connection.vaoHandle);
                vao.disconnect();
            },
        };
    }
}
