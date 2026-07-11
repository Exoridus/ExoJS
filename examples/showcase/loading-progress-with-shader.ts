import { Application, Color, RenderBackendType, type RenderingContext, Scene, Sprite, Text, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

const glsl = `#version 300 es
precision mediump float; uniform float uProgress; in vec2 vUv; out vec4 fragColor;
void main(){ vec2 p=vUv-0.5; float r=length(p); float a=atan(p.y,p.x); float t=(a+3.1415926)/(6.2831852);
float ring=smoothstep(0.18,0.19,r)-smoothstep(0.24,0.25,r); float fill=step(t,uProgress); vec3 col=mix(vec3(0.2),vec3(0.3,0.8,1.0),fill); fragColor=vec4(col*ring,ring); }`;
const wgsl = `
struct Uniforms { uProgress:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    let p=vUv-vec2<f32>(0.5); let r=length(p); let a=atan2(p.y,p.x); let t=(a+3.1415926)/6.2831852;
    let ring=smoothstep(0.18,0.19,r)-smoothstep(0.24,0.25,r); let fill=select(0.0,1.0,t<=uniforms.uProgress);
    let col=mix(vec3<f32>(0.2),vec3<f32>(0.3,0.8,1.0),fill); return vec4<f32>(col*ring,ring);
}`;

class LoadingProgressWithShaderScene extends Scene {
    private progress!: { v: number };
    private label!: Text;
    private ring!: Sprite;
    private filter!: WebGl2ShaderFilter | WebGpuShaderFilter;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.progress = { v: 0 };
        this.label = new Text('0%', { fillColor: Color.white, fontSize: 42, align: 'center' });
        this.label.setAnchor(0.5, 0.5).setPosition(width / 2, height / 2);
        this.ring = new Sprite(this.loader.get('image/uv-grid-256.png')).setAnchor(0.5).setScale(2.4).setPosition(width / 2, height / 2);
        this.filter =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uProgress: 0 } })
                : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uProgress: 0 } });
        this.ring.filters = [this.filter];
        app.tweens.create(this.progress).to({ v: 1 }, 2.4).start();
    }

    override update(): void {
        this.filter.uniforms.uProgress = this.progress.v;
        this.label.text = `${(this.progress.v * 100) | 0}%`;
    }

    override draw(context: RenderingContext): void {
        context.backend.clear(new Color(14, 18, 28));
        context.render(this.ring);
        context.render(this.label);
    }
}

app.start(new LoadingProgressWithShaderScene());
