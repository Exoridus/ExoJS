import { Application, Color, RenderBackendType, Scene, Sprite, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

// A detailed full-frame texture so grain + vignette read as a screen-wide post
// effect rather than decorating one small sprite.
const UV_GRID = assets.technical.filtering.uvGrid256;

const glsl = `#version 300 es
precision mediump float; uniform sampler2D uTexture; uniform float uTime; uniform float uIntensity; in vec2 vUv; out vec4 fragColor;
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec4 c=texture(uTexture,vUv); float n=(hash(vUv*vec2(1280.0,720.0)+uTime*60.0)-0.5)*0.18*uIntensity; float vig=1.0-smoothstep(0.35,0.85,length(vUv-0.5))*uIntensity; fragColor=vec4((c.rgb+n)*vig,c.a);} `;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
struct Uniforms { uTime:f32, uIntensity:f32, _pad0:vec2<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
fn hash(p:vec2<f32>) -> f32 { return fract(sin(dot(p,vec2<f32>(12.9898,78.233)))*43758.5453); }
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    let c=textureSample(uTexture,uSampler,vUv);
    let n=(hash(vUv*vec2<f32>(1280.0,720.0)+uniforms.uTime*60.0)-0.5)*0.18*uniforms.uIntensity;
    let vig=1.0-smoothstep(0.35,0.85,length(vUv-vec2<f32>(0.5)))*uniforms.uIntensity;
    return vec4<f32>((c.rgb+vec3<f32>(n))*vig,c.a);
}`;

class NoiseVignetteScene extends Scene {
    private time = 0;
    private intensity = 1;
    private filter!: WebGl2ShaderFilter | WebGpuShaderFilter;
    private sprite!: Sprite;
    private hud!: ReturnType<typeof mountControls>;
    private panel!: ReturnType<typeof mountControlPanel>;

    override async load(loader): Promise<void> {
        await loader.load(UV_GRID);
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.filter =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { uTime: 0, uIntensity: this.intensity } })
                : new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { uTime: 0, uIntensity: this.intensity } });

        // Fill the whole 16:9 frame so the post effect covers the viewport.
        const texture = loader.get(UV_GRID);

        this.sprite = new Sprite(texture).setAnchor(0.5).setPosition(width / 2, height / 2);
        this.sprite.width = width;
        this.sprite.height = height;
        this.sprite.filters = [this.filter];

        this.hud = mountControls({
            title: 'Noise + Vignette',
            controls: [{ keys: 'Intensity', action: 'scale film grain + vignette together' }],
            status: this.statusText(),
            hint: 'A single-pass filter adds animated grain and a radial vignette across the frame.',
        });

        this.panel = mountControlPanel({ title: 'Grade' });
        this.panel.addSlider({
            label: 'Intensity',
            min: 0,
            max: 1,
            step: 0.01,
            value: this.intensity,
            onChange: value => {
                this.intensity = value;
                this.filter.uniforms.uIntensity = value;
                this.hud.setStatus(this.statusText());
            },
        });
    }

    private statusText(): string {
        return this.intensity === 0 ? 'Intensity: 0% (clean frame)' : `Intensity: ${Math.round(this.intensity * 100)}%`;
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
