// Auto-generated from custom-fragment-shader.ts — edit the .ts source, not this file.
import { assets } from '@assets';
import { Application, Color, RenderBackendType, Scene, Sprite, Texture, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
const HUE_RAMP = assets.technical.color.hueRamp;
const glsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform float uTime;
in vec2 vUv;
out vec4 fragColor;
void main(){ vec2 uv=vUv; uv.y += sin((uv.x*12.0)+uTime*3.0)*0.03; fragColor=texture(uTexture,uv); }`;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
struct Uniforms { uTime:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    var uv=vUv;
    uv.y = uv.y + sin((uv.x*12.0)+uniforms.uTime*3.0)*0.03;
    return textureSample(uTexture,uSampler,uv);
}`;
class CustomFragmentShaderScene extends Scene {
    time = 0;
    filter;
    sprite;
    async load(loader) {
        await loader.load(Texture, { hueRamp: HUE_RAMP });
    }
    init(loader) {
        this.filter =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uTime: 0 } })
                : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uTime: 0 } });
        this.sprite = new Sprite(loader.get(Texture, 'hueRamp')).setAnchor(0.5).setScale(3).setPosition(400, 300);
        this.sprite.filters = [this.filter];
    }
    update(delta) {
        this.time += delta.seconds;
        this.filter.uniforms.uTime = this.time;
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new CustomFragmentShaderScene());
