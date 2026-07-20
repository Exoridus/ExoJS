import { Application, Color, ColorFilter, RenderBackendType, type RenderingContext, Scene, Sprite, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';



// A full-hue ramp shows tint / desaturate / invert / brightness on every colour.
const HUE_RAMP = assets.technical.color.hueRamp;

type ShaderFilter = WebGl2ShaderFilter | WebGpuShaderFilter;

// --- Desaturate: collapse RGB to luminance. ---------------------------------
const desaturateGlsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main(){ vec4 c=texture(uTexture,vUv); float l=dot(c.rgb,vec3(0.299,0.587,0.114)); fragColor=vec4(vec3(l),c.a); }`;
const desaturateWgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let c=textureSample(uTexture,uSampler,vUv); let l=dot(c.rgb,vec3<f32>(0.299,0.587,0.114)); return vec4<f32>(vec3<f32>(l),c.a); }`;

// --- Invert: 1 - colour (preserves alpha). ----------------------------------
const invertGlsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main(){ vec4 c=texture(uTexture,vUv); fragColor=vec4(vec3(1.0)-c.rgb,c.a); }`;
const invertWgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let c=textureSample(uTexture,uSampler,vUv); return vec4<f32>(vec3<f32>(1.0)-c.rgb,c.a); }`;

// --- Brightness: scale RGB above 1.0 (ColorFilter can only darken). ---------
const brightnessGlsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main(){ vec4 c=texture(uTexture,vUv); fragColor=vec4(min(c.rgb*1.6,vec3(1.0)),c.a); }`;
const brightnessWgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler;
@fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let c=textureSample(uTexture,uSampler,vUv); return vec4<f32>(min(c.rgb*1.6,vec3<f32>(1.0)),c.a); }`;

const PRESETS = ['Tint', 'Desaturate', 'Invert', 'Brightness'] as const;

class ColorFilterScene extends Scene {
    private sprite!: Sprite;
    private tint!: ColorFilter;
    private desaturate!: ShaderFilter;
    private invert!: ShaderFilter;
    private brightness!: ShaderFilter;
    private index = 1; // start on Desaturate - the most visually obvious preset
    private hud!: ReturnType<typeof mountControls>;
    private cycle!: ReturnType<ReturnType<typeof mountControlPanel>['addCycle']>;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.sprite = new Sprite(this.loader.get(HUE_RAMP)).setAnchor(0.5).setScale(4).setPosition(width / 2, height / 2);

        // The built-in ColorFilter multiplies by a solid colour (warm tint here).
        this.tint = new ColorFilter(new Color(255, 160, 120));
        this.desaturate = this.makeShader(desaturateGlsl, desaturateWgsl);
        this.invert = this.makeShader(invertGlsl, invertWgsl);
        this.brightness = this.makeShader(brightnessGlsl, brightnessWgsl);

        this.applyPreset();

        this.hud = mountControls({
            title: 'Color Filter',
            controls: [{ keys: 'Preset', action: 'tint · desaturate · invert · brightness' }],
            status: this.statusText(),
            hint: 'Cycle presets with the ‹ › buttons; the active preset is labelled.',
        });

        this.cycle = mountControlPanel({ title: 'Colour Grade' }).addCycle({
            label: 'Preset',
            options: [...PRESETS],
            index: this.index,
            onChange: index => {
                this.index = index;
                this.applyPreset();
            },
        });
    }

    private makeShader(fragmentGlsl: string, fragmentWgsl: string): ShaderFilter {
        return app.backend.backendType === RenderBackendType.WebGpu ? new WebGpuShaderFilter({ fragmentSource: fragmentWgsl }) : new WebGl2ShaderFilter({ fragmentSource: fragmentGlsl });
    }

    private applyPreset(): void {
        const filter = [this.tint, this.desaturate, this.invert, this.brightness][this.index];

        this.sprite.filters = [filter];
        this.cycle?.set(this.index);
        this.hud?.setStatus(this.statusText());
    }

    private statusText(): string {
        return `Preset: ${PRESETS[this.index]}  (${this.index + 1}/${PRESETS.length})`;
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

const app = new Application({
    scenes: { ColorFilterScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

app.start(ColorFilterScene);
