import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, ShaderFilter, Sprite } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';



// A dense checkerboard makes the per-channel RGB split read clearly along edges.
const CHECKER = assets.technical.filtering.checker256;

const glsl = `#version 300 es
precision mediump float; uniform sampler2D uTexture; uniform float uOffset; in vec2 vUv; out vec4 fragColor;
void main(){ vec2 o=vec2(uOffset,0.0); float r=texture(uTexture,vUv+o).r; float g=texture(uTexture,vUv).g; float b=texture(uTexture,vUv-o).b; float a=texture(uTexture,vUv).a; fragColor=vec4(r,g,b,a);} `;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
struct Uniforms { uOffset:f32, _pad0:vec3<f32> };
@group(1) @binding(0) var<uniform> uniforms:Uniforms;
@fragment fn fragmentMain(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{
    let o=vec2<f32>(uniforms.uOffset,0.0);
    let r=textureSample(uTexture,uSampler,vUv+o).r;
    let g=textureSample(uTexture,uSampler,vUv).g;
    let b=textureSample(uTexture,uSampler,vUv-o).b;
    let a=textureSample(uTexture,uSampler,vUv).a;
    return vec4<f32>(r,g,b,a);
}`;

// Intensity 0..1 maps to a UV offset in pixels-ish terms; never a no-op at the
// default because we drive uOffset directly from the slider, not pointer X.
const MAX_OFFSET = 0.03;

class ChromaticAberrationScene extends Scene {
    private filter!: ShaderFilter;
    private sprite!: Sprite;
    private intensity = 0.4;
    private hud!: ReturnType<typeof mountControls>;
    private panel!: ReturnType<typeof mountControlPanel>;

    override init(): void {
        const app = this.app;
        const { width, height } = app;

        this.filter = new ShaderFilter({ glsl: { fragment: glsl }, wgsl, uniforms: { uOffset: 0 } });
        this.sprite = new Sprite(this.loader.get(CHECKER)).setAnchor(0.5).setScale(2.6).setPosition(width / 2, height / 2);
        this.sprite.filters = [this.filter];

        // The HUD must exist before applyIntensity() runs - it calls hud.setStatus().
        this.hud = mountControls({
            title: 'Chromatic Aberration',
            controls: [{ keys: 'Intensity', action: 'split the R / B channels apart' }],
            status: this.statusText(),
            hint: 'A fragment-shader filter samples red and blue at opposite UV offsets.',
        });

        this.panel = mountControlPanel({ title: 'Lens' });
        this.panel.addSlider({
            label: 'Intensity',
            min: 0,
            max: 1,
            step: 0.01,
            value: this.intensity,
            onChange: value => {
                this.intensity = value;
                this.applyIntensity();
            },
        });

        this.applyIntensity();
    }

    private applyIntensity(): void {
        this.filter.setUniform('uOffset', this.intensity * MAX_OFFSET);
        this.hud.setStatus(this.statusText());
    }

    private statusText(): string {
        const pct = Math.round(this.intensity * 100);
        const offset = (this.intensity * MAX_OFFSET).toFixed(4);

        return this.intensity === 0 ? 'Intensity: 0% (no split — original)' : `Intensity: ${pct}%  (uOffset ${offset})`;
    }

    override draw(context: RenderingContext): void {
        context.render(this.sprite);
    }
}

const app = new Application({
    scenes: { ChromaticAberrationScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizing: new FixedResolutionCanvasSizing(),
    },
    clearColor: Color.black,
});

app.start(ChromaticAberrationScene);
