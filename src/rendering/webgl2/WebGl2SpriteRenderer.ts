import { WebGl2VertexArrayObject } from './WebGl2VertexArrayObject';
import type { WebGl2RenderBuffer } from './WebGl2RenderBuffer';
import type { Sprite } from '../sprite/Sprite';
import { AbstractWebGl2BatchedRenderer } from './AbstractWebGl2BatchedRenderer';
import type { View } from '../View';
import type { WebGl2RendererRuntime } from './WebGl2RendererRuntime';
import type { Texture } from '../texture/Texture';
import type { RenderTexture } from '../texture/RenderTexture';
import vertexSource from './glsl/sprite.vert';
import fragmentSource from './glsl/sprite.frag';

/**
 * Multi-texture sprite batching for WebGL2.
 *
 * Each batch carries up to {@link maxBatchTextures} textures bound to
 * texture units 0..N-1. Per-vertex `a_textureSlot` selects which sampler
 * the fragment shader reads from. A batch flushes when the batch buffer
 * fills, the blend mode changes, or all texture slots are taken and a
 * new texture arrives.
 *
 * Vertex layout (20 bytes per vertex, 5 attributes × 4 verts per quad):
 *   - position    vec2 f32  (offset 0,  8 bytes)
 *   - texcoord    u16x2     (offset 8,  4 bytes, normalised UV)
 *   - color       u8x4      (offset 12, 4 bytes, normalised RGBA)
 *   - textureSlot u32       (offset 16, 4 bytes)
 */

const maxBatchTextures = 8;
const attributesPerQuad = 20;
const attributesPerVertex = attributesPerQuad / 4;

export class WebGl2SpriteRenderer extends AbstractWebGl2BatchedRenderer {

    private readonly _activeTextures: Array<Texture | RenderTexture | null> = new Array(maxBatchTextures).fill(null);
    private readonly _textureSlots: Map<Texture | RenderTexture, number> = new Map();
    private _slotCount = 0;

    public constructor(batchSize: number) {
        super(batchSize, attributesPerQuad, vertexSource, fragmentSource);
    }

    public override render(sprite: Sprite): this {
        const { texture, blendMode, tint, vertices, texCoords } = sprite;

        // Sprites without a texture are not drawable in this pipeline:
        // every sample slot maps to a real texture binding, and the
        // shader unconditionally samples one of them. Skip silently —
        // matches the implicit no-op of the pre-multi-texture path,
        // where a null texture also produced no draw.
        if (texture === null) {
            return this;
        }

        const runtime = this.getRuntime();
        const batchFull = (this.batchIndex >= this.batchSize);
        const blendModeChanged = (blendMode !== this.currentBlendMode);
        const slotExhausted = !this._textureSlots.has(texture) && this._slotCount >= maxBatchTextures;
        const flush = batchFull || blendModeChanged || slotExhausted;

        if (flush) {
            this.flush();

            if (blendModeChanged) {
                this.currentBlendMode = blendMode;
                runtime.setBlendMode(blendMode);
            }
        }

        let slot = this._textureSlots.get(texture);

        if (slot === undefined) {
            slot = this._slotCount++;
            this._textureSlots.set(texture, slot);
            this._activeTextures[slot] = texture;
            runtime.bindTexture(texture, slot);
        }

        const index = this.batchIndex * this.attributeCount;
        const float32View = this.float32View;
        const uint32View = this.uint32View;
        const packedColor = tint.toRgba();

        // Vertex 0
        float32View[index + 0] = vertices[0];
        float32View[index + 1] = vertices[1];
        uint32View[index + 2] = texCoords[0];
        uint32View[index + 3] = packedColor;
        uint32View[index + 4] = slot;

        // Vertex 1
        float32View[index + 5] = vertices[2];
        float32View[index + 6] = vertices[3];
        uint32View[index + 7] = texCoords[1];
        uint32View[index + 8] = packedColor;
        uint32View[index + 9] = slot;

        // Vertex 2
        float32View[index + 10] = vertices[4];
        float32View[index + 11] = vertices[5];
        uint32View[index + 12] = texCoords[2];
        uint32View[index + 13] = packedColor;
        uint32View[index + 14] = slot;

        // Vertex 3
        float32View[index + 15] = vertices[6];
        float32View[index + 16] = vertices[7];
        uint32View[index + 17] = texCoords[3];
        uint32View[index + 18] = packedColor;
        uint32View[index + 19] = slot;

        this.batchIndex++;

        return this;
    }

    public override flush(): void {
        super.flush();

        // Slot reservations are batch-scoped: every flush starts a new
        // batch with zero textures bound. We don't gl.bindTexture(null)
        // each slot — leaving stale handles bound is harmless, the next
        // batch will overwrite them as it claims slots.
        if (this._slotCount > 0) {
            for (let i = 0; i < this._slotCount; i++) {
                this._activeTextures[i] = null;
            }

            this._textureSlots.clear();
            this._slotCount = 0;
        }
    }

    protected override onConnect(runtime: WebGl2RendererRuntime): void {
        super.onConnect(runtime);

        // Pin each `u_textureN` sampler uniform to its matching texture
        // unit so the fragment shader's per-slot if-chain reads from the
        // unit the renderer's bindTexture(unit) calls will populate.
        // (The base class already triggered shader.sync() before VAO
        // setup, so the uniform table is populated by the time we get
        // here.)
        const samplerUnit = new Int32Array(1);

        for (let i = 0; i < maxBatchTextures; i++) {
            samplerUnit[0] = i;
            this.shader.getUniform(`u_texture${i}`).setValue(samplerUnit);
        }
    }

    protected createVao(gl: WebGL2RenderingContext, indexBuffer: WebGl2RenderBuffer, vertexBuffer: WebGl2RenderBuffer): WebGl2VertexArrayObject {
        const stride = attributesPerVertex * Uint32Array.BYTES_PER_ELEMENT;

        return new WebGl2VertexArrayObject()
            .addIndex(indexBuffer)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_position'),    gl.FLOAT,          false, stride, 0)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_texcoord'),    gl.UNSIGNED_SHORT, true,  stride, 8)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_color'),       gl.UNSIGNED_BYTE,  true,  stride, 12)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_textureSlot'), gl.UNSIGNED_INT,   false, stride, 16, true);
    }

    protected updateView(view: View): this {
        this.shader
            .getUniform('u_projection')
            .setValue(view.getTransform().toArray(false));

        return this;
    }
}
