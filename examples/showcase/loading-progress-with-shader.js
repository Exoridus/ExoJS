// Auto-generated from loading-progress-with-shader.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, ShaderFilter, Sprite, Text } from '@codexo/exojs';
const glsl = `#version 300 es
precision mediump float; uniform float uProgress; in vec2 vUv; out vec4 fragColor;
void main(){ vec2 p=vUv-0.5; float r=length(p); float a=atan(p.y,p.x); float t=(a+3.1415926)/(6.2831852);
float ring=smoothstep(0.18,0.19,r)-smoothstep(0.24,0.25,r); float fill=step(t,uProgress); vec3 col=mix(vec3(0.2),vec3(0.3,0.8,1.0),fill); fragColor=vec4(col*ring,ring); }`;
const wgsl = `
struct Uniforms { uProgress:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
@fragment fn fragmentMain(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    let p=vUv-vec2<f32>(0.5); let r=length(p); let a=atan2(p.y,p.x); let t=(a+3.1415926)/6.2831852;
    let ring=smoothstep(0.18,0.19,r)-smoothstep(0.24,0.25,r); let fill=select(0.0,1.0,t<=uniforms.uProgress);
    let col=mix(vec3<f32>(0.2),vec3<f32>(0.3,0.8,1.0),fill); return vec4<f32>(col*ring,ring);
}`;
class LoadingProgressWithShaderScene extends Scene {
    progress;
    label;
    ring;
    filter;
    init() {
        const app = this.app;
        const { width, height } = app;
        this.progress = { v: 0 };
        this.label = new Text('0%', { fillColor: Color.white, fontSize: 42, align: 'center' });
        this.label.setAnchor(0.5, 0.5).setPosition(width / 2, height / 2);
        this.ring = new Sprite(this.loader.get('image/uv-grid-256.png')).setAnchor(0.5).setScale(2.4).setPosition(width / 2, height / 2);
        this.filter = new ShaderFilter({ glsl: { fragment: glsl }, wgsl, uniforms: { uProgress: 0 } });
        this.ring.filters = [this.filter];
        app.tweens.create(this.progress).to({ v: 1 }, 2.4).start();
    }
    update() {
        this.filter.setUniform('uProgress', this.progress.v);
        this.label.text = `${(this.progress.v * 100) | 0}%`;
    }
    draw(context) {
        context.render(this.ring);
        context.render(this.label);
    }
}
const app = new Application({
    scenes: { LoadingProgressWithShaderScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizing: new FixedResolutionCanvasSizing(),
    },
    clearColor: new Color(14, 18, 28),
    loader: {
        basePath: 'assets/',
    },
});
app.start(LoadingProgressWithShaderScene);
