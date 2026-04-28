import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import { Shader } from '../shader/Shader';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '@/rendering/types';
import type { Sprite } from '../sprite/Sprite';
import type { Texture } from '../texture/Texture';
import type { RenderTexture } from '../texture/RenderTexture';
import type { View } from '../View';
import type { BlendModes } from '@/rendering/types';
import type { WebGl2Backend } from './WebGl2Backend';
import vertexSource from './glsl/sprite.vert';
import fragmentSource from './glsl/sprite.frag';

/**
 * Instanced sprite renderer for WebGL2.
 *
 * Each batch issues a single `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, N)`
 * with no per-vertex buffer — `gl_VertexID` 0..3 selects which corner of
 * the quad each invocation is computing. All per-sprite data lives in a
 * single per-instance buffer (divisor = 1).
 *
 * Per-instance layout (56 bytes per sprite, 6 attributes):
 * ```
 *   localBounds    f32x4       (offset  0, 16 bytes)  — left, top, right, bottom
 *   transformAB    f32x3       (offset 16, 12 bytes)  — first  row of 2D affine
 *   transformCD    f32x3       (offset 28, 12 bytes)  — second row of 2D affine
 *   uvBounds       u16x4 norm  (offset 40,  8 bytes)  — uMin, vMin, uMax, vMax
 *   color          u8x4  norm  (offset 48,  4 bytes)  — RGBA tint
 *   textureSlot    u32         (offset 52,  4 bytes)  — multi-texture slot
 * ```
 *
 * vs. the previous per-vertex layout (80 bytes per quad), this saves
 * roughly 30% bandwidth and ~75% of the CPU writes per sprite — the
 * vertex shader expands one instance into four corners on the GPU
 * instead of the CPU duplicating the same color/slot/transform across
 * four vertex entries.
 */

const maxBatchTextures = 8;
const instanceStrideBytes = 56;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;

interface SpriteRendererConnection {
    readonly gl: WebGL2RenderingContext;
    readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number; }>;
    readonly vaoHandle: WebGLVertexArrayObject;
}

export class WebGl2SpriteRenderer extends AbstractWebGl2Renderer<Sprite> {

    private readonly _shader: Shader;
    private readonly _batchSize: number;
    private readonly _instanceData: ArrayBuffer;
    private readonly _instanceFloat32: Float32Array;
    private readonly _instanceUint32: Uint32Array;

    private readonly _activeTextures: Array<Texture | RenderTexture | null> = new Array(maxBatchTextures).fill(null);
    private readonly _textureSlots: Map<Texture | RenderTexture, number> = new Map();
    private _slotCount = 0;

    private _instanceCount = 0;
    private _currentBlendMode: BlendModes | null = null;
    private _currentView: View | null = null;
    private _currentViewId = -1;

    private _instanceBuffer: WebGl2RenderBuffer | null = null;
    private _vao: WebGl2VertexArrayObject | null = null;
    private _connection: SpriteRendererConnection | null = null;

    public constructor(batchSize: number) {
        super();

        this._batchSize = batchSize;
        this._shader = new Shader(vertexSource, fragmentSource);
        this._instanceData = new ArrayBuffer(batchSize * instanceStrideBytes);
        this._instanceFloat32 = new Float32Array(this._instanceData);
        this._instanceUint32 = new Uint32Array(this._instanceData);
    }

    public render(sprite: Sprite): this {
        const texture = sprite.texture;

        if (texture === null) {
            return this;
        }

        const backend = this.getBackend();
        const blendMode = sprite.blendMode;
        const batchFull = this._instanceCount >= this._batchSize;
        const blendModeChanged = blendMode !== this._currentBlendMode;
        const slotExhausted = !this._textureSlots.has(texture) && this._slotCount >= maxBatchTextures;

        if (batchFull || blendModeChanged || slotExhausted) {
            this.flush();

            if (blendModeChanged) {
                this._currentBlendMode = blendMode;
                backend.setBlendMode(blendMode);
            }
        }

        let slot = this._textureSlots.get(texture);

        if (slot === undefined) {
            slot = this._slotCount++;
            this._textureSlots.set(texture, slot);
            this._activeTextures[slot] = texture;
            backend.bindTexture(texture, slot);
        }

        const offset = this._instanceCount * wordsPerInstance;
        const f32 = this._instanceFloat32;
        const u32 = this._instanceUint32;

        // localBounds: left, top, right, bottom (offset 0..3)
        const bounds = sprite.getLocalBounds();

        f32[offset + 0] = bounds.left;
        f32[offset + 1] = bounds.top;
        f32[offset + 2] = bounds.right;
        f32[offset + 3] = bounds.bottom;

        // transform rows (offset 4..6 = AB, 7..9 = CD)
        const transform = sprite.getGlobalTransform();

        f32[offset + 4] = transform.a;
        f32[offset + 5] = transform.b;
        f32[offset + 6] = transform.x;
        f32[offset + 7] = transform.c;
        f32[offset + 8] = transform.d;
        f32[offset + 9] = transform.y;

        // uvBounds at offset 10 — 8 bytes = 2 u32 slots, normalised u16x4.
        // Pack (uMin, vMin, uMax, vMax) into two uint32s, with flipY swap
        // applied at pack time so the shader can stay flip-agnostic.
        const frame = sprite.textureFrame;
        const texWidth = texture.width;
        const texHeight = texture.height;
        // Clamp to 16-bit unsigned range for normalisation.
        const uMin = (frame.left   / texWidth)  * 0xFFFF & 0xFFFF;
        const uMax = (frame.right  / texWidth)  * 0xFFFF & 0xFFFF;
        const vMinRaw = (frame.top    / texHeight) * 0xFFFF & 0xFFFF;
        const vMaxRaw = (frame.bottom / texHeight) * 0xFFFF & 0xFFFF;
        const vMin = texture.flipY ? vMaxRaw : vMinRaw;
        const vMax = texture.flipY ? vMinRaw : vMaxRaw;

        u32[offset + 10] = uMin | (vMin << 16);
        u32[offset + 11] = uMax | (vMax << 16);

        // color (u8x4 packed) at word 12
        u32[offset + 12] = sprite.tint.toRgba();

        // textureSlot (u32) at word 13
        u32[offset + 13] = slot;

        this._instanceCount++;

        return this;
    }

