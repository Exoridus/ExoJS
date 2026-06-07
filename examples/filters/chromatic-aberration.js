// Auto-generated from chromatic-aberration.ts — edit the .ts source, not this file.
import { technical } from '@assets';
import { Application, Color, RenderBackendType, Scene, Sprite, Texture, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
const CHECKER = technical.filtering.checker256;
const glsl = `#version 300 es
precision mediump float; uniform sampler2D uTexture; uniform float uOffset; in vec2 vUv; out vec4 fragColor;
void main(){ vec2 o=vec2(uOffset,0.0); float r=texture(uTexture,vUv+o).r; float g=texture(uTexture,vUv).g; float b=texture(uTexture,vUv-o).b; float a=texture(uTexture,vUv).a; fragColor=vec4(r,g,b,a);} `;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
struct Uniforms { uOffset:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    let o=vec2<f32>(uniforms.uOffset,0.0);
    let r=textureSample(uTexture,uSampler,vUv+o).r;
    let g=textureSample(uTexture,uSampler,vUv).g;
    let b=textureSample(uTexture,uSampler,vUv-o).b;
    let a=textureSample(uTexture,uSampler,vUv).a;
    return vec4<f32>(r,g,b,a);
}`;
class ChromaticAberrationScene extends Scene {
    filter;
    sprite;
    async load(loader) {
        await loader.load(Texture, { checker: CHECKER });
    }
    init(loader) {
        this.filter =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uOffset: 0 } })
                : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uOffset: 0 } });
        this.sprite = new Sprite(loader.get(Texture, 'checker')).setAnchor(0.5).setScale(2).setPosition(400, 300);
        this.sprite.filters = [this.filter];
        this.app.input.onPointerMove.add(pointer => {
            const t = Math.max(0, Math.min(1, pointer.x / app.canvas.width));
            this.filter.uniforms.uOffset = (t - 0.5) * 0.03;
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new ChromaticAberrationScene());
