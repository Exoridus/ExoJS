// Auto-generated from custom-triangle-renderer.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene } from '@codexo/exojs';
import { WebGpuBackend } from '@codexo/exojs/renderer-sdk';
const TRIANGLE_VERTICES = new Float32Array([0, 0.72, 1, 0.38, 0.23, -0.72, -0.52, 0.18, 0.77, 0.98, 0.72, -0.52, 0.95, 0.85, 0.24]);
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
  pipeline = null;
  pipelineFormat = null;
  vertexBuffer;
  constructor(backend) {
    if (!(backend instanceof WebGpuBackend)) {
      throw new Error('This example requires ExoJS to provide a WebGpuBackend.');
    }
    this.renderManager = backend;
    this.device = backend.device;
    this.vertexBuffer = this.createVertexBuffer();
  }
  draw() {
    // Submit ExoJS's pending clear before the raw command buffer, or the
    // application's end-of-frame flush clears over this triangle afterwards.
    this.renderManager.flush();
    // The frame renders into the application's working target, not the canvas,
    // and the output transform presents it afterwards. Draw into the attachment
    // the backend has bound, and build the pipeline for that attachment's
    // format. The vertex colours are linear, and the sRGB attachment encodes
    // them on write.
    const format = this.renderManager.renderTargetFormat;
    if (this.pipeline === null || this.pipelineFormat !== format) {
      this.pipeline = this.createPipeline(format);
      this.pipelineFormat = format;
    }
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [this.renderManager.createColorAttachment()],
    });
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return this;
  }
  destroy() {
    this.vertexBuffer.destroy();
  }
  createPipeline(format) {
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
            format,
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
class CustomTriangleRendererScene extends Scene {
  triangleRenderer;
  init() {
    const app = this.app;
    this.triangleRenderer = new CustomTriangleRenderer(app.backend);
  }
  draw() {
    this.triangleRenderer.draw();
  }
  destroy() {
    this.triangleRenderer?.destroy();
  }
}
const app = new Application({
  scenes: { CustomTriangleRendererScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  backend: { type: 'webgpu' },
});
app.start(CustomTriangleRendererScene).catch(() => {
  app.element?.remove();
  void app.destroy();
});
