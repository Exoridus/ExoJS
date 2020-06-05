import type { RenderBuffer } from 'rendering/RenderBuffer';
import { VertexArrayObject } from 'rendering/VertexArrayObject';
import type { ParticleSystem } from './ParticleSystem';
import vertexSource from "./glsl/particle.vert";
import fragmentSource from "./glsl/particle.frag";
import { AbstractRenderer } from "rendering/AbstractRenderer";
import type { View } from "rendering/View";

export class ParticleRenderer extends AbstractRenderer {

    public constructor(batchSize: number) {

        /**
         * 4 x 9 Attributes:
         * 2 = vertexPos     (x, y) +
         * 1 = texCoord (packed uv) +
         * 2 = position      (x, y) +
         * 2 = scale         (x, y) +
         * 1 = rotation      (x, y) +
         * 1 = color         (ARGB int)
         */
        super(batchSize, 36, vertexSource, fragmentSource);
    }

    public render(system: ParticleSystem): this {
        const { texture, vertices, texCoords, particles, blendMode } = system;
        const textureChanged = (texture !== this.currentTexture);
        const blendModeChanged = (blendMode !== this.currentBlendMode);
        const float32View = this.float32View;
        const uint32View = this.uint32View;

        if (textureChanged || blendModeChanged) {
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

        texture.update();

        for (const particle of particles) {
            if (this.batchIndex >= this.batchSize) {
                this.flush();
            }

            const { position, scale, rotation, tint } = particle;
            const index = (this.batchIndex * this.attributeCount);

            float32View[index + 0] = float32View[index + 27] = vertices[0];
            float32View[index + 1] = float32View[index + 10] = vertices[1];
            float32View[index + 9] = float32View[index + 18] = vertices[2];
            float32View[index + 19] = float32View[index + 28] = vertices[3];

            uint32View[index + 2] = texCoords[0];
            uint32View[index + 11] = texCoords[1];
            uint32View[index + 20] = texCoords[2];
            uint32View[index + 29] = texCoords[3];

            float32View[index + 3]
                = float32View[index + 12]
                = float32View[index + 21]
                = float32View[index + 30]
                = position.x;

            float32View[index + 4]
                = float32View[index + 13]
                = float32View[index + 22]
                = float32View[index + 31]
                = position.y;

            float32View[index + 5]
                = float32View[index + 14]
                = float32View[index + 23]
                = float32View[index + 32]
                = scale.x;

            float32View[index + 6]
                = float32View[index + 15]
                = float32View[index + 24]
                = float32View[index + 33]
                = scale.y;

            float32View[index + 7]
                = float32View[index + 16]
                = float32View[index + 25]
                = float32View[index + 34]
                = rotation;

            uint32View[index + 8]
                = uint32View[index + 17]
                = uint32View[index + 26]
                = uint32View[index + 35]
                = tint.toRGBA();

            this.batchIndex++;
        }

        return this;
    }

    protected createVAO(gl: WebGL2RenderingContext, indexBuffer: RenderBuffer, vertexBuffer: RenderBuffer): VertexArrayObject {
        return new VertexArrayObject(gl)
            .addIndex(indexBuffer)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_position'), gl.FLOAT, false, this.attributeCount, 0)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_texcoord'), gl.UNSIGNED_SHORT, true, this.attributeCount, 8)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_translation'), gl.FLOAT, false, this.attributeCount, 12)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_scale'), gl.FLOAT, false, this.attributeCount, 20)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_rotation'), gl.FLOAT, false, this.attributeCount, 28)
            .addAttribute(vertexBuffer, this.shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, this.attributeCount, 32);
    }

    protected updateView(view: View): this {
        this.shader
            .getUniform('u_projection')
            .setValue(view.getTransform().toArray(false));

        return this;
    }
}
