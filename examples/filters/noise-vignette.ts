import { Application, Color, RenderBackendType, Scene, Sprite, Texture, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';

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
precision mediump float; uniform sampler2D uTexture; uniform float uTime; in vec2 vUv; out vec4 fragColor;
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec4 c=texture(uTexture,vUv); float n=(hash(vUv*vec2(800.0,600.0)+uTime*60.0)-0.5)*0.12; float vig=1.0-smoothstep(0.35,0.85,length(vUv-0.5)); fragColor=vec4((c.rgb+n)*vig,c.a);} `;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
struct Uniforms { uTime:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
fn hash(p:vec2<f32>) -> f32 { return fract(sin(dot(p,vec2<f32>(12.9898,78.233)))*43758.5453); }
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    let c=textureSample(uTexture,uSampler,vUv);
    let n=(hash(vUv*vec2<f32>(800.0,600.0)+uniforms.uTime*60.0)-0.5)*0.12;
    let vig=1.0-smoothstep(0.35,0.85,length(vUv-vec2<f32>(0.5)));
    return vec4<f32>((c.rgb+vec3<f32>(n))*vig,c.a);
}`;

class NoiseVignetteScene extends Scene {
    private time = 0;
    private filter!: WebGl2ShaderFilter | WebGpuShaderFilter;
    private sprite!: Sprite;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.filter =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uTime: 0 } })
                : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uTime: 0 } });
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(2).setPosition(400, 300);
        this.sprite.filters = [this.filter];
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

app.start(new NoiseVignetteScene());
