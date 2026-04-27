import { Application, Color, Scene, WebGpuRenderManager } from '@codexo/exojs';

const TRIANGLE_VERTICES = new Float32Array([
    0.0, 0.72, 1.0, 0.38, 0.23,
    -0.72, -0.52, 0.18, 0.77, 0.98,
    0.72, -0.52, 0.95, 0.85, 0.24,
]);

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

    constructor(renderManager) {
        if (!(renderManager instanceof WebGpuRenderManager)) {
            throw new Error('This example requires ExoJS to provide a WebGpuRenderManager.');
        }

        this._renderManager = renderManager;
        this._device = renderManager.device;
        this._pipeline = this._createPipeline();
        this._vertexBuffer = this._createVertexBuffer();
    }

    draw() {
        const encoder = this._device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this._renderManager.context.getCurrentTexture().createView(),
                clearValue: {
                    r: 0.05,
                    g: 0.06,
                    b: 0.09,
                    a: 1.0,
                },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });

        pass.setPipeline(this._pipeline);
        pass.setVertexBuffer(0, this._vertexBuffer);
        pass.draw(3);
        pass.end();

        this._device.queue.submit([encoder.finish()]);

        return this;
    }

    destroy() {
        this._vertexBuffer?.destroy();
        this._vertexBuffer = null;
        this._pipeline = null;
    }

    _createPipeline() {
        const shaderModule = this._device.createShaderModule({
            code: SHADER_SOURCE,
        });

        return this._device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vertexMain',
                buffers: [{
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
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragmentMain',
                targets: [{
                    format: this._renderManager.format,
                }],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });
    }

    _createVertexBuffer() {
        const buffer = this._device.createBuffer({
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
    width: 800,
    height: 600,
    clearColor: Color.black,
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(Scene.create({

    init() {
        this._triangleRenderer = new CustomTriangleRenderer(this.app.renderManager);
    },

    draw() {
        this._triangleRenderer.draw();
    },

    unload() {
        this._triangleRenderer?.destroy();
        this._triangleRenderer = null;
    },

    destroy() {
        this._triangleRenderer?.destroy();
        this._triangleRenderer = null;
    },
})).catch((error) => {
    app.canvas.remove();
    app.destroy();

    throw error;
});
