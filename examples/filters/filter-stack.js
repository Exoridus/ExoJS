// Auto-generated from filter-stack.ts — edit the .ts source, not this file.
import { Application, BlurFilter, Color, ColorFilter, RenderBackendType, Scene, Sprite, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
const PRIMARY_RAMP = assets.technical.color.primaryRamp;
const glsl = `#version 300 es
precision mediump float; uniform sampler2D uTexture; in vec2 vUv; out vec4 fragColor;
void main(){ vec4 c=texture(uTexture,vUv); fragColor=vec4(c.rgb*vec3(1.0,0.9,1.2),c.a);} `;
const wgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler; @fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let c=textureSample(uTexture,uSampler,vUv); return vec4<f32>(c.rgb*vec3<f32>(1.0,0.9,1.2),c.a);} `;
class FilterStackScene extends Scene {
    sprite;
    blur;
    tint;
    custom;
    // The filter chain is applied in this fixed order; each entry can be toggled.
    active = { blur: true, tint: true, custom: true };
    hud;
    panel;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.sprite = new Sprite(this.loader.get(PRIMARY_RAMP)).setAnchor(0.5).setScale(4).setPosition(width / 2, height / 2);
        this.blur = new BlurFilter({ radius: 4, quality: 2 });
        this.tint = new ColorFilter(new Color(140, 210, 255));
        this.custom =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: wgsl })
                : new WebGl2ShaderFilter({ fragmentSource: glsl });
        this.rebuild();
        this.hud = mountControls({
            title: 'Filter Stack',
            controls: [{ keys: 'Blur / Tint / Custom', action: 'toggle each layer independently' }],
            status: this.statusText(),
            hint: 'Filters compose in order: Blur → Tint → Custom. Toggle any subset.',
        });
        this.panel = mountControlPanel({ title: 'Layers' });
        this.panel.addToggle({
            label: 'Blur',
            value: this.active.blur,
            onChange: on => {
                this.active.blur = on;
                this.rebuild();
            },
        });
        this.panel.addToggle({
            label: 'Tint',
            value: this.active.tint,
            onChange: on => {
                this.active.tint = on;
                this.rebuild();
            },
        });
        this.panel.addToggle({
            label: 'Custom',
            value: this.active.custom,
            onChange: on => {
                this.active.custom = on;
                this.rebuild();
            },
        });
    }
    rebuild() {
        const filters = [];
        if (this.active.blur)
            filters.push(this.blur);
        if (this.active.tint)
            filters.push(this.tint);
        if (this.active.custom)
            filters.push(this.custom);
        this.sprite.filters = filters;
        this.hud?.setStatus(this.statusText());
    }
    statusText() {
        const labels = [this.active.blur && 'Blur', this.active.tint && 'Tint', this.active.custom && 'Custom'].filter(Boolean);
        return labels.length > 0 ? `Active: ${labels.join(' → ')}` : 'Active: none (original sprite)';
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
const app = new Application({
    scenes: { FilterStackScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});
app.start(FilterStackScene);
