// Auto-generated from color-filter.ts — edit the .ts source, not this file.
import { technical } from '@assets';
import { Application, Color, ColorFilter, Keyboard, RenderBackendType, Scene, Sprite, Texture, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
const grayGlsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main(){ vec4 c=texture(uTexture,vUv); float l=dot(c.rgb,vec3(0.299,0.587,0.114)); fragColor=vec4(vec3(l),c.a); }`;
const satGlsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main(){ vec4 c=texture(uTexture,vUv); float l=dot(c.rgb,vec3(0.299,0.587,0.114)); fragColor=vec4(mix(vec3(l),c.rgb,1.8),c.a); }`;
const grayWgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler; @fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let c=textureSample(uTexture,uSampler,vUv); let l=dot(c.rgb,vec3<f32>(0.299,0.587,0.114)); return vec4<f32>(vec3<f32>(l),c.a); }`;
const satWgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler; @fragment fn main(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let c=textureSample(uTexture,uSampler,vUv); let l=dot(c.rgb,vec3<f32>(0.299,0.587,0.114)); return vec4<f32>(mix(vec3<f32>(l),c.rgb,1.8),c.a); }`;
const HUE_RAMP = technical.color.hueRamp;
class ColorFilterScene extends Scene {
    sprite;
    tint;
    gray;
    sat;
    mode = 0;
    async load(loader) {
        await loader.load(Texture, { hueRamp: HUE_RAMP });
    }
    init(loader) {
        this.sprite = new Sprite(loader.get(Texture, 'hueRamp')).setAnchor(0.5).setScale(3).setPosition(400, 300);
        this.tint = new ColorFilter(new Color(255, 160, 120));
        this.gray =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: grayWgsl })
                : new WebGl2ShaderFilter({ fragmentSource: grayGlsl });
        this.sat =
            app.backend.backendType === RenderBackendType.WebGpu
                ? new WebGpuShaderFilter({ fragmentSource: satWgsl })
                : new WebGl2ShaderFilter({ fragmentSource: satGlsl });
        this.applyMode();
        this.inputs.onTrigger(Keyboard.One, () => {
            this.mode = 0;
            this.applyMode();
        });
        this.inputs.onTrigger(Keyboard.Two, () => {
            this.mode = 1;
            this.applyMode();
        });
        this.inputs.onTrigger(Keyboard.Three, () => {
            this.mode = 2;
            this.applyMode();
        });
    }
    applyMode() {
        this.sprite.filters = [this.mode === 0 ? this.tint : this.mode === 1 ? this.gray : this.sat];
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new ColorFilterScene());
