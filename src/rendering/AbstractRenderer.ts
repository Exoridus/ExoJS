import type { IRenderer } from 'rendering/IRenderer';
import { Shader } from 'rendering/shader/Shader';
import type { VertexArrayObject } from 'rendering/VertexArrayObject';
import { RenderBuffer } from 'rendering/RenderBuffer';
import { createQuadIndices } from 'utils/rendering';
import type { Texture } from 'rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage } from 'types/rendering';
import type { View } from 'rendering/View';
import type { RenderManager } from 'rendering/RenderManager';
import type { RenderTexture } from 'rendering/texture/RenderTexture';
import type { Drawable } from 'rendering/Drawable';

export abstract class AbstractRenderer implements IRenderer {
    protected readonly attributeCount: number;
    protected readonly batchSize: number;
    protected readonly indexData: Uint16Array;
    protected readonly vertexData: ArrayBuffer;
    protected readonly float32View: Float32Array;
    protected readonly uint32View: Uint32Array;
    protected readonly shader: Shader;
    protected batchIndex = 0;
    protected renderManager: RenderManager | null = null;
    protected gl: WebGL2RenderingContext | null = null;
    protected currentTexture: Texture | RenderTexture | null = null;
    protected currentBlendMode: BlendModes | null = null;
    protected currentView: View | null = null;
    protected currentViewId = -1;
    protected vao: VertexArrayObject | null = null;
    protected indexBuffer: RenderBuffer | null = null;
    protected vertexBuffer: RenderBuffer | null = null;

    protected constructor(batchSize: number, attributeCount: number, vertexSource: string, fragmentSource: string) {
        this.batchSize = batchSize;
        this.attributeCount = attributeCount;
        this.vertexData = new ArrayBuffer(batchSize * attributeCount * 4);
        this.float32View = new Float32Array(this.vertexData);
        this.uint32View = new Uint32Array(this.vertexData);
        this.indexData = createQuadIndices(batchSize);
        this.shader = new Shader(vertexSource, fragmentSource);
    }

    public connect(renderManager: RenderManager): this {
        if (!this.gl) {
            const gl = renderManager.context;

            this.gl = gl;
            this.renderManager = renderManager;

            this.shader.connect(gl);
            this.indexBuffer = new RenderBuffer(gl, BufferTypes.ELEMENT_ARRAY_BUFFER, this.indexData, BufferUsage.STATIC_DRAW);
            this.vertexBuffer = new RenderBuffer(gl, BufferTypes.ARRAY_BUFFER, this.vertexData, BufferUsage.DYNAMIC_DRAW);

            this.vao = this.createVao(gl, this.indexBuffer, this.vertexBuffer);
        }

        return this;
    }

    public disconnect(): this {
        if (this.gl) {
            this.unbind();

            this.shader.disconnect();

            this.vao!.destroy();
            this.vao = null;

            this.renderManager = null;
            this.gl = null;
        }

        return this;
    }

    public bind(): this {
        if (!this.renderManager) {
            throw new Error('Renderer has to be connected first!')
        }

        this.renderManager.setVao(this.vao);
        this.renderManager.setShader(this.shader);

        return this;
    }

    public unbind(): this {
        if (this.renderManager) {
            this.flush();

            this.renderManager.setShader(null);
            this.renderManager.setVao(null);

            this.currentTexture = null;
            this.currentBlendMode = null;
            this.currentView = null;
            this.currentViewId = -1;
        }

        return this;
    }

    public flush(): this {
        if (this.batchIndex > 0) {
            const view = this.renderManager!.view;

            if (this.currentView !== view || this.currentViewId !== view.updateId) {
                this.currentView = view;
                this.currentViewId = view.updateId;
                this.updateView(view);
            }

            this.renderManager!.setVao(this.vao);
            this.vertexBuffer!.upload(this.float32View.subarray(0, this.batchIndex * this.attributeCount));
            this.vao!.draw(this.batchIndex * 6, 0);
            this.batchIndex = 0;
        }

        return this;
    }

    public destroy(): void {
        this.disconnect();
        this.shader.destroy();
        this.currentTexture = null;
        this.currentBlendMode = null;
        this.currentView = null;
        this.renderManager = null;
        this.gl = null;
    }

    public abstract render(drawable: Drawable): this;
    protected abstract createVao(gl: WebGL2RenderingContext, indexBuffer: RenderBuffer, vertexBuffer: RenderBuffer): VertexArrayObject;
    protected abstract updateView(view: View): this;
}
