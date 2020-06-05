import { VertexArrayObject } from 'rendering/VertexArrayObject';
import type { RenderBuffer } from 'rendering/RenderBuffer';
import type { Sprite } from 'rendering/sprite/Sprite';
import { AbstractRenderer } from "rendering/AbstractRenderer";
import type { View } from "rendering/View";
import vertexSource from "rendering/sprite/glsl/sprite.vert";
import fragmentSource from "rendering/sprite/glsl/sprite.frag";

export class SpriteRenderer extends AbstractRenderer {

    constructor(batchSize: number) {

        /**
         * 4 x 4 Attributes:
         * 2 = position (x, y) +
         * 1 = texCoord (packed uv) +
         * 1 = color    (ARGB int)
         */
        super(batchSize, 16, vertexSource, fragmentSource);
    }

    public render(sprite: Sprite): this {
        const { texture, blendMode, tint, vertices, texCoords } = sprite;
        const batchFull = (this.batchIndex >= this.batchSize);
        const textureChanged = (texture !== this.currentTexture);
        const blendModeChanged = (blendMode !== this.currentBlendMode);
        const flush = (batchFull || textureChanged || blendModeChanged);
        const index = flush ? 0 : (this.batchIndex * this.attributeCount);
        const float32View = this.float32View;
        const uint32View = this.uint32View;

        if (flush) {
            this.flush();

            if (textureChanged) {
                this.currentTexture = texture;
                this.renderManager!.setTexture(texture);
            }

            if (blendModeChanged) {
                this.currentBlendMode = blendMode;
                this.renderManager!.setBlendMode(blendMode);
            }
        }

        if (texture) {
            texture.update();
        }

        // X / Y
        float32View[index + 0] = vertices[0];
        float32View[index + 1] = vertices[1];

        // X / Y
        float32View[index + 4] = vertices[2];
        float32View[index + 5] = vertices[3];

        // X / Y
        float32View[index + 8] = vertices[4];
        float32View[index + 9] = vertices[5];

        // X / Y
        float32View[index + 12] = vertices[6];
        float32View[index + 13] = vertices[7];

        // U / V
        uint32View[index + 2] = texCoords[0];
        uint32View[index + 6] = texCoords[1];

        // U / V
        uint32View[index + 10] = texCoords[2];
        uint32View[index + 14] = texCoords[3];

        // Tint
        uint32View[index + 3]
            = uint32View[index + 7]
            = uint32View[index + 11]
            = uint32View[index + 15]
            = tint.toRGBA();

        this.batchIndex++;

        return this;
    }

    protected createVAO(gl: WebGL2RenderingContext, indexBuffer: RenderBuffer, vertexBuffer: RenderBuffer): VertexArrayObject {
        return new VertexArrayObject(gl)
            .addIndex(indexBuffer)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_position'), gl.FLOAT, false, this.attributeCount, 0)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_texcoord'), gl.UNSIGNED_SHORT, true, this.attributeCount, 8)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, this.attributeCount, 12);
    }

    protected updateView(view: View): this {
        this.shader
            .getUniform('u_projection')
            .setValue(view.getTransform().toArray(false));

        return this;
    }
}
