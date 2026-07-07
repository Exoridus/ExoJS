import { Application, Color, RenderBackendType, Scene, Sprite, Texture, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

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
    private time = 0;
    private filter!: WebGl2ShaderFilter | WebGpuShaderFilter;
    private sprite!: Sprite;
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const { width, height } = this.app.canvas;

        this.filter =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uTime: 0 } })
                : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uTime: 0 } });
        this.sprite = new Sprite(this.loader.get(Texture, HUE_RAMP)).setAnchor(0.5).setScale(4).setPosition(width / 2, height / 2);
        this.sprite.filters = [this.filter];

        this.hud = mountControls({
            title: 'Custom Fragment Shader',
            status: 'A time-driven sine warp drives the sprite UVs each frame.',
            hint: 'Same GLSL/WGSL source feeds WebGl2ShaderFilter or WebGpuShaderFilter; uTime updates per frame.',
        });
    }

    override update(delta): void {
        this.time += delta.seconds;
        this.filter.uniforms.uTime = this.time;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new CustomFragmentShaderScene());
