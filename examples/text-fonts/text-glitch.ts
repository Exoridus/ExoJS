import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, ShaderFilter, Text } from '@codexo/exojs';

const glsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform float uShift;
in vec2 vUv;
out vec4 fragColor;
void main() {
    float r = texture(uTexture, vUv + vec2(uShift, 0.0)).r;
    float g = texture(uTexture, vUv).g;
    float b = texture(uTexture, vUv - vec2(uShift, 0.0)).b;
    float a = texture(uTexture, vUv).a;
    fragColor = vec4(r, g, b, a);
}`;

const wgsl = `
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
struct Uniforms { uShift: f32, _pad0: vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms: Uniforms;
@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let r = textureSample(uTexture, uSampler, vUv + vec2(uniforms.uShift, 0.0)).r;
    let g = textureSample(uTexture, uSampler, vUv).g;
    let b = textureSample(uTexture, uSampler, vUv - vec2(uniforms.uShift, 0.0)).b;
    let a = textureSample(uTexture, uSampler, vUv).a;
    return vec4(r, g, b, a);
}`;

class TextGlitchScene extends Scene {
  private text!: Text;
  private filter!: ShaderFilter;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.text = new Text('SIGNAL LOST', { fillColor: Color.white, fontSize: 100, align: 'center' });
    this.text.setAnchor(0.5, 0.5);
    this.text.setPosition(width / 2, height / 2);
    this.filter = new ShaderFilter({ glsl: { fragment: glsl }, wgsl, uniforms: { uShift: 0 } });
    this.text.filters = [this.filter];
  }

  override update(): void {
    this.filter.setUniform('uShift', (Math.random() - 0.5) * 0.01);
  }

  override draw(context: RenderingContext): void {
    context.render(this.text);
  }
}

const app = new Application({
  scenes: { TextGlitchScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});

app.start(TextGlitchScene);
