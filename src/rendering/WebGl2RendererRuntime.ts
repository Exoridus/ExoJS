import type { BlendModes } from 'types/rendering';
import type { RenderBackendType } from './RenderBackendType';
import type { SceneRenderRuntime } from './SceneRenderRuntime';
import type { Shader } from './shader/Shader';
import type { VertexArrayObject } from './VertexArrayObject';
import type { Texture } from './texture/Texture';
import type { RenderTexture } from './texture/RenderTexture';

export interface WebGl2RendererRuntime extends SceneRenderRuntime {
    readonly backendType: RenderBackendType.WebGl2;
    readonly context: WebGL2RenderingContext;

    bindShader(shader: Shader | null): this;
    bindVertexArrayObject(vao: VertexArrayObject | null): this;
    bindTexture(texture: Texture | RenderTexture | null, unit?: number): this;
    setBlendMode(blendMode: BlendModes | null): this;
}
