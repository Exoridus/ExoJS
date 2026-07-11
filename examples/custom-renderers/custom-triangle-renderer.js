// Auto-generated from custom-triangle-renderer.ts — edit the .ts source, not this file.
import { Application, Color, Scene } from '@codexo/exojs';
import { WebGpuBackend } from '@codexo/exojs/renderer-sdk';
const TRIANGLE_VERTICES = new Float32Array([0.0, 0.72, 1.0, 0.38, 0.23, -0.72, -0.52, 0.18, 0.77, 0.98, 0.72, -0.52, 0.95, 0.85, 0.24]);
const SHADER_SOURCE = `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
};

@vertex
fn vertexMain(
    @location(0) position: vec2<f32>,
    @location(1) color: vec3<f32>,
) -> VertexOutput {
    var output: VertexOutput;

    output.position = vec4<f32>(position, 0.0, 1.0);
    output.color = color;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.color, 1.0);
}
`;
class CustomTriangleRenderer {
    renderManager;
    device;
    pipeline;
    vertexBuffer;
    constructor(backend) {
        if (!(backend instanceof WebGpuBackend)) {
            throw new Error('This example requires ExoJS to provide a WebGpuBackend.');
        }
        this.renderManager = backend;
        this.device = backend.device;
        this.pipeline = this.createPipeline();
        this.vertexBuffer = this.createVertexBuffer();
    }
    draw() {
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.renderManager.context.getCurrentTexture().createView(),
                    clearValue: {
                        r: 0.05,
                        g: 0.06,
                        b: 0.09,
                        a: 1.0,
                    },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });
        pass.setPipeline(this.pipeline);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.draw(3);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        return this;
    }
    destroy() {
        this.vertexBuffer?.destroy();
        this.pipeline = null;
    }
    createPipeline() {
        const shaderModule = this.device.createShaderModule({
            code: SHADER_SOURCE,
        });
        return this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vertexMain',
                buffers: [
                    {
                        arrayStride: 5 * Float32Array.BYTES_PER_ELEMENT,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: 'float32x2',
                            },
                            {
                                shaderLocation: 1,
                                offset: 2 * Float32Array.BYTES_PER_ELEMENT,
                                format: 'float32x3',
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragmentMain',
                targets: [
                    {
                        format: this.renderManager.format,
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });
    }
    createVertexBuffer() {
        const buffer = this.device.createBuffer({
            size: TRIANGLE_VERTICES.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(buffer.getMappedRange()).set(TRIANGLE_VERTICES);
        buffer.unmap();
        return buffer;
    }
}
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    backend: { type: 'webgpu' },
});
class CustomTriangleRendererScene extends Scene {
    triangleRenderer;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        this.triangleRenderer = new CustomTriangleRenderer(app.backend);
    }
    draw() {
        this.triangleRenderer.draw();
    }
    destroy() {
        this.triangleRenderer?.destroy();
    }
}
app.start(new CustomTriangleRendererScene()).catch(() => {
    app.canvas.remove();
    app.destroy();
});
