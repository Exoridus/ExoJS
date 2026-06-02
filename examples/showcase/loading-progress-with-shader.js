import { Application, Color, RenderBackendType, Scene, Sprite, Text, Texture, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

const glsl = `#version 300 es
precision mediump float; uniform float uProgress; in vec2 vUv; out vec4 fragColor;
void main(){ vec2 p=vUv-0.5; float r=length(p); float a=atan(p.y,p.x); float t=(a+3.1415926)/(6.2831852);
float ring=smoothstep(0.18,0.19,r)-smoothstep(0.24,0.25,r); float fill=step(t,uProgress); vec3 col=mix(vec3(0.2),vec3(0.3,0.8,1.0),fill); fragColor=vec4(col*ring,ring); }`;
const wgsl = `
struct Uniforms { uProgress:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
@fragment fn main(@location(0) vuvGrid:vec2<f32>)->@location(0) vec4<f32>{
    let p=vUv-vec2<f32>(0.5); let r=length(p); let a=atan2(p.y,p.x); let t=(a+3.1415926)/6.2831852;
    let ring=smoothstep(0.18,0.19,r)-smoothstep(0.24,0.25,r); let fill=select(0.0,1.0,t<=uniforms.uProgress);
    let col=mix(vec3<f32>(0.2),vec3<f32>(0.3,0.8,1.0),fill); return vec4<f32>(col*ring,ring);
}`;

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { uvGrid: 'image/uv-grid-256.png' });
        }
        init(loader) {
            this._progress = { v: 0 };
            this._label = new Text('0%', { fillColor: Color.white, fontSize: 42 });
            this._label.setPosition(360, 410);
            this._ring = new Sprite(loader.get(Texture, 'uvGrid')).setScale(2.2).setPosition(310, 130);
            this._filter =
                app.backend.backendType === RenderBackendType.WebGpu
                    ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uProgress: 0 } })
                    : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uProgress: 0 } });
            this._ring.filters = [this._filter];
            this.app.tweens.create(this._progress).to({ v: 1 }, 2.4).start();
        }
        update() {
            this._filter.uniforms.uProgress = this._progress.v;
            this._label.text = `${(this._progress.v * 100) | 0}%`;
        }
        draw(context) {
            context.backend.clear(new Color(14, 18, 28));
            context.render(this._ring);
            context.render(this._label);
        }
    })()
);
