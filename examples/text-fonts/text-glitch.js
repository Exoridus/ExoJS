import { Application, Color, RenderBackendType, Scene, Text, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 900,
        height: 520,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

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
fn main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let r = textureSample(uTexture, uSampler, vUv + vec2(uniforms.uShift, 0.0)).r;
    let g = textureSample(uTexture, uSampler, vUv).g;
    let b = textureSample(uTexture, uSampler, vUv - vec2(uniforms.uShift, 0.0)).b;
    let a = textureSample(uTexture, uSampler, vUv).a;
    return vec4(r, g, b, a);
}`;

app.start(
    new (class extends Scene {
        init() {
            this._text = new Text('SIGNAL LOST', { fill: 'white', fontSize: 100 });
            this._text.setPosition(120, 220);
            this._filter =
                app.backend.backendType === RenderBackendType.WebGpu
                    ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uShift: 0 } })
                    : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uShift: 0 } });
            this._text.filters = [this._filter];
        }
        update() {
            this._filter.uniforms.uShift = (Math.random() - 0.5) * 0.01;
        }
        draw(context) {
            context.backend.clear();
            context.render(this._text);
        }
    })()
);
