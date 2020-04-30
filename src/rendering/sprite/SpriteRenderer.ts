import { VertexArrayObject } from 'rendering/VertexArrayObject';
import { RenderBuffer } from 'rendering/RenderBuffer';
import { Sprite } from 'rendering/sprite/Sprite';
import vertexSource from "rendering/sprite/glsl/sprite.vert";
import fragmentSource from "rendering/sprite/glsl/sprite.frag";
import { AbstractRenderer } from "rendering/AbstractRenderer";

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

    public createVAO(gl: WebGL2RenderingContext, indexBuffer: RenderBuffer, vertexBuffer: RenderBuffer): VertexArrayObject {
        return new VertexArrayObject(gl)
            .addIndex(indexBuffer)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_position'), gl.FLOAT, false, this.attributeCount, 0)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_texcoord'), gl.UNSIGNED_SHORT, true, this.attributeCount, 8)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, this.attributeCount, 12);
    }

    public render(sprite: Sprite) {
        const { texture, blendMode, tint, vertices, texCoords } = sprite,
            batchFull = (this.batchIndex >= this.batchSize),
            textureChanged = (texture !== this.currentTexture),
            blendModeChanged = (blendMode !== this.currentBlendMode),
            flush = (batchFull || textureChanged || blendModeChanged),
            index = flush ? 0 : (this.batchIndex * this.attributeCount),
            float32View = this.float32View,
            uint32View = this.uint32View;

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
}