    public flush(): void {
        const backend = this.getBackendOrNull();
        const instanceBuffer = this._instanceBuffer;
        const vao = this._vao;

        if (this._instanceCount === 0 || backend === null || instanceBuffer === null || vao === null) {
            this._resetSlots();

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
        vao.drawInstanced(4, 0, this._instanceCount, RenderingPrimitives.TriangleStrip);
        backend.stats.batches++;
        backend.stats.drawCalls++;
        this._instanceCount = 0;

        this._resetSlots();
    }

    protected onConnect(backend: WebGl2Backend): void {
        const gl = backend.context;

        this._shader.connect(createWebGl2ShaderProgram(gl));
        this._connection = this._createConnection(gl);
        this._instanceBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._instanceData, BufferUsage.DynamicDraw)
            .connect(this._createBufferRuntime(this._connection));
        this._shader.sync();

        this._vao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_localBounds'),  gl.FLOAT,          false, instanceStrideBytes,  0, false, 1)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_transformAB'),  gl.FLOAT,          false, instanceStrideBytes, 16, false, 1)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_transformCD'),  gl.FLOAT,          false, instanceStrideBytes, 28, false, 1)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_uvBounds'),     gl.UNSIGNED_SHORT, true,  instanceStrideBytes, 40, false, 1)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_color'),        gl.UNSIGNED_BYTE,  true,  instanceStrideBytes, 48, false, 1)
            .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_textureSlot'),  gl.UNSIGNED_INT,   false, instanceStrideBytes, 52, true,  1)
            .connect(this._createVaoRuntime(this._connection));

        // Pin the per-slot sampler uniforms to texture units 0..N-1.
        const samplerUnit = new Int32Array(1);

        for (let i = 0; i < maxBatchTextures; i++) {
            samplerUnit[0] = i;
            this._shader.getUniform(`u_texture${i}`).setValue(samplerUnit);
        }
    }

    protected onDisconnect(): void {
        this._shader.disconnect();
        this._instanceBuffer?.destroy();
        this._instanceBuffer = null;
        this._vao?.destroy();
        this._vao = null;
        this._connection = null;
        this._currentBlendMode = null;
        this._currentView = null;
        this._currentViewId = -1;
        this._instanceCount = 0;
    }

    public destroy(): void {
        this.disconnect();
        this._shader.destroy();
    }

    private _resetSlots(): void {
        if (this._slotCount > 0) {
            for (let i = 0; i < this._slotCount; i++) {
                this._activeTextures[i] = null;
            }

            this._textureSlots.clear();
            this._slotCount = 0;
        }
    }

    private _createConnection(gl: WebGL2RenderingContext): SpriteRendererConnection {
        const vaoHandle = gl.createVertexArray();

        if (vaoHandle === null) {
            throw new Error('WebGl2SpriteRenderer: could not create vertex array object.');
        }

        return {
            gl,
            buffers: new Map(),
            vaoHandle,
        };
    }

    private _createBufferRuntime(connection: SpriteRendererConnection): WebGl2RenderBufferRuntime {
        const handle = connection.gl.createBuffer();

        if (handle === null) {
            throw new Error('WebGl2SpriteRenderer: could not create render buffer.');
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

    private _createVaoRuntime(connection: SpriteRendererConnection): WebGl2VertexArrayObjectRuntime {
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

                    appliedVersion = vao.version;
                }
            },
            unbind: (): void => {
                connection.gl.bindVertexArray(null);
            },
            draw: (vao, size, start, type): void => {
                connection.gl.drawArrays(type, start, size);
            },
            drawInstanced: (_vao, count, start, instanceCount, type): void => {
                connection.gl.drawArraysInstanced(type, start, count, instanceCount);
            },
            destroy: (vao): void => {
                connection.gl.deleteVertexArray(connection.vaoHandle);
                vao.disconnect();
            },
        };
    }
}
