import type { BlendModes } from 'types/rendering';
import type { IRenderer, RendererType } from './IRenderer';
import type { Shader } from './shader/Shader';
import type { RenderTexture } from './texture/RenderTexture';
import type { Texture } from './texture/Texture';
import type { VertexArrayObject } from './VertexArrayObject';
import type { View } from './View';

export interface IRenderBackend {
    readonly view: View;

    getRenderer(name: RendererType): IRenderer;
    setRenderer(renderer: IRenderer | null): this;

    /**
     * Stage 0 debt: shader/program binding stays WebGL-shaped for now.
     */
    setShader(shader: Shader | null): this;

    /**
     * Stage 0 debt: texture binding stays WebGL-shaped for now.
     */
    setTexture(texture: Texture | RenderTexture | null, unit?: number): this;

    setBlendMode(blendMode: BlendModes | null): this;

    /**
     * Stage 0 debt: VAO binding stays WebGL-shaped for now.
     */
    setVao(vao: VertexArrayObject | null): this;
}
