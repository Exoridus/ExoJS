import { Application, Color, ColorFilter, Keyboard, RenderBackendType, Scene, Sprite, Texture, WebGl2ShaderFilter, WebGpuShaderFilter } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(2).setPosition(400, 300);
            this._tint = new ColorFilter(new Color(255, 160, 120));
            this._gray =
                app.backend.backendType === RenderBackendType.WebGpu
                    ? new WebGpuShaderFilter({ fragmentSource: grayWgsl })
                    : new WebGl2ShaderFilter({ fragmentSource: grayGlsl });
            this._sat =
                app.backend.backendType === RenderBackendType.WebGpu
                    ? new WebGpuShaderFilter({ fragmentSource: satWgsl })
                    : new WebGl2ShaderFilter({ fragmentSource: satGlsl });
            this._mode = 0;
            this._applyMode();
            this.inputs.onTrigger(Keyboard.One, () => {
                this._mode = 0;
                this._applyMode();
            });
            this.inputs.onTrigger(Keyboard.Two, () => {
                this._mode = 1;
                this._applyMode();
            });
            this.inputs.onTrigger(Keyboard.Three, () => {
                this._mode = 2;
                this._applyMode();
            });
        }
        _applyMode() {
            this._sprite.filters = [this._mode === 0 ? this._tint : this._mode === 1 ? this._gray : this._sat];
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
        }
    })()
);
