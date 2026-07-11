// Auto-generated from water-mirror.ts — edit the .ts source, not this file.
import { Application, CallbackRenderPass, Color, RenderBackendType, RenderNodePass, RenderPipeline, RenderTexture, Scene, Sprite, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
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
precision mediump float; uniform sampler2D uTexture; uniform float uTime; in vec2 vUv; out vec4 fragColor;
void main(){ vec2 uv=vUv; uv.y += sin(uv.x*18.0+uTime*2.8)*0.025; vec4 c=texture(uTexture,uv); fragColor=vec4(c.rgb*vec3(0.72,0.85,1.0),c.a*0.85); }`;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
struct Uniforms { uTime:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    var uv=vUv; uv.y = uv.y + sin(uv.x*18.0+uniforms.uTime*2.8)*0.025;
    let c=textureSample(uTexture,uSampler,uv); return vec4<f32>(c.rgb*vec3<f32>(0.72,0.85,1.0),c.a*0.85);
}`;
class WaterMirrorScene extends Scene {
    rt;
    source;
    mirror;
    filter;
    pipeline;
    time = 0;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const half = height / 2;
        this.rt = new RenderTexture(width, half);
        this.source = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, half / 2).setScale(2.6);
        // Flip the captured top half down into the bottom half for the mirrored reflection.
        this.mirror = new Sprite(this.rt).setPosition(0, height).setScale(1, -1);
        this.filter =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uTime: 0 } })
                : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uTime: 0 } });
        this.mirror.filters = [this.filter];
        // Capture the source into a target (camera view → a callback), then composite the source and
        // its filtered, flipped mirror to the screen.
        this.pipeline = new RenderPipeline()
            .addPass(new CallbackRenderPass((context) => {
            context.backend.clear();
            context.render(this.source);
        }, { target: this.rt }))
            .addPass(new RenderNodePass(this.source, { clear: new Color(18, 24, 36) }))
            .addPass(new RenderNodePass(this.mirror));
    }
    update(delta) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const quarter = height / 4;
        this.time += delta.seconds;
        this.source.setPosition(width / 2 + Math.cos(this.time * 1.7) * (width * 0.3), quarter + Math.sin(this.time * 1.3) * (quarter * 0.55));
        this.filter.uniforms.uTime = this.time;
    }
    draw(context) {
        this.pipeline.execute(context);
    }
    destroy() {
        // Pipeline cascades destroy() to its passes; the caller-owned target and shader filter are freed here.
        this.pipeline.destroy();
        this.rt.destroy();
        this.filter.destroy();
        super.destroy();
    }
}
app.start(new WaterMirrorScene());
